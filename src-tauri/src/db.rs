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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Credential {
    pub id: Option<i64>,
    pub name: String,
    pub username: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chat {
    pub id: Option<i64>,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: Option<i64>,
    pub chat_id: i64,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SanitizeRule {
    pub id: Option<i64>,
    pub session_id: i64,
    pub pattern: String,
    pub replacement: String,
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
        CREATE TABLE IF NOT EXISTS credentials (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            username    TEXT NOT NULL,
            password    TEXT,
            private_key TEXT,
            passphrase  TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clipboard_history (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            content   TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS chats (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id   INTEGER NOT NULL,
            role      TEXT NOT NULL,
            content   TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS sanitize_rules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  INTEGER NOT NULL,
            pattern     TEXT NOT NULL,
            replacement TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES connections(id) ON DELETE CASCADE
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

pub fn move_to_group(conn: &Connection, id: i64, group_name: &str) -> Result<()> {
    ensure_group(conn, group_name)?;
    conn.execute("UPDATE connections SET group_name=?1 WHERE id=?2", params![group_name, id])?;
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

// Credential CRUD
pub fn get_credentials(conn: &Connection) -> Result<Vec<Credential>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, username, password, private_key, passphrase FROM credentials ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Credential {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            username: row.get(2)?,
            password: row.get(3)?,
            private_key: row.get(4)?,
            passphrase: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_credential(conn: &Connection, cred: &Credential) -> Result<i64> {
    if let Some(id) = cred.id {
        conn.execute(
            "UPDATE credentials SET name=?1, username=?2, password=?3, private_key=?4, passphrase=?5 WHERE id=?6",
            params![cred.name, cred.username, cred.password, cred.private_key, cred.passphrase, id],
        )?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO credentials (name, username, password, private_key, passphrase) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![cred.name, cred.username, cred.password, cred.private_key, cred.passphrase],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn delete_credential(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM credentials WHERE id=?1", params![id])?;
    Ok(())
}

// AI Chat CRUD
pub fn get_chats(conn: &Connection) -> Result<Vec<Chat>> {
    let mut stmt = conn.prepare("SELECT id, title, created_at FROM chats ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Chat {
            id: Some(row.get(0)?),
            title: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn create_chat(conn: &Connection, title: &str) -> Result<i64> {
    conn.execute("INSERT INTO chats (title) VALUES (?1)", params![title])?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_chat(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM messages WHERE chat_id=?1", params![id])?; // Optional cleanup
    conn.execute("DELETE FROM chats WHERE id=?1", params![id])?;
    Ok(())
}

pub fn get_messages(conn: &Connection, chat_id: i64) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare("SELECT id, chat_id, role, content, timestamp FROM messages WHERE chat_id=?1 ORDER BY timestamp ASC")?;
    let rows = stmt.query_map(params![chat_id], |row| {
        Ok(Message {
            id: Some(row.get(0)?),
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            timestamp: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn add_message(conn: &Connection, chat_id: i64, role: &str, content: &str) -> Result<i64> {
    conn.execute("INSERT INTO messages (chat_id, role, content) VALUES (?1, ?2, ?3)", params![chat_id, role, content])?;
    Ok(conn.last_insert_rowid())
}

pub fn get_sanitize_rules(conn: &Connection, session_id: i64) -> Result<Vec<SanitizeRule>> {
    let mut stmt = conn.prepare("SELECT id, session_id, pattern, replacement FROM sanitize_rules WHERE session_id = ?1")?;
    let rows = stmt.query_map(params![session_id], |row| {
        Ok(SanitizeRule {
            id: Some(row.get(0)?),
            session_id: row.get(1)?,
            pattern: row.get(2)?,
            replacement: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn add_sanitize_rule(conn: &Connection, session_id: i64, pattern: &str, replacement: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO sanitize_rules (session_id, pattern, replacement) VALUES (?1, ?2, ?3)",
        params![session_id, pattern, replacement],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_sanitize_rule(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM sanitize_rules WHERE id = ?1", params![id])?;
    Ok(())
}
