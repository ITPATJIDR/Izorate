use std::sync::Arc;
use russh::{client, ChannelMsg};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, mpsc};
use std::collections::HashMap;
use crate::db::ConnectionConfig;
use std::future::Future;

pub struct SshManager {
    pub active: Mutex<HashMap<i64, mpsc::Sender<SshCmd>>>,
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

struct DummyHandler;

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

    // Authenticate
    let auth_res = if let Some(pwd) = config.password {
        session.authenticate_password(config.username, pwd).await
    } else {
        return Err("Key auth not yet implemented. Please use password.".into());
    };

    let auth_status = auth_res.map_err(|e| format!("Auth error: {}", e))?;
    if !matches!(auth_status, russh::client::AuthResult::Success) {
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

    // Set up mpsc channel for React -> Rust commands
    let (tx, mut rx) = mpsc::channel::<SshCmd>(100);

    // Save tx to state
    let state = app.state::<SshManager>();
    state.active.lock().await.insert(id, tx);

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
                            let text = String::from_utf8_lossy(data).to_string();
                            let _ = app.emit(&format!("ssh-out-{}", id), text);
                        }
                        Some(ChannelMsg::ExtendedData { ref data, .. }) => {
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
                            let _ = channel.data(text.into_bytes().as_slice()).await;
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
