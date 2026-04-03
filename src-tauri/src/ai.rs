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

const UNIVERSAL_EXTRACTOR_PROMPT: &str = r#"You are a universal knowledge graph extractor.
Before extracting, you MUST reason through the input using this internal process:

STEP 1 — IDENTIFY: What kind of input is this? (log, config, CLI output, SQL, prose, IaC, unknown)
STEP 2 — SCAN FOR NOUNS: List every named thing (services, machines, files, errors, users, ports, resources...)
STEP 3 — SCAN FOR VERBS/ACTIONS: List every interaction (connects, deploys, reads, fails, exposes, manages...)
STEP 4 — MAP TO TYPES: For each noun → pick the closest entity type. If none fits, use "Resource".
STEP 5 — BUILD RELATIONSHIPS: For each verb/action → link source → target with closest rel_type. If none fits, use "CONNECTS_TO".
STEP 6 — OUTPUT: Emit only the final JSON.

This reasoning is internal. OUTPUT ONLY the final JSON.

ENTITY TYPES (use "Resource" if nothing fits):
Service | Config | Error | Container | Network | Port | User | File | Database | Queue | Cluster | Node 
| Volume | Secret | Namespace | Pod | Deployment | ReplicaSet | Proxy | Pipeline | Job | Stage | Resource 
| Policy | Role | Bucket | Function | LoadBalancer | Certificate | Endpoint | Region | Zone | Table | Schema 
| Index | Topic | Subscription | Rule | Gateway | Registry | Repository | Artifact | Environment | Host 
| Process | Connection | Token | Key

RELATIONSHIP TYPES (use "CONNECTS_TO" if nothing fits):
DEPENDS_ON | DEFINES | ERRORS_IN | RUNS_ON | CONNECTS_TO | CONTAINS | EXPOSES | MANAGES | PROXIES 
| DEPLOYS_TO | TRIGGERS | INHERITS | READS_FROM | WRITES_TO | AUTHENTICATES | ROUTES_TO | SCALES 
| MONITORS | OWNS | REPLICATES

OUTPUT FORMAT (strict, no exceptions):
{
  "entities": [{"id": "snake_case_id", "type": "...", "properties": {"key": "string"}}],
  "relationships": [{"source": "id", "target": "id", "rel_type": "..."}]
}

RULES:
- Output ONLY raw JSON. No markdown. No explanation.
- IDs: lowercase snake_case, unique, short.
- Properties values: strings only, no nested objects.
- Extract ONLY what is present. Never hallucinate.
- Merge duplicates into one entity.
- Unknown format? Apply STEP 1-5 anyway — every input has nouns and verbs.
- Placeholders like <IP_01> or <SECRET>: use as-is.

FEW-SHOT EXAMPLES:
Input: "kubectl get pods shows nginx-7f4b5c8d9-abc12 Running on node worker-01"
Output: {"entities":[{"id":"nginx","type":"Pod","properties":{"full_name":"nginx-7f4b5c8d9-abc12","status":"Running"}},{"id":"worker_01","type":"Node","properties":{}}],"relationships":[{"source":"nginx","target":"worker_01","rel_type":"RUNS_ON"}]}

Input: "docker ps shows redis:7.2 on port 6379 and postgres:16 on port 5432"
Output: {"entities":[{"id":"redis","type":"Container","properties":{"image":"redis:7.2"}},{"id":"postgres","type":"Container","properties":{"image":"postgres:16"}},{"id":"port_6379","type":"Port","properties":{"port":"6379","protocol":"TCP"}},{"id":"port_5432","type":"Port","properties":{"port":"5432","protocol":"TCP"}}],"relationships":[{"source":"redis","target":"port_6379","rel_type":"EXPOSES"},{"source":"postgres","target":"port_5432","rel_type":"EXPOSES"}]}"#;

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
                "max_tokens": 4096,
            });

            let res = client.post("https://api.anthropic.com/v1/messages")
                .headers(headers)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            v["content"][0]["text"].as_str().map(|s| s.to_string()).ok_or_else(|| format!("AI Error: {:?}", v))?
        },
        "Google" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model, api_key
            );

            let body = serde_json::json!({
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": format!("System: {}\n\nUser: {}", system_msg, user_msg)}]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 4096,
                }
            });

            let res = client.post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let v: Value = res.json().await.map_err(|e| e.to_string())?;
            v["candidates"][0]["content"]["parts"][0]["text"].as_str().map(|s| s.to_string()).ok_or_else(|| format!("AI Error: {:?}", v))?
        },
        _ => return Err("Unsupported provider".to_string()),
    };

    println!("\n--- [AI RESPONSE: {}] ---", provider);
    println!("{}", response_text);
    println!("--- [END RESPONSE] ---\n");

    Ok(response_text)
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
