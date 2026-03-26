use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: Option<i64>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub conn_type: String,
    pub username: String,
    pub password: Option<String>,
    pub group_name: String,
}

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS groups (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        INSERT OR IGNORE INTO groups (name) VALUES ('Default');

        CREATE TABLE IF NOT EXISTS connections (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            host       TEXT NOT NULL,
            port       INTEGER NOT NULL DEFAULT 22,
            conn_type  TEXT NOT NULL DEFAULT 'ssh',
            username   TEXT NOT NULL,
            password   TEXT,
            group_name TEXT NOT NULL DEFAULT 'Default'
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clipboard_history (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            content   TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )
}

pub fn get_groups(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT name FROM groups ORDER BY id")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

pub fn ensure_group(conn: &Connection, name: &str) -> Result<()> {
    conn.execute("INSERT OR IGNORE INTO groups (name) VALUES (?1)", params![name])?;
    Ok(())
}

pub fn rename_group(conn: &Connection, old_name: &str, new_name: &str) -> Result<()> {
    // Prevent modifying the system Default group
    if old_name.eq_ignore_ascii_case("default") { return Ok(()); }
    conn.execute("UPDATE groups SET name=?1 WHERE name=?2", params![new_name, old_name])?;
    conn.execute("UPDATE connections SET group_name=?1 WHERE group_name=?2", params![new_name, old_name])?;
    Ok(())
}

pub fn delete_group(conn: &Connection, name: &str) -> Result<()> {
    // Prevent deleting the Default group
    if name.eq_ignore_ascii_case("default") { return Ok(()); }
    // Rescue connections in the group by moving them to Default
    conn.execute("UPDATE connections SET group_name='Default' WHERE group_name=?1", params![name])?;
    // Delete the group itself
    conn.execute("DELETE FROM groups WHERE name=?1", params![name])?;
    Ok(())
}

pub fn get_all(conn: &Connection) -> Result<Vec<ConnectionConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, host, port, conn_type, username, password, group_name FROM connections ORDER BY id"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ConnectionConfig {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            conn_type: row.get(4)?,
            username: row.get(5)?,
            password: row.get(6)?,
            group_name: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn insert(conn: &Connection, cfg: &ConnectionConfig) -> Result<i64> {
    ensure_group(conn, &cfg.group_name)?;
    conn.execute(
        "INSERT INTO connections (name, host, port, conn_type, username, password, group_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![cfg.name, cfg.host, cfg.port, cfg.conn_type, cfg.username, cfg.password, cfg.group_name],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update(conn: &Connection, cfg: &ConnectionConfig) -> Result<()> {
    let id = cfg.id.ok_or(rusqlite::Error::InvalidParameterName("id required".into()))?;
    ensure_group(conn, &cfg.group_name)?;
    conn.execute(
        "UPDATE connections SET name=?1, host=?2, port=?3, conn_type=?4, username=?5, password=?6, group_name=?7 WHERE id=?8",
        params![cfg.name, cfg.host, cfg.port, cfg.conn_type, cfg.username, cfg.password, cfg.group_name, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM connections WHERE id=?1", params![id])?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
    if let Some(res) = rows.next() {
        Ok(Some(res?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn add_clipboard_history(conn: &Connection, content: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO clipboard_history (content) VALUES (?1)",
        params![content],
    )?;
    Ok(())
}
