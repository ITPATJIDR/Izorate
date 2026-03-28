use std::sync::Arc;
use russh::{client, ChannelMsg};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, mpsc};
use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use crate::db::ConnectionConfig;
use russh_sftp::client::SftpSession;
use tokio::io::AsyncWriteExt;

pub struct SshConnection {
    pub tx: mpsc::Sender<SshCmd>,
    pub rx_bytes: Arc<AtomicUsize>,
    pub tx_bytes: Arc<AtomicUsize>,
    pub sftp: Option<Arc<tokio::sync::Mutex<SftpSession>>>,
}

pub struct SshManager {
    pub active: Mutex<HashMap<i64, SshConnection>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }
}

pub enum SshCmd {
    Write(String),
    Resize(u32, u32),
    #[allow(dead_code)]
    Close,
}

pub struct DummyHandler;

impl client::Handler for DummyHandler {
    type Error = russh::Error;
    fn check_server_key(&mut self, _pk: &russh::keys::PublicKey) -> impl Future<Output = Result<bool, Self::Error>> + Send {
        async { Ok(true) }
    }
}

pub async fn connect_to_server(app: AppHandle, id: i64, config: ConnectionConfig) -> Result<(), String> {
    let ssh_config = Arc::new(client::Config::default());

    let host_port = format!("{}:{}", config.host, config.port);
    
    // Connect to server
    let mut session = client::connect(ssh_config, host_port, DummyHandler).await
        .map_err(|e| format!("Connect error: {}", e))?;

    let rx_counter = Arc::new(AtomicUsize::new(0));
    let tx_counter = Arc::new(AtomicUsize::new(0));
    
    // Set up mpsc channel for React -> Rust commands
    let (tx, mut rx) = mpsc::channel::<SshCmd>(100);

    // Save tx to state EARLY so we can receive password from write_pty if needed
    {
        let state = app.state::<SshManager>();
        state.active.lock().await.insert(id, SshConnection {
            tx: tx.clone(),
            rx_bytes: rx_counter.clone(),
            tx_bytes: tx_counter.clone(),
            sftp: None,
        });
    }

    // Authenticate
    let auth_status = if let Some(pwd) = config.password {
        session.authenticate_password(config.username, pwd).await
            .map_err(|e| format!("Auth error: {}", e))?
    } else {
        // Manual password prompt
        let _ = app.emit(&format!("ssh-out-{}", id), format!("\r\n[Izorate] Password for {}@{}: ", config.username, config.host));
        
        let mut pwd_buf = String::new();
        loop {
            match rx.recv().await {
                Some(SshCmd::Write(data)) => {
                    if data == "\r" || data == "\n" {
                        let _ = app.emit(&format!("ssh-out-{}", id), "\r\n");
                        break;
                    } else if data == "\x7f" || data == "\x08" { // Backspace
                        pwd_buf.pop();
                    } else if data.len() == 1 {
                        // Collect but don't echo
                        pwd_buf.push_str(&data);
                    } else {
                        // Likely a paste or chunk
                        pwd_buf.push_str(&data);
                    }
                }
                _ => {
                    let state = app.state::<SshManager>();
                    state.active.lock().await.remove(&id);
                    return Err("Connection aborted or channel closed".into());
                }
            }
        }
        session.authenticate_password(config.username, pwd_buf).await
            .map_err(|e| format!("Auth error: {}", e))?
    };

    if !matches!(auth_status, russh::client::AuthResult::Success) {
        let state = app.state::<SshManager>();
        state.active.lock().await.remove(&id);
        let _ = app.emit(&format!("ssh-out-{}", id), "\r\n\x1b[31m[Authentication Failed]\x1b[0m\r\n");
        return Err("Authentication failed".into());
    }

    // Open channel
    let mut channel = session.channel_open_session().await.map_err(|e| e.to_string())?;

    // Request PTY
    channel.request_pty(false, "xterm-256color", 80, 24, 0, 0, &[]).await
        .map_err(|e| format!("PTY error: {}", e))?;

    // Start shell
    channel.request_shell(true).await
        .map_err(|e| format!("Shell error: {}", e))?;

    let rx_c = rx_counter.clone();
    let tx_c = tx_counter.clone();

    // Try to open an SFTP channel as well
    let sftp_channel_res = session.channel_open_session().await;
    let sftp = if let Ok(sftp_channel) = sftp_channel_res {
        if sftp_channel.request_subsystem(true, "sftp").await.is_ok() {
            let stream = sftp_channel.into_stream();
            if let Ok(sftp_session) = SftpSession::new(stream).await {
                Some(Arc::new(tokio::sync::Mutex::new(sftp_session)))
            } else { None }
        } else { None }
    } else { None };

    // Update the connection with SFTP session
    {
        let state = app.state::<SshManager>();
        let mut active = state.active.lock().await;
        if let Some(conn) = active.get_mut(&id) {
            conn.sftp = sftp;
        }
    }

    // Tell React we connected
    app.emit(&format!("ssh-connected-{}", id), ()).unwrap_or(());

    // Spawn task to handle bidirectional IO
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Incoming data from SSH
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { ref data }) => {
                            rx_c.fetch_add(data.len(), Ordering::Relaxed);
                            let text = String::from_utf8_lossy(data).to_string();
                            let _ = app.emit(&format!("ssh-out-{}", id), text);
                        }
                        Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                            rx_c.fetch_add(data.len(), Ordering::Relaxed);
                            let text = String::from_utf8_lossy(data).to_string();
                            let _ = app.emit(&format!("ssh-out-{}", id), text);
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            let _ = app.emit(&format!("ssh-closed-{}", id), ());
                            break;
                        }
                        _ => {}
                    }
                }
                // Incoming commands from React
                cmd = rx.recv() => {
                    match cmd {
                        Some(SshCmd::Write(text)) => {
                            let bytes = text.into_bytes();
                            tx_c.fetch_add(bytes.len(), Ordering::Relaxed);
                            let _ = channel.data(bytes.as_slice()).await;
                        }
                        Some(SshCmd::Resize(cols, rows)) => {
                            let _ = channel.window_change(cols, rows, 0, 0).await;
                        }
                        Some(SshCmd::Close) | None => {
                            let _ = channel.close().await;
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[tauri::command]
pub async fn list_sftp_directory(state: tauri::State<'_, SshManager>, id: i64, path: String) -> Result<Vec<FileInfo>, String> {
    let map = state.active.lock().await;
    let sftp_arc = map.get(&id)
        .and_then(|c| c.sftp.clone())
        .ok_or("SFTP not available on this session")?;
        
    let sftp = sftp_arc.lock().await;
    let dir = sftp.read_dir(path).await.map_err(|e| e.to_string())?;
    
    let mut files = Vec::new();
    for entry in dir {
        let name = entry.file_name();
        
        let mut is_dir = false;
        let mut modified = 0;
        
        let file_type = entry.file_type();
        if file_type.is_dir() {
            is_dir = true;
        }
        let meta = entry.metadata();
        let size = meta.len();
        
        if let Ok(m) = meta.modified() {
            if let Ok(duration) = m.duration_since(std::time::UNIX_EPOCH) {
                modified = duration.as_secs();
            }
        }
        
        files.push(FileInfo { name, is_dir, size, modified });
    }
    
    Ok(files)
}

#[tauri::command]
pub async fn upload_file(state: tauri::State<'_, SshManager>, id: i64, local_path: String, remote_path: String) -> Result<(), String> {
    let map = state.active.lock().await;
    let sftp_arc = map.get(&id)
        .and_then(|c| c.sftp.clone())
        .ok_or("SFTP not available on this session")?;
        
    let sftp = sftp_arc.lock().await;
    let data = tokio::fs::read(&local_path).await.map_err(|e| e.to_string())?;
    
    let mut file = sftp.create(&remote_path).await.map_err(|e| e.to_string())?;
    file.write_all(&data).await.map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn download_file(state: tauri::State<'_, SshManager>, id: i64, remote_path: String, local_path: String) -> Result<(), String> {
    let map = state.active.lock().await;
    let sftp_arc = map.get(&id)
        .and_then(|c| c.sftp.clone())
        .ok_or("SFTP not available on this session")?;
        
    let sftp = sftp_arc.lock().await;
    let data = sftp.read(&remote_path).await.map_err(|e| e.to_string())?;
    
    tokio::fs::write(&local_path, data).await.map_err(|e| e.to_string())?;
    
    Ok(())
}
pub async fn execute_remote_command(
    app: AppHandle,
    _id: i64,
    config: ConnectionConfig,
    cmd_str: String,
    event_name: String,
    manual_password: Option<String>
) -> Result<(), String> {
    let ssh_config = Arc::new(client::Config::default());
    let host_port = format!("{}:{}", config.host, config.port);
    
    // Connect to server
    let mut session = client::connect(ssh_config, host_port, DummyHandler).await
        .map_err(|e| format!("Connect error: {}", e))?;

    // Authenticate
    let pwd = manual_password.or(config.password).ok_or("Password required")?;
    let auth_status = session.authenticate_password(config.username, pwd).await
        .map_err(|e| format!("Auth error: {}", e))?;

    if !matches!(auth_status, russh::client::AuthResult::Success) {
        return Err("Authentication failed".into());
    }

    // Open channel for execution (non-interactive)
    let mut channel = session.channel_open_session().await.map_err(|e| e.to_string())?;
    channel.exec(true, cmd_str).await.map_err(|e| e.to_string())?;

    // Stream output
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { ref data }) => {
                let text = String::from_utf8_lossy(data).to_string();
                // Split by line to emit line-by-line if needed, or just emit as is
                for line in text.lines() {
                    let _ = app.emit(&event_name, line);
                }
            }
            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                let text = String::from_utf8_lossy(data).to_string();
                for line in text.lines() {
                    let _ = app.emit(&event_name, line);
                }
            }
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
