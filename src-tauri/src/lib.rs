mod db;
mod ssh;

use std::sync::Mutex as StdMutex;
use std::fs;
use std::path::PathBuf;
use rusqlite::Connection;
use tauri::{State, AppHandle, Manager};
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
fn save_clipboard_history(app: AppHandle, content: String) -> Result<(), String> {
    let state = app.state::<DbState>();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_clipboard_history(&conn, &content).map_err(|e| e.to_string())
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
            connect_ssh,
            write_pty,
            resize_pty,
            get_ssh_stats,
            measure_latency,
            ssh::list_sftp_directory,
            ssh::upload_file,
            ssh::download_file,
            get_izorate_setting,
            set_izorate_setting,
            save_clipboard_history,
            save_terminal_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
