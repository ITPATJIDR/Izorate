mod db;
mod ssh;
mod network_tools;

use std::sync::Mutex as StdMutex;
use std::fs;
use std::path::PathBuf;
use rusqlite::Connection;
use tauri::{State, AppHandle, Manager, Emitter};
use db::ConnectionConfig;

struct DbState(StdMutex<Connection>);

// [ ... db commands stay the same ... ]
#[tauri::command]
fn get_connections(state: State<DbState>) -> Result<Vec<ConnectionConfig>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_all(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_groups(state: State<DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_groups(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_group(state: State<DbState>, name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::ensure_group(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_group(state: State<DbState>, old_name: String, new_name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::rename_group(&conn, &old_name, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_group(state: State<DbState>, name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_group(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_connection(state: State<DbState>, config: ConnectionConfig) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &config).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_connection(state: State<DbState>, config: ConnectionConfig) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update(&conn, &config).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_connection(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete(&conn, id).map_err(|e| e.to_string())
}

// Credential Commands
#[tauri::command]
fn get_credentials(state: State<DbState>) -> Result<Vec<db::Credential>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_credentials(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn upsert_credential(state: State<DbState>, cred: db::Credential) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::upsert_credential(&conn, &cred).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_credential(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_credential(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_connection_group(state: State<DbState>, id: i64, group_name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::move_to_group(&conn, id, &group_name).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_chats(state: State<DbState>) -> Result<Vec<db::Chat>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_chats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_chat(state: State<DbState>, title: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_chat(&conn, &title).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_chat(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_chat(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_messages(state: State<DbState>, chat_id: i64) -> Result<Vec<db::Message>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_messages(&conn, chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_message(state: State<DbState>, chat_id: i64, role: String, content: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_message(&conn, chat_id, &role, &content).map_err(|e| e.to_string())
}

// SSH Commands
#[tauri::command]
async fn connect_ssh(app: AppHandle, state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let config = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(id)).ok_or("Connection not found")?
    };
    ssh::connect_to_server(app, id, config).await
}

#[tauri::command]
async fn write_pty(state: State<'_, ssh::SshManager>, id: i64, data: String) -> Result<(), String> {
    let mut map = state.active.lock().await;
    if let Some(conn) = map.get_mut(&id) {
        conn.tx.send(ssh::SshCmd::Write(data)).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn resize_pty(state: State<'_, ssh::SshManager>, id: i64, cols: u32, rows: u32) -> Result<(), String> {
    let mut map = state.active.lock().await;
    if let Some(conn) = map.get_mut(&id) {
        conn.tx.send(ssh::SshCmd::Resize(cols, rows)).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn disconnect_ssh(state: State<'_, ssh::SshManager>, id: i64) -> Result<(), String> {
    let mut map = state.active.lock().await;
    if let Some(conn) = map.remove(&id) {
        // Close signals the SSH task to exit its loop cleanly
        let _ = conn.tx.send(ssh::SshCmd::Close).await;
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct SshStats {
    rx: usize,
    tx: usize,
}

#[tauri::command]
async fn get_ssh_stats(state: State<'_, ssh::SshManager>, id: i64) -> Result<SshStats, String> {
    let map = state.active.lock().await;
    if let Some(conn) = map.get(&id) {
        Ok(SshStats {
            rx: conn.rx_bytes.load(std::sync::atomic::Ordering::Relaxed),
            tx: conn.tx_bytes.load(std::sync::atomic::Ordering::Relaxed),
        })
    } else {
        Err("Not found".into())
    }
}

#[tauri::command]
async fn measure_latency(host: String, port: u16) -> Result<u64, String> {
    let start = std::time::Instant::now();
    match tokio::net::TcpStream::connect((host.as_str(), port)).await {
        Ok(_) => Ok(start.elapsed().as_millis() as u64),
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
fn get_izorate_setting(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let state = app.state::<DbState>();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_izorate_setting(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let state = app.state::<DbState>();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn emit_terminal_selection(app: AppHandle, text: String, session_name: String, session_id: i64) -> Result<(), String> {
    app.emit("terminal-selection-to-ai", serde_json::json!({
        "text": text,
        "sessionName": session_name,
        "sessionId": session_id
    })).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sanitize_rules(state: tauri::State<'_, DbState>, session_id: i64) -> Result<Vec<db::SanitizeRule>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_sanitize_rules(&conn, session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_sanitize_rule(state: tauri::State<'_, DbState>, session_id: i64, pattern: String, replacement: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_sanitize_rule(&conn, session_id, &pattern, &replacement).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_sanitize_rule(state: tauri::State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_sanitize_rule(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_clipboard_history(app: AppHandle, content: String) -> Result<(), String> {
    let state = app.state::<DbState>();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_clipboard_history(&conn, &content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ping_host(app: AppHandle, state: State<'_, DbState>, host: String, count: u32, source_session_id: i64, password: Option<String>, mode: network_tools::ImplementationMode) -> Result<(), String> {
    if source_session_id == -1 {
        // Run locally with hybrid approach (binary → TCP fallback)
        network_tools::ping(&app, &host, count, mode).await?;
    } else {
        // Run remotely via SSH (Assume Linux/Unix remote)
        let config = {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(source_session_id)).ok_or("Session not found")?
        };
        let cmd = format!("ping -c {} {}", count, host);
        ssh::execute_remote_command(app, source_session_id, config, cmd, "ping-result".into(), password).await?;
    }
    Ok(())
}

#[tauri::command]
async fn traceroute_host(app: AppHandle, state: State<'_, DbState>, host: String, source_session_id: i64, password: Option<String>, mode: network_tools::ImplementationMode) -> Result<(), String> {
    if source_session_id == -1 {
        // Run locally with hybrid approach (binary → TCP fallback)
        network_tools::traceroute(&app, &host, mode).await?;
    } else {
        // Run remotely (Assume Linux/Unix remote)
        let config = {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(source_session_id)).ok_or("Session not found")?
        };
        let cmd = format!("traceroute -n -w 1 -q 1 {}", host);
        ssh::execute_remote_command(app, source_session_id, config, cmd, "traceroute-result".into(), password).await?;
    }
    Ok(())
}

#[tauri::command]
async fn get_local_ports(_app: AppHandle, state: State<'_, DbState>, source_session_id: i64, password: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    if source_session_id == -1 {
        // Use pure-Rust netstat2 crate — no external binary needed
        return network_tools::get_listening_ports();
    }

    let stdout = {
        let config = {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(source_session_id)).ok_or("Session not found")?
        };
        let ssh_config = std::sync::Arc::new(russh::client::Config::default());
        let host_port = format!("{}:{}", config.host, config.port);
        let mut session = russh::client::connect(ssh_config, host_port, ssh::DummyHandler).await.map_err(|e| e.to_string())?;
        let pwd = password.or(config.password).ok_or("Password required")?;
        session.authenticate_password(config.username, pwd).await.map_err(|e| e.to_string())?;
        let mut channel = session.channel_open_session().await.map_err(|e| e.to_string())?;
        channel.exec(true, "netstat -tuln").await.map_err(|e| e.to_string())?;
        
        let mut output = String::new();
        loop {
            match channel.wait().await {
                Some(russh::ChannelMsg::Data { ref data }) => output.push_str(&String::from_utf8_lossy(data)),
                Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) | None => break,
                _ => {}
            }
        }
        output
    };

    // Parse remote SSH netstat output
    let mut ports = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            let proto = parts[0].to_uppercase();
            if proto != "TCP" && proto != "UDP" { continue; }
            
            let local_addr = parts.get(3).copied().unwrap_or("");

            if let Some(port_str) = local_addr.split(':').last().or_else(|| local_addr.split('.').last()) {
                if let Ok(port) = port_str.parse::<u32>() {
                    ports.push(serde_json::json!({
                        "protocol": proto,
                        "port": port,
                        "address": local_addr
                    }));
                }
            }
        }
    }
    Ok(ports)
}

#[tauri::command]
async fn check_port_connectivity(host: String, port: u16) -> Result<serde_json::Value, String> {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::{Duration, Instant};

    let addr_str = format!("{}:{}", host, port);
    let start = Instant::now();
    
    let timeout = Duration::from_secs(2);
    let addrs = addr_str.to_socket_addrs().map_err(|e| e.to_string())?;
    
    let mut last_err = String::from("No addresses found");
    for addr in addrs {
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(_) => {
                let duration = start.elapsed();
                return Ok(serde_json::json!({
                    "connected": true,
                    "latency_ms": duration.as_millis() as u64
                }));
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
    }

    Ok(serde_json::json!({
        "connected": false,
        "error": last_err
    }))
}

#[tauri::command]
async fn list_models(provider: String, api_key: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    
    match provider.as_str() {
        "OpenAI" => {
            let res = client.get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
                .map_err(|e| e.to_string())?;
                
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                for m in data {
                    if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                        // Filter for common chat models to keep list useful
                        if id.starts_with("gpt-") || id.contains("o1") {
                            models.push(id.to_string());
                        }
                    }
                }
            }
            models.sort();
            Ok(models)
        },
        "Anthropic" => {
            // Anthropic doesn't have a public list models API yet.
            // Returning standard ones.
            Ok(vec![
                "claude-3-5-sonnet-20240620".to_string(),
                "claude-3-opus-20240229".to_string(),
                "claude-3-haiku-20240307".to_string(),
                "claude-2.1".to_string(),
            ])
        },
        "Google" => {
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", api_key);
            let res = client.get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?;
                
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(data) = json.get("models").and_then(|d| d.as_array()) {
                for m in data {
                    if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                        // name is like "models/gemini-pro"
                        let short_name = name.strip_prefix("models/").unwrap_or(name);
                        if short_name.contains("gemini") {
                            models.push(short_name.to_string());
                        }
                    }
                }
            }
            models.sort();
            Ok(models)
        },
        _ => Err("Unsupported provider for listing models".to_string())
    }
}

#[tauri::command]
async fn check_tool_availability() -> serde_json::Value {
    network_tools::check_availability().await
}

#[tauri::command]
async fn save_terminal_video(app: AppHandle, bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let state = app.state::<DbState>();
    let path = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_setting(&conn, "recording_path")
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| std::env::temp_dir().to_string_lossy().to_string())
    };
    
    let mut full_path = PathBuf::from(path);
    if !full_path.exists() {
        fs::create_dir_all(&full_path).map_err(|e| e.to_string())?;
    }
    full_path.push(filename);
    
    fs::write(&full_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(full_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Keep sqlite file locally
    let conn = Connection::open("../izorate.db").expect("Failed to open database");
    db::init_db(&conn).expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(DbState(StdMutex::new(conn)))
        .manage(ssh::SshManager::new())
        .invoke_handler(tauri::generate_handler![
            get_connections,
            get_groups,
            add_group,
            rename_group,
            delete_group,
            add_connection,
            update_connection,
            delete_connection,
            get_credentials,
            upsert_credential,
            delete_credential,
            move_connection_group,
            get_chats,
            create_chat,
            delete_chat,
            get_messages,
            add_message,
            connect_ssh,
            write_pty,
            resize_pty,
            disconnect_ssh,
            get_ssh_stats,
            measure_latency,
            ssh::list_sftp_directory,
            ssh::upload_file,
            ssh::download_file,
            get_izorate_setting,
            set_izorate_setting,
            save_clipboard_history,
            save_terminal_video,
            emit_terminal_selection,
            ping_host,
            traceroute_host,
            get_local_ports,
            check_port_connectivity,
            check_tool_availability,
            list_models,
            get_sanitize_rules,
            add_sanitize_rule,
            delete_sanitize_rule
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
