use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub node_type: String,
    pub properties: String, // Stringified JSON
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphRel {
    pub source: String,
    pub target: String,
    pub rel_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphData {
    pub entities: Vec<GraphNode>,
    pub relationships: Vec<GraphRel>,
}

pub struct GraphManager {
    base_path: PathBuf,
}

impl GraphManager {
    pub fn new(base_path: PathBuf) -> Self {
        if !base_path.exists() {
            fs::create_dir_all(&base_path).expect("Failed to create graph storage directory");
        }
        Self { base_path }
    }

    fn get_db_path(&self) -> PathBuf {
        self.base_path.join("graphs.db")
    }

    pub fn init_chat_db(&self, _chat_id: i64) -> Result<(), String> {
        let conn = Connection::open(self.get_db_path()).map_err(|e| e.to_string())?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS nodes (
                id TEXT NOT NULL,
                chat_id INTEGER NOT NULL,
                node_type TEXT NOT NULL,
                properties TEXT,
                PRIMARY KEY (id, chat_id)
            )",
            [],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                rel_type TEXT NOT NULL,
                UNIQUE(chat_id, source_id, target_id, rel_type)
            )",
            [],
        ).map_err(|e| e.to_string())?;

        // Indices for faster lookup
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nodes_chat ON nodes(chat_id)", []).ok();
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rel_chat ON relationships(chat_id)", []).ok();

        Ok(())
    }

    pub fn add_data(&self, chat_id: i64, data: GraphData) -> Result<(), String> {
        let mut conn = Connection::open(self.get_db_path()).map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        for node in data.entities {
            tx.execute(
                "INSERT INTO nodes (id, chat_id, node_type, properties) 
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id, chat_id) DO UPDATE SET 
                    node_type = excluded.node_type, 
                    properties = excluded.properties",
                params![node.id, chat_id, node.node_type, node.properties],
            ).map_err(|e| e.to_string())?;
        }

        for rel in data.relationships {
            tx.execute(
                "INSERT OR IGNORE INTO relationships (chat_id, source_id, target_id, rel_type) 
                 VALUES (?1, ?2, ?3, ?4)",
                params![chat_id, rel.source, rel.target, rel.rel_type],
            ).map_err(|e| format!("Relationship error: {}", e))?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_data(&self, chat_id: i64) -> Result<GraphData, String> {
        if !self.get_db_path().exists() {
            return Ok(GraphData { entities: vec![], relationships: vec![] });
        }

        let conn = Connection::open(self.get_db_path()).map_err(|e| e.to_string())?;

        let mut stmt = conn.prepare("SELECT id, node_type, properties FROM nodes WHERE chat_id = ?1")
            .map_err(|e| e.to_string())?;
        
        let node_iter = stmt.query_map(params![chat_id], |row| {
            Ok(GraphNode {
                id: row.get(0)?,
                node_type: row.get(1)?,
                properties: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut entities = Vec::new();
        for node in node_iter {
            entities.push(node.map_err(|e| e.to_string())?);
        }

        let mut stmt = conn.prepare("SELECT source_id, target_id, rel_type FROM relationships WHERE chat_id = ?1")
            .map_err(|e| e.to_string())?;
        
        let rel_iter = stmt.query_map(params![chat_id], |row| {
            Ok(GraphRel {
                source: row.get(0)?,
                target: row.get(1)?,
                rel_type: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut relationships = Vec::new();
        for rel in rel_iter {
            relationships.push(rel.map_err(|e| e.to_string())?);
        }

        Ok(GraphData {
            entities,
            relationships,
        })
    }

    pub fn get_relevant_data(&self, chat_id: i64, query: &str) -> Result<GraphData, String> {
        let full_data = self.get_data(chat_id)?;
        if full_data.entities.is_empty() {
            return Ok(full_data);
        }

        let query_low = query.to_lowercase();
        let keywords: Vec<&str> = query_low.split_whitespace()
            .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric()))
            .filter(|s| !s.is_empty())
            .collect();

        if keywords.is_empty() {
            return Ok(GraphData { entities: vec![], relationships: vec![] });
        }

        // 1. Identify Seed Nodes
        let mut seed_ids = std::collections::HashSet::new();
        for node in &full_data.entities {
            let id_low = node.id.to_lowercase();
            let type_low = node.node_type.to_lowercase();
            let props_low = node.properties.to_lowercase();

            if keywords.iter().any(|&kw| id_low.contains(kw) || type_low.contains(kw) || props_low.contains(kw)) {
                seed_ids.insert(node.id.clone());
            }
        }

        if seed_ids.is_empty() {
            return Ok(GraphData { entities: vec![], relationships: vec![] });
        }

        // 2. Expand to 1-hop neighbors
        let mut relevant_rels = Vec::new();
        let mut expanded_ids = seed_ids.clone();

        for rel in full_data.relationships {
            if seed_ids.contains(&rel.source) || seed_ids.contains(&rel.target) {
                expanded_ids.insert(rel.source.clone());
                expanded_ids.insert(rel.target.clone());
                relevant_rels.push(rel);
            }
        }

        // 3. Filter final entities
        let relevant_entities = full_data.entities.into_iter()
            .filter(|n| expanded_ids.contains(&n.id))
            .collect();

        Ok(GraphData {
            entities: relevant_entities,
            relationships: relevant_rels,
        })
    }
}
