mod db;
mod ssh;

use std::sync::Mutex as StdMutex;
use rusqlite::Connection;
use tauri::{State, AppHandle};
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
    if let Some(tx) = map.get_mut(&id) {
        tx.send(ssh::SshCmd::Write(data)).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn resize_pty(state: State<'_, ssh::SshManager>, id: i64, cols: u32, rows: u32) -> Result<(), String> {
    let mut map = state.active.lock().await;
    if let Some(tx) = map.get_mut(&id) {
        tx.send(ssh::SshCmd::Resize(cols, rows)).await.map_err(|e| e.to_string())?;
    }
    Ok(())
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
            resize_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
