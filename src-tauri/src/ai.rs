use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphEntity {
    pub id: String,
    pub node_type: String,
    pub properties: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphRel {
    pub source: String,
    pub target: String,
    pub rel_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphOutput {
    pub entities: Vec<GraphEntity>,
    pub relationships: Vec<GraphRel>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AIRequest {
    pub messages: Vec<AIMessage>,
    pub model: String,
    pub temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AIMessage {
    pub role: String,
    pub content: String,
}

const UNIVERSAL_EXTRACTOR_PROMPT: &str = r#"You are a high-precision Knowledge Graph Extractor (SRE & System Architecture focus).
Extract technical entities and their relationships from the input text into a structured JSON.

ENTITY TYPES:
Pod, Container, Node, Service, Config, Error, Network, Port, User, File, Database, Queue, Cluster, Volume, Secret, Namespace, Deployment, ReplicaSet, Proxy, Pipeline, Job, Registry, Host, Process, Connection, Token.

RELATIONSHIP TYPES:
DEPENDS_ON, RUNS_ON, CONNECTS_TO, CONTAINS, EXPOSES, MANAGES, PROXIES, READS_FROM, WRITES_TO, OWNS.

OUTPUT JSON FORMAT:
{
  "entities": [{"id": "snake_case_id", "type": "EntityType", "properties": {"key": "val"}}],
  "relationships": [{"source": "id", "target": "id", "rel_type": "RelType"}]
}

RULES:
1. Output ONLY RAW JSON.
2. IDs: Keep them short, unique, and lowercase snake_case.
3. Properties: Flatten all values to strings.
4. If input is a log/config, focus on the structural components (who connects to whom, what is running where).
5. Extract only what is explicitly present."#;

pub async fn call_ai_backend(
    provider: &str,
    model: &str,
    api_key: &str,
    system_msg: &str,
    user_msg: &str,
    json_mode: bool,
) -> Result<String, String> {
    println!("\n--- [AI REQUEST: {}] ---", provider);
    println!("Model: {}", model);
    println!("System Prompt Length: {} chars", system_msg.len());
    println!("User Message Length: {} chars", user_msg.len());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response_text = match provider {
        "OpenAI" => {
            let mut headers = HeaderMap::new();
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            headers.insert("Authorization", HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?);

            let mut body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg}
                ],
                "temperature": 0.0,
            });

            if json_mode {
                body.as_object_mut().unwrap().insert("response_format".to_string(), serde_json::json!({"type": "json_object"}));
            }

            let res = client.post("https://api.openai.com/v1/chat/completions")
                .headers(headers)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let status = res.status();
            if !status.is_success() {
                let err_body = res.text().await.unwrap_or_default();
                println!("--- [OPENAI ERROR {}] ---\n{}\n------------------", status, err_body);
                return Err(format!("OpenAI API Error ({}): {}", status, err_body));
            }

            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            v["choices"][0]["message"]["content"].as_str().map(|s| s.to_string()).ok_or_else(|| format!("AI Error: {:?}", v))?
        },
        "Anthropic" => {
            let mut headers = HeaderMap::new();
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            headers.insert("x-api-key", HeaderValue::from_str(api_key).map_err(|e| e.to_string())?);
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));

            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "user", "content": user_msg}
                ],
                "system": system_msg,
                "temperature": 0.0,
                "max_tokens": 8192,
            });

            let res = client.post("https://api.anthropic.com/v1/messages")
                .headers(headers)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let status = res.status();
            if !status.is_success() {
                let err_body = res.text().await.unwrap_or_default();
                println!("--- [ANTHROPIC ERROR {}] ---\n{}\n------------------", status, err_body);
                return Err(format!("Anthropic API Error ({}): {}", status, err_body));
            }

            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            v["content"][0]["text"].as_str().map(|s| s.to_string()).ok_or_else(|| format!("AI Error: {:?}", v))?
        },
        "Google" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model, api_key
            );

            // Use official system_instruction field for better instruction following
            let mut generation_config = serde_json::json!({
                "temperature": 0.1,
                "maxOutputTokens": 16384,
            });

            if json_mode {
                generation_config.as_object_mut().unwrap().insert("responseMimeType".to_string(), serde_json::json!("application/json"));
            }

            let body = serde_json::json!({
                "system_instruction": {
                    "parts": [{"text": system_msg}]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": user_msg}]
                    }
                ],
                "generationConfig": generation_config
            });

            let res = client.post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let status = res.status();
            if !status.is_success() {
                let err_body = res.text().await.unwrap_or_default();
                println!("--- [GOOGLE ERROR {}] ---\n{}\n------------------", status, err_body);
                return Err(format!("Google API Error ({}): {}", status, err_body));
            }

            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            
            // Handle empty candidates (safety filters often cause this)
            let candidates = v["candidates"].as_array();
            if candidates.map_or(true, |a| a.is_empty()) {
                println!("--- [GOOGLE NO CANDIDATES] ---\n{:?}\n------------------", v);
                return Err("Google AI returned no candidates. This usually happens due to safety filters or invalid model names.".to_string());
            }

            let candidate = &v["candidates"][0];
            
            // Check why it finished
            if let Some(reason) = candidate["finishReason"].as_str() {
                if reason == "MAX_TOKENS" {
                    println!("--- [GOOGLE WARNING: TRUNCATED DUE TO MAX_TOKENS] ---");
                } else if reason != "STOP" && reason != "SUCCESS" {
                     println!("--- [GOOGLE WARNING: FINISH REASON {}] ---", reason);
                }
            }

            candidate["content"]["parts"][0]["text"].as_str().map(|s| s.to_string()).ok_or_else(|| format!("AI Error (No Text): {:?}", v))?
        },
        _ => return Err("Unsupported provider".to_string()),
    };

    println!("\n--- [AI RESPONSE: {}] ---", provider);
    println!("{}", response_text);
    println!("--- [END RESPONSE] ---\n");

    Ok(response_text)
}

pub async fn list_models(provider: &str, api_key: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    match provider {
        "Google" => {
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", api_key);
            let res = client.get(url).send().await.map_err(|e| e.to_string())?;
            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            
            let mut models = Vec::new();
            if let Some(arr) = v["models"].as_array() {
                for m in arr {
                    if let Some(name) = m["name"].as_str() {
                        models.push(name.replace("models/", ""));
                    }
                }
            }
            Ok(models)
        },
        "Anthropic" => {
            let mut headers = HeaderMap::new();
            headers.insert("x-api-key", HeaderValue::from_str(api_key).map_err(|e| e.to_string())?);
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));

            let res = client.get("https://api.anthropic.com/v1/models")
                .headers(headers)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            
            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(arr) = v["data"].as_array() {
                for m in arr {
                    if let Some(id) = m["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
            Ok(models)
        },
        "OpenAI" => {
            let mut headers = HeaderMap::new();
            headers.insert("Authorization", HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?);

            let res = client.get("https://api.openai.com/v1/models")
                .headers(headers)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            
            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(arr) = v["data"].as_array() {
                for m in arr {
                    if let Some(id) = m["id"].as_str() {
                        // Filter for common chat models to avoid clutter
                        if id.starts_with("gpt-") || id.starts_with("o1-") {
                            models.push(id.to_string());
                        }
                    }
                }
            }
            // Sort models roughly by recency/importance (descending)
            models.sort_by(|a, b| b.cmp(a));
            Ok(models)
        },
        _ => Err("Unsupported provider for listing models".to_string()),
    }
}

pub fn clean_input(input: &str) -> String {
    let mut cleaned = input.to_string();
    
    // Remove ANSI codes
    let ansi_regex = regex::Regex::new(r"\x1B\[[0-9;]*[a-zA-Z]").unwrap();
    cleaned = ansi_regex.replace_all(&cleaned, "").to_string();

    // Prune hex strings > 20 chars
    let hex_regex = regex::Regex::new(r"(?i)[0-9a-f]{40,}").unwrap();
    cleaned = hex_regex.replace_all(&cleaned, |caps: &regex::Captures| {
        format!("{}...", &caps[0][0..12])
    }).to_string();

    // Cap length - Increase from 8000 to 32000 for complex K8s describe
    if cleaned.len() > 32000 {
        cleaned.truncate(32000);
        cleaned.push_str("\n...[input truncated]");
    }

    cleaned
}

pub async fn extract_graph(
    provider: &str,
    model: &str,
    api_key: &str,
    context: &str,
) -> Result<GraphOutput, String> {
    let cleaned = clean_input(context);
    let system_msg = UNIVERSAL_EXTRACTOR_PROMPT;
    
    let res = call_ai_backend(provider, model, api_key, system_msg, &cleaned, true).await?;
    
    // Attempt to parse JSON
    let mut json_str = res.trim();
    if let Some(start) = json_str.find('{') {
        if let Some(end) = json_str.rfind('}') {
            json_str = &json_str[start..=end];
        }
    }

    match serde_json::from_str::<Value>(json_str) {
        Ok(v) => {
            let mut entities = Vec::new();
            let mut relationships = Vec::new();

            // Handle nodes vs entities
            let entity_list = if v["entities"].is_array() { &v["entities"] } else if v["nodes"].is_array() { &v["nodes"] } else { &v["entities"] };

            if let Some(arr) = entity_list.as_array() {
                for e in arr {
                    if let Some(id) = e["id"].as_str() {
                        entities.push(GraphEntity {
                            id: id.to_lowercase().replace(' ', "_"),
                            node_type: e["type"].as_str().or(e["node_type"].as_str()).unwrap_or("Resource").to_string(),
                            properties: serde_json::to_string(&e["properties"]).unwrap_or("{}".into()),
                        });
                    }
                }
            }

            let rel_list = if v["relationships"].is_array() { &v["relationships"] } else if v["links"].is_array() { &v["links"] } else { &v["relationships"] };

            if let Some(arr) = rel_list.as_array() {
                for r in arr {
                    let source = r["source"].as_str().or(r["source_id"].as_str()).or(r["from"].as_str());
                    let target = r["target"].as_str().or(r["target_id"].as_str()).or(r["to"].as_str());
                    
                    if let (Some(s), Some(t)) = (source, target) {
                        relationships.push(GraphRel {
                            source: s.to_lowercase().replace(' ', "_"),
                            target: t.to_lowercase().replace(' ', "_"),
                            rel_type: r["rel_type"].as_str().or(r["type"].as_str()).unwrap_or("CONNECTS_TO").to_string(),
                        });
                    }
                }
            }

            Ok(GraphOutput { entities, relationships })
        }
        Err(e) => Err(format!("Failed to parse AI JSON: {}", e)),
    }
}
