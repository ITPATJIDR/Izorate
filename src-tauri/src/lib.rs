mod db;
mod ssh;
mod network_tools;
mod graph_db;
mod crypto;
mod vault;
mod ai;
// use aws_sdk_s3 as s3;

use tokio::sync::Mutex as AsyncMutex;
use std::fs;
use std::path::PathBuf;
use rusqlite::Connection;
use tauri::{State, AppHandle, Manager, Emitter};
use db::ConnectionConfig;
use vault::VaultManager;

struct DbState {
    conn: AsyncMutex<Connection>,
    vault: VaultManager,
}

struct GraphState(AsyncMutex<graph_db::GraphManager>);

// #[derive(serde::Serialize, serde::Deserialize)]
// pub struct S3Bucket {
//     pub name: String,
//     pub created_at: Option<String>,
// }

// #[derive(serde::Serialize, serde::Deserialize)]
// pub struct S3Object {
//     pub key: String,
//     pub size: u64,
//     pub last_modified: Option<String>,
//     pub is_dir: bool,
// }

// [ ... db commands ... ]
#[tauri::command]
async fn get_connections(state: State<'_, DbState>) -> Result<Vec<ConnectionConfig>, String> {
    let conn = state.conn.lock().await;
    db::get_all(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_groups(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().await;
    db::get_groups(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_group(state: State<'_, DbState>, name: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::ensure_group(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn rename_group(state: State<'_, DbState>, old_name: String, new_name: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::rename_group(&conn, &old_name, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_group(state: State<'_, DbState>, name: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::delete_group(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_connection(state: State<'_, DbState>, config: ConnectionConfig) -> Result<i64, String> {
    let conn = state.conn.lock().await;
    db::insert(&conn, &config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_connection(state: State<'_, DbState>, config: ConnectionConfig) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::update(&conn, &config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_connection(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::delete(&conn, id).map_err(|e| e.to_string())
}

// Credential Commands
#[tauri::command]
async fn get_credentials(state: State<'_, DbState>) -> Result<Vec<db::Credential>, String> {
    let conn = state.conn.lock().await;
    db::get_credentials(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn upsert_credential(state: State<'_, DbState>, cred: db::Credential) -> Result<i64, String> {
    let conn = state.conn.lock().await;
    db::upsert_credential(&conn, &cred).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_credential(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::delete_credential(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn move_connection_group(state: State<'_, DbState>, id: i64, group_name: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::move_to_group(&conn, id, &group_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_chats(state: State<'_, DbState>) -> Result<Vec<db::Chat>, String> {
    let conn = state.conn.lock().await;
    db::get_chats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_chat(state: State<'_, DbState>, title: String) -> Result<i64, String> {
    let conn = state.conn.lock().await;
    db::create_chat(&conn, &title).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_chat(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::delete_chat(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_chat_title(state: State<'_, DbState>, id: i64, title: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::update_chat_title(&conn, id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_messages(state: State<'_, DbState>, chat_id: i64) -> Result<Vec<db::Message>, String> {
    let conn = state.conn.lock().await;
    db::get_messages(&conn, chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_message(state: State<'_, DbState>, chat_id: i64, role: String, content: String) -> Result<i64, String> {
    let conn = state.conn.lock().await;
    db::add_message(&conn, chat_id, &role, &content).map_err(|e| e.to_string())
}

// SSH Commands
#[tauri::command]
async fn connect_ssh(app: AppHandle, state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let config = {
        let conn = state.conn.lock().await;
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
async fn get_izorate_setting(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.conn.lock().await;
    db::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_izorate_setting(state: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::set_setting(&conn, &key, &value, Some(&state.vault)).map_err(|e| e.to_string())
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
async fn get_sanitize_rules(state: tauri::State<'_, DbState>, session_id: i64) -> Result<Vec<db::SanitizeRule>, String> {
    let conn = state.conn.lock().await;
    db::get_sanitize_rules(&conn, session_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_sanitize_rule(state: tauri::State<'_, DbState>, session_id: i64, pattern: String, replacement: String) -> Result<i64, String> {
    let conn = state.conn.lock().await;
    db::add_sanitize_rule(&conn, session_id, &pattern, &replacement).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_sanitize_rule(state: tauri::State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::delete_sanitize_rule(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_clipboard_history(state: State<'_, DbState>, content: String) -> Result<(), String> {
    let conn = state.conn.lock().await;
    db::add_clipboard_history(&conn, &content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_chat_graph(state: State<'_, GraphState>, chat_id: i64, data: graph_db::GraphData) -> Result<(), String> {
    let manager = state.0.lock().await;
    manager.init_chat_db(chat_id).map_err(|e| e.to_string())?;
    manager.add_data(chat_id, data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn extract_graph_backend(state: State<'_, DbState>, context: String) -> Result<ai::GraphOutput, String> {
    let (provider, model, key) = {
        let conn = state.conn.lock().await;
        let p = db::get_setting(&conn, "ai_provider").map_err(|e| e.to_string())?.unwrap_or("OpenAI".to_string());
        let m = db::get_setting(&conn, "ai_model").map_err(|e| e.to_string())?.unwrap_or("gpt-4o".to_string());
        
        let key_name = match p.as_str() {
            "OpenAI" => "openai_api_key",
            "Anthropic" => "anthropic_api_key",
            "Google" => "gemini_api_key",
            _ => return Err("Unsupported provider".to_string()),
        };
        
        let k = db::get_setting(&conn, key_name).map_err(|e| e.to_string())?
            .ok_or(format!("{} not set", key_name))?;
            
        (p, m, k)
    };

    ai::extract_graph(&provider, &model, &key, &context).await
}

#[tauri::command]
async fn chat_with_ai_backend(state: State<'_, DbState>, messages: Vec<ai::AIMessage>) -> Result<String, String> {
    let (provider, model, key) = {
        let conn = state.conn.lock().await;
        let p = db::get_setting(&conn, "ai_provider").map_err(|e| e.to_string())?.unwrap_or("OpenAI".to_string());
        let m = db::get_setting(&conn, "ai_model").map_err(|e| e.to_string())?.unwrap_or("gpt-4o".to_string());
        
        let key_name = match p.as_str() {
            "OpenAI" => "openai_api_key",
            "Anthropic" => "anthropic_api_key",
            "Google" => "gemini_api_key",
            _ => return Err("Unsupported provider".to_string()),
        };
        
        let k = db::get_setting(&conn, key_name).map_err(|e| e.to_string())?
            .ok_or(format!("{} not set", key_name))?;
            
        (p, m, k)
    };

    let latest_user_msg = messages.last().map(|m| m.content.clone()).unwrap_or_default();
    let history_context = messages[0..messages.len().saturating_sub(1)]
        .iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n\n");

    let system_msg = "You are Antigravity, a System Architecture & SRE Expert assistant.";
    let user_msg = format!("History Context:\n{}\n\nQuestion: {}", history_context, latest_user_msg);

    ai::call_ai_backend(&provider, &model, &key, system_msg, &user_msg, false).await
}

#[tauri::command]
async fn get_chat_graph(state: State<'_, GraphState>, chat_id: i64) -> Result<graph_db::GraphData, String> {
    let manager = state.0.lock().await;
    manager.get_data(chat_id)
}

#[tauri::command]
async fn get_relevant_graph(state: State<'_, GraphState>, chat_id: i64, query: String) -> Result<graph_db::GraphData, String> {
    let manager = state.0.lock().await;
    manager.get_relevant_data(chat_id, &query)
}

#[tauri::command]
async fn ping_host(app: AppHandle, state: State<'_, DbState>, host: String, count: u32, source_session_id: i64, password: Option<String>, mode: network_tools::ImplementationMode) -> Result<(), String> {
    if source_session_id == -1 {
        // Run locally with hybrid approach (binary → TCP fallback)
        network_tools::ping(&app, &host, count, mode).await?;
    } else {
        // Run remotely via SSH (Assume Linux/Unix remote)
        let config = {
            let conn = state.conn.lock().await;
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
            let conn = state.conn.lock().await;
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
            let conn = state.conn.lock().await;
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
    ai::list_models(&provider, &api_key).await
}

#[tauri::command]
async fn check_tool_availability() -> serde_json::Value {
    network_tools::check_availability().await
}

// // S3 Commands helper and implementations
// async fn get_s3_client(region: String, access_key: String, secret_key: String) -> aws_sdk_s3::Client {
//     let credentials = aws_sdk_s3::config::Credentials::new(
//         access_key,
//         secret_key,
//         None,
//         None,
//         "izorate"
//     );
//     let region = aws_sdk_s3::config::Region::new(region);
//     let config = aws_sdk_s3::Config::builder()
//         .credentials_provider(credentials)
//         .region(region)
//         .build();
//     aws_sdk_s3::Client::from_conf(config)
// }
// 
// #[tauri::command]
// async fn list_s3_buckets(state: State<'_, DbState>, id: i64) -> Result<Vec<S3Bucket>, String> {
//     let config = {
//         let conn = state.conn.lock().await;
//         db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(id)).ok_or("Connection not found")?
//     };
//     
//     let client = get_s3_client(config.host, config.username, config.password.unwrap_or_default()).await;
//     let resp = client.list_buckets().send().await.map_err(|e| e.to_string())?;
//     
//     let buckets = resp.buckets().iter().map(|b| S3Bucket {
//         name: b.name().unwrap_or("").to_string(),
//         created_at: b.creation_date().map(|d| d.to_string()),
//     }).collect();
//     
//     Ok(buckets)
// }
// 
// #[tauri::command]
// async fn list_s3_objects(state: State<'_, DbState>, id: i64, bucket: String, prefix: String) -> Result<Vec<S3Object>, String> {
//     let config = {
//         let conn = state.conn.lock().await;
//         db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(id)).ok_or("Connection not found")?
//     };
//     
//     let client = get_s3_client(config.host, config.username, config.password.unwrap_or_default()).await;
//     let resp = client.list_objects_v2()
//         .bucket(&bucket)
//         .prefix(&prefix)
//         .delimiter("/")
//         .send().await.map_err(|e| e.to_string())?;
//     
//     let mut objects = Vec::new();
//     
//     // Folders
//     if let Some(cp) = resp.common_prefixes() {
//         for p in cp {
//             objects.push(S3Object {
//                 key: p.prefix().unwrap_or("").to_string(),
//                 size: 0,
//                 last_modified: None,
//                 is_dir: true,
//             });
//         }
//     }
//     
//     // Files
//     if let Some(cont) = resp.contents() {
//         for o in cont {
//             let key = o.key().unwrap_or("").to_string();
//             if key == prefix { continue; }
//             objects.push(S3Object {
//                 key,
//                 size: o.size().unwrap_or(0) as u64,
//                 last_modified: o.last_modified().map(|d| d.to_string()),
//                 is_dir: false,
//             });
//         }
//     }
//     
//     Ok(objects)
// }
// 
// #[tauri::command]
// async fn delete_s3_object(state: State<'_, DbState>, id: i64, bucket: String, key: String) -> Result<(), String> {
//     let config = {
//         let conn = state.conn.lock().await;
//         db::get_all(&conn).unwrap().into_iter().find(|c| c.id == Some(id)).ok_or("Connection not found")?
//     };
//     
//     let client = get_s3_client(config.host, config.username, config.password.unwrap_or_default()).await;
//     client.delete_object().bucket(bucket).key(key).send().await.map_err(|e| e.to_string())?;
//     Ok(())
// }

#[tauri::command]
async fn save_terminal_video(state: State<'_, DbState>, bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let path = {
        let conn = state.conn.lock().await;
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let app_dir = app_handle.path().app_data_dir().expect("Failed to get app data directory");
            
            if !app_dir.exists() {
                fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
            }

            let graph_path = app_dir.join("data").join("graphs");
            if !graph_path.exists() {
                fs::create_dir_all(&graph_path).expect("Failed to create graphs directory");
            }
            let graph_manager = graph_db::GraphManager::new(graph_path);

            let db_path = app_dir.join("data").join("izorate.db");
            let vault_path = app_dir.join("data").join("vault.json");

            if let Some(parent) = db_path.parent() {
                 if !parent.exists() {
                    fs::create_dir_all(parent).expect("Failed to create data parent directory");
                 }
            }

            let conn = Connection::open(db_path).expect("Failed to open database");
            db::init_db(&conn).expect("Failed to initialize database");

            let vault = VaultManager::new(vault_path);
            
            // Recover critical keys from Vault if missing in DB
            let _ = db::recover_from_vault(&conn, &vault);

            app.manage(DbState {
                conn: AsyncMutex::new(conn),
                vault,
            });
            app.manage(GraphState(AsyncMutex::new(graph_manager)));
            app.manage(ssh::SshManager::new());
            Ok(())
        })
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
            get_izorate_setting,
            set_izorate_setting,
            emit_terminal_selection,
            get_sanitize_rules,
            add_sanitize_rule,
            delete_sanitize_rule,
            save_clipboard_history,
            extract_graph_backend,
            chat_with_ai_backend,
            add_chat_graph,
            get_chat_graph,
            get_relevant_graph,
            save_terminal_video,
            ping_host,
            traceroute_host,
            get_local_ports,
            check_port_connectivity,
            check_tool_availability,
            list_models,
            update_chat_title,
//            list_s3_buckets,
//            list_s3_objects,
//            delete_s3_object,
            ssh::list_sftp_directory,
            ssh::upload_file,
            ssh::download_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
