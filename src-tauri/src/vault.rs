use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use crate::crypto::{encrypt, decrypt};

#[derive(Serialize, Deserialize, Default)]
struct VaultContent {
    data: HashMap<String, String>,
}

pub struct VaultManager {
    file_path: PathBuf,
}

impl VaultManager {
    pub fn new(path: PathBuf) -> Self {
        if !path.exists() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let initial = VaultContent::default();
            let _ = fs::write(&path, serde_json::to_string(&initial).unwrap());
        }
        Self { file_path: path }
    }

    fn load(&self) -> VaultContent {
        let content = fs::read_to_string(&self.file_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    }

    fn save(&self, content: &VaultContent) {
        if let Ok(json) = serde_json::to_string(content) {
            let _ = fs::write(&self.file_path, json);
        }
    }

    pub fn set(&self, key: &str, value: &str) {
        let mut content = self.load();
        let encrypted_value = encrypt(value);
        content.data.insert(key.to_string(), encrypted_value);
        self.save(&content);
    }

    pub fn get(&self, key: &str) -> Option<String> {
        let content = self.load();
        content.data.get(key).map(|v| decrypt(v))
    }

    pub fn get_all_critical_keys(&self) -> HashMap<String, String> {
        let content = self.load();
        let mut result = HashMap::new();
        for (k, v) in content.data {
            result.insert(k, decrypt(&v));
        }
        result
    }
}
