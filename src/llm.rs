use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

use std::time::Duration;
use tauri::ipc::Channel;
use crate::config::{load_config, AppConfig};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatRequestPayload {
    pub message: String,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type")]
pub enum ChatStreamEvent {
    #[serde(rename = "thinking")]
    Thinking { delta: String },
    #[serde(rename = "token")]
    Token { delta: String },
    #[serde(rename = "done")]
    Done { elapsed_sec: f64 },
    #[serde(rename = "error")]
    Error { message: String },
}

fn provider_reasoning(packet: &serde_json::Value) -> Option<&str> {
    let first = packet.get("choices")?.get(0)?;
    let delta = first.get("delta").or_else(|| first.get("message"))?;
    delta.get("reasoning_content").or_else(|| delta.get("reasoning"))?.as_str().filter(|s| !s.is_empty())
}

#[cfg(test)]
mod thinking_tests {
    use super::*;
    #[test]
    fn provider_reasoning_is_separate_from_answer() {
        let packet = serde_json::json!({"choices":[{"delta":{"reasoning_content":"provider thought", "content":"answer"}}]});
        assert_eq!(provider_reasoning(&packet), Some("provider thought"));
        assert_eq!(provider_reasoning(&serde_json::json!({"choices":[{"delta":{"content":"answer only"}}]})), None);
    }
}

pub async fn stream_hermes_chat(
    session_id: &str,
    message: &str,
    channel: Channel<ChatStreamEvent>,
    request_id: Option<String>,
) -> Result<(), String> {
    let mut cancellation = crate::chat_cancel::register(request_id)?;
    let config = load_config();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = config.hermes_gateway_url.trim_end_matches('/');
    let url = format!("{}/api/sessions/{}/chat", base_url, session_id);
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if !config.hermes_auth_token.trim().is_empty() {
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", config.hermes_auth_token.trim())) {
            headers.insert(AUTHORIZATION, val);
        }
    }

    let start_time = std::time::Instant::now();
    let body = serde_json::json!({ "message": message });

    let response = cancellation.run(async { client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Hermes Gateway ({}): {}", url, e)) }).await?;

    if !response.status().is_success() {
        let err_text = cancellation.run(async { Ok(response.text().await.unwrap_or_default()) }).await?;
        channel
            .send(ChatStreamEvent::Error {
                message: format!("Gateway error: {}", err_text),
            })
            .ok();
        return Ok(());
    }

    let is_event_stream = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/event-stream"))
        .unwrap_or(false);

    if !is_event_stream {
        let full_body = cancellation.run(async { response.bytes().await.map_err(|e| e.to_string()) }).await?;
        if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&full_body) {
            if let Some(err_val) = json_val.get("error") {
                let err_msg = if let Some(s) = err_val.as_str() {
                    s.to_string()
                } else if let Some(m) = err_val.get("message").and_then(|m| m.as_str()) {
                    m.to_string()
                } else {
                    err_val.to_string()
                };
                channel.send(ChatStreamEvent::Error { message: err_msg }).ok();
                return Ok(());
            }

            if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.get(0) {
                    if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
                    } else if let Some(delta) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
                    }
                }
            } else if let Some(content) = json_val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
            } else if let Some(delta) = json_val.get("delta").and_then(|d| d.as_str()) {
                channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
            }
        }
        let elapsed = start_time.elapsed().as_secs_f64();
        channel.send(ChatStreamEvent::Done { elapsed_sec: elapsed }).ok();
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut byte_buffer = Vec::new();
    let mut has_terminal_error = false;
    let mut token_count = 0;

    while let Some(chunk_res) = cancellation.run(async { Ok(stream.next().await) }).await? {
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                has_terminal_error = true;
                channel
                    .send(ChatStreamEvent::Error {
                        message: format!("Stream read error: {}", e),
                    })
                    .ok();
                break;
            }
        };

        byte_buffer.extend_from_slice(&chunk);

        while let Some(pos) = byte_buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = &byte_buffer[..pos];
            let line = String::from_utf8_lossy(line_bytes).trim().to_string();
            byte_buffer.drain(..pos + 1);

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            let data_str = if line.starts_with("data: ") {
                line[6..].trim()
            } else if line.starts_with("data:") {
                line[5..].trim()
            } else {
                line.as_str()
            };

            if data_str == "[DONE]" {
                let elapsed = start_time.elapsed().as_secs_f64();
                if token_count == 0 {
                    channel.send(ChatStreamEvent::Error {
                        message: "No response text generated by model (reasoning only or empty stream)".to_string(),
                    }).ok();
                } else {
                    channel.send(ChatStreamEvent::Done { elapsed_sec: elapsed }).ok();
                }
                return Ok(());
            }

            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(data_str) {
                if let Some(delta) = provider_reasoning(&json_val) {
                    channel.send(ChatStreamEvent::Thinking { delta: delta.to_string() }).ok();
                }
                if let Some(err_val) = json_val.get("error") {
                    let err_msg = if let Some(s) = err_val.as_str() {
                        s.to_string()
                    } else if let Some(m) = err_val.get("message").and_then(|m| m.as_str()) {
                        m.to_string()
                    } else {
                        err_val.to_string()
                    };
                    has_terminal_error = true;
                    channel.send(ChatStreamEvent::Error { message: err_msg }).ok();
                    return Ok(());
                } else if let Some(content) = json_val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                    token_count += 1;
                    channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
                } else if let Some(delta) = json_val.get("delta").and_then(|d| d.as_str()) {
                    token_count += 1;
                    channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
                } else if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
                    if let Some(first) = choices.get(0) {
                        if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                            token_count += 1;
                            channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
                        } else if let Some(delta) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                            token_count += 1;
                            channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
                        }
                    }
                }
            }
        }
    }

    // Process any remaining non-delimited JSON in buffer
    let remaining = String::from_utf8_lossy(&byte_buffer).trim().to_string();
    if !remaining.is_empty() {
        let clean_json = if remaining.starts_with("data: ") {
            &remaining[6..]
        } else if remaining.starts_with("data:") {
            &remaining[5..]
        } else {
            &remaining
        };
        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(clean_json) {
                if let Some(delta) = provider_reasoning(&json_val) {
                    channel.send(ChatStreamEvent::Thinking { delta: delta.to_string() }).ok();
                }
            if let Some(content) = json_val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
            } else if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.get(0) {
                    if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
                    }
                }
            }
        }
    }

    if !has_terminal_error {
        let elapsed = start_time.elapsed().as_secs_f64();
        channel.send(ChatStreamEvent::Done { elapsed_sec: elapsed }).ok();
    }
    Ok(())
}

pub fn retrieve_rag_cards(persona_id: &str, query: &str) -> String {
    let app_data = match crate::personas::get_app_data_dir() {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let data_dir = app_data.join("personas_data").join(persona_id);
    if !data_dir.exists() {
        return String::new();
    }

    let q_lower = query.to_lowercase();
    let q_words: Vec<&str> = q_lower.split_whitespace().filter(|w| w.len() > 3).collect();

    let mut matched_frameworks: Vec<String> = Vec::new();
    let mut matched_anecdotes: Vec<String> = Vec::new();

    // 1. Scan Frameworks
    let fw_dir = data_dir.join("frameworks");
    if let Ok(entries) = std::fs::read_dir(fw_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("");
                        let rules = val.get("rules").and_then(|v| v.as_array());
                        
                        // Check match score
                        let card_text = format!("{} {}", title, content).to_lowercase();
                        let matches = q_words.iter().filter(|&&w| card_text.contains(w)).count();
                        if matches > 0 || q_words.is_empty() {
                            let mut card_str = format!("### FRAMEWORK: {}\n", title);
                            if let Some(r_arr) = rules {
                                for r in r_arr {
                                    if let Some(r_str) = r.as_str() {
                                        card_str.push_str(&format!("- {}\n", r_str));
                                    }
                                }
                            }
                            matched_frameworks.push(card_str);
                        }
                    }
                }
            }
        }
    }

    // 2. Scan Deal Anecdotes
    let an_dir = data_dir.join("anecdotes");
    if let Ok(entries) = std::fs::read_dir(an_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        let industry = val.pointer("/anchor/industry").and_then(|v| v.as_str()).unwrap_or("");
                        let outcome = val.pointer("/anchor/outcome").and_then(|v| v.as_str()).unwrap_or("");
                        let price = val.get("purchase_price").or_else(|| val.pointer("/anchor/deal_size")).and_then(|v| v.as_str()).unwrap_or("");
                        let structure = val.get("structure").and_then(|v| v.as_str()).unwrap_or("");
                        let lesson = val.get("key_lesson").and_then(|v| v.as_str()).unwrap_or("");

                        let card_text = format!("{} {} {} {} {}", industry, outcome, price, structure, lesson).to_lowercase();
                        let matches = q_words.iter().filter(|&&w| card_text.contains(w)).count();
                        if matches > 0 || q_words.is_empty() {
                            let card_str = format!(
                                "### CASE STUDY / ANECDOTE: {} ({})\n- Outcome: {}\n- Structure: {}\n- Key Math / Lesson: {}\n",
                                industry, price, outcome, structure, lesson
                            );
                            matched_anecdotes.push(card_str);
                        }
                    }
                }
            }
        }
    }

    if matched_frameworks.is_empty() && matched_anecdotes.is_empty() {
        crate::logger::log_debug("RAG", &format!("No keyword match in knowledge cards for persona '{}' query.", persona_id));
        return String::new();
    }

    crate::logger::log_info(
        "RAG",
        &format!(
            "Dual-RAG retrieved {} framework(s) and {} anecdote(s) for persona '{}'",
            matched_frameworks.len(),
            matched_anecdotes.len(),
            persona_id
        ),
    );

    let mut rag_block = String::from("\n\n[RETRIEVED KNOWLEDGE CARDS FROM PERSONA KNOWLEDGE BANK]:\nUse the exact principles, formulas, and verified deal numbers below whenever applicable:\n\n");
    for fw in matched_frameworks.iter().take(3) {
        rag_block.push_str(fw);
        rag_block.push('\n');
    }
    for an in matched_anecdotes.iter().take(2) {
        rag_block.push_str(an);
        rag_block.push('\n');
    }
    rag_block
}

pub async fn stream_persona_chat(
    persona_id: &str,
    message: &str,
    system_prompt: &str,
    persona_model: Option<&str>,
    channel: Channel<ChatStreamEvent>,
    request_id: Option<String>,
) -> Result<(), String> {
    let mut cancellation = crate::chat_cancel::register(request_id)?;
    let start_instant = std::time::Instant::now();
    let config = load_config();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    // Dynamically retrieve high-signal cards from AppData Knowledge Bank
    let rag_context = retrieve_rag_cards(persona_id, message);
    let augmented_system_prompt = if !rag_context.is_empty() {
        format!("{}{}", system_prompt, rag_context)
    } else {
        system_prompt.to_string()
    };

    let (url, auth_token, active_model) = match config.mode.as_str() {
        "direct_cloud" => {
            let ep = match config.cloud_provider.as_str() {
                "openai" => "https://api.openai.com/v1/chat/completions",
                "openrouter" => "https://openrouter.ai/api/v1/chat/completions",
                "groq" => "https://api.groq.com/openai/v1/chat/completions",
                "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                _ => "https://api.openai.com/v1/chat/completions"
            };
            (ep.to_string(), config.cloud_api_key.trim().to_string(), config.cloud_model.trim().to_string())
        },
        "custom_gateway" => {
            let target_model = if !config.custom_model.trim().is_empty() {
                config.custom_model.trim().to_string()
            } else {
                persona_model.unwrap_or("antigravity-gemini-3.8-flash").to_string()
            };
            (config.custom_url.trim().to_string(), config.custom_auth_token.trim().to_string(), target_model)
        },
        _ => { // "hermes_local"
            let target_model = if let Some(m) = persona_model {
                m.to_string()
            } else {
                "antigravity-gemini-3.8-flash".to_string()
            };
            let m_lower = target_model.to_lowercase();
            if m_lower.contains("deepseek") {
                ("http://127.0.0.1:8769/v1/chat/completions".to_string(), String::new(), target_model)
            } else if m_lower.contains("argon") || m_lower.contains("gemini-web") {
                ("http://127.0.0.1:8768/v1/chat/completions".to_string(), String::new(), target_model)
            } else if m_lower.contains("antigravity") || m_lower.contains("3.8-flash") || m_lower.contains("3.7-flash") || m_lower.contains("sonnet") || m_lower.contains("opus") {
                ("http://127.0.0.1:8766/v1/chat/completions".to_string(), String::new(), target_model)
            } else {
                let ep = format!("{}/v1/chat/completions", config.hermes_gateway_url.trim_end_matches('/'));
                (ep, config.hermes_auth_token.trim().to_string(), target_model)
            }
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if !auth_token.is_empty() {
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", auth_token)) {
            headers.insert(AUTHORIZATION, val);
        }
    }

    let start_time = std::time::Instant::now();
    let body = serde_json::json!({
        "model": active_model,
        "stream": true,
        "messages": [
            { "role": "system", "content": augmented_system_prompt },
            { "role": "user", "content": message }
        ]
    });

    let response = cancellation.run(async { client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach AI endpoint ({}): {}", url, e)) }).await?;

    if !response.status().is_success() {
        let err_text = cancellation.run(async { Ok(response.text().await.unwrap_or_default()) }).await?;
        channel
            .send(ChatStreamEvent::Error {
                message: format!("AI Provider error ({}): {}", url, err_text),
            })
            .ok();
        return Ok(());
    }

    let is_event_stream = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/event-stream"))
        .unwrap_or(false);

    if !is_event_stream {
        let full_body = cancellation.run(async { response.bytes().await.map_err(|e| e.to_string()) }).await?;
        if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&full_body) {
            if let Some(err_val) = json_val.get("error") {
                let err_msg = if let Some(s) = err_val.as_str() {
                    s.to_string()
                } else if let Some(m) = err_val.get("message").and_then(|m| m.as_str()) {
                    m.to_string()
                } else {
                    err_val.to_string()
                };
                channel.send(ChatStreamEvent::Error { message: err_msg }).ok();
                return Ok(());
            }

            if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.get(0) {
                    if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
                    } else if let Some(delta) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
                    }
                }
            } else if let Some(content) = json_val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
            } else if let Some(delta) = json_val.get("delta").and_then(|d| d.as_str()) {
                channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
            }
        }
        let elapsed = start_time.elapsed().as_secs_f64();
        channel.send(ChatStreamEvent::Done { elapsed_sec: elapsed }).ok();
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut byte_buffer = Vec::new();
    let mut has_terminal_error = false;
    let mut token_count = 0;

    while let Some(chunk_res) = cancellation.run(async { Ok(stream.next().await) }).await? {
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                crate::logger::log_error("LLM", &format!("Stream error reading chunk for persona '{}': {}", persona_id, e), None);
                has_terminal_error = true;
                channel
                    .send(ChatStreamEvent::Error {
                        message: format!("Stream error: {}", e),
                    })
                    .ok();
                break;
            }
        };

        byte_buffer.extend_from_slice(&chunk);

        while let Some(pos) = byte_buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = &byte_buffer[..pos];
            let line = String::from_utf8_lossy(line_bytes).trim().to_string();
            byte_buffer.drain(..pos + 1);

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            let data_str = if line.starts_with("data: ") {
                line[6..].trim()
            } else if line.starts_with("data:") {
                line[5..].trim()
            } else {
                line.as_str()
            };

            if data_str == "[DONE]" {
                let elapsed = start_time.elapsed().as_secs_f64();
                crate::logger::log_perf(
                    "LLM",
                    &format!("Stream completed for persona '{}'. Total tokens: {}, Elapsed: {:.2}s", persona_id, token_count, elapsed),
                    start_instant.elapsed().as_millis(),
                );
                if token_count == 0 {
                    crate::logger::log_warn("LLM", &format!("Zero response tokens generated by model for persona '{}'", persona_id), None);
                    channel.send(ChatStreamEvent::Error {
                        message: "No response text generated by model (reasoning only or empty stream)".to_string(),
                    }).ok();
                } else {
                    channel.send(ChatStreamEvent::Done { elapsed_sec: elapsed }).ok();
                }
                return Ok(());
            }

            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(data_str) {
                if let Some(delta) = provider_reasoning(&json_val) {
                    channel.send(ChatStreamEvent::Thinking { delta: delta.to_string() }).ok();
                }
                if let Some(err_val) = json_val.get("error") {
                    let err_msg = if let Some(s) = err_val.as_str() {
                        s.to_string()
                    } else if let Some(m) = err_val.get("message").and_then(|m| m.as_str()) {
                        m.to_string()
                    } else {
                        err_val.to_string()
                    };
                    crate::logger::log_error("LLM", &format!("Model returned error payload for persona '{}': {}", persona_id, err_msg), None);
                    has_terminal_error = true;
                    channel.send(ChatStreamEvent::Error { message: err_msg }).ok();
                    return Ok(());
                }

                if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
                    if let Some(first) = choices.get(0) {
                        if let Some(delta) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                            token_count += 1;
                            channel
                                .send(ChatStreamEvent::Token {
                                    delta: delta.to_string(),
                                })
                                .ok();
                        } else if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                            token_count += 1;
                            channel
                                .send(ChatStreamEvent::Token {
                                    delta: content.to_string(),
                                })
                                .ok();
                        }
                    }
                }
            }
        }
    }

    // Process any remaining non-delimited JSON in buffer
    let remaining = String::from_utf8_lossy(&byte_buffer).trim().to_string();
    if !remaining.is_empty() {
        let clean_json = if remaining.starts_with("data: ") {
            &remaining[6..]
        } else if remaining.starts_with("data:") {
            &remaining[5..]
        } else {
            &remaining
        };
        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(clean_json) {
                if let Some(delta) = provider_reasoning(&json_val) {
                    channel.send(ChatStreamEvent::Thinking { delta: delta.to_string() }).ok();
                }
            if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.get(0) {
                    if let Some(content) = first.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: content.to_string() }).ok();
                    } else if let Some(delta) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                        channel.send(ChatStreamEvent::Token { delta: delta.to_string() }).ok();
                    }
                }
            }
        }
    }

    if !has_terminal_error {
        let elapsed = start_time.elapsed().as_secs_f64();
        channel.send(ChatStreamEvent::Done { elapsed_sec: elapsed }).ok();
    }
    Ok(())
}

pub async fn test_ai_connection(config: AppConfig) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let (url, auth_token, active_model) = match config.mode.as_str() {
        "direct_cloud" => {
            let ep = match config.cloud_provider.as_str() {
                "openai" => "https://api.openai.com/v1/chat/completions",
                "openrouter" => "https://openrouter.ai/api/v1/chat/completions",
                "groq" => "https://api.groq.com/openai/v1/chat/completions",
                "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                _ => "https://api.openai.com/v1/chat/completions"
            };
            (ep.to_string(), config.cloud_api_key.trim().to_string(), config.cloud_model.trim().to_string())
        },
        "custom_gateway" => {
            (config.custom_url.trim().to_string(), config.custom_auth_token.trim().to_string(), config.custom_model.trim().to_string())
        },
        _ => { // "hermes_local"
            let ep = format!("{}/v1/chat/completions", config.hermes_gateway_url.trim_end_matches('/'));
            (ep, config.hermes_auth_token.trim().to_string(), "antigravity-gemini-3.8-flash".to_string())
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if !auth_token.is_empty() {
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", auth_token)) {
            headers.insert(AUTHORIZATION, val);
        }
    }

    let start_time = std::time::Instant::now();
    let body = serde_json::json!({
        "model": active_model,
        "stream": false,
        "max_tokens": 5,
        "messages": [
            { "role": "user", "content": "ping" }
        ]
    });

    let resp = client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach {}: {}", url, e))?;

    let elapsed = start_time.elapsed().as_millis();
    if resp.status().is_success() {
        Ok(format!("Connected! Model: {} (Latency: {}ms)", active_model, elapsed))
    } else {
        let err_body = resp.text().await.unwrap_or_default();
        Err(format!("Server returned error: {}", err_body))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HermesModelOption {
    pub id: String,
    pub name: String,
    pub provider: String,
}

pub async fn list_connected_hermes_models() -> Vec<HermesModelOption> {
    let mut models: Vec<HermesModelOption> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
        .unwrap_or_default();

    // 1. Probe Antigravity Bridge (Port 8766)
    if let Ok(resp) = client.get("http://127.0.0.1:8766/v1/models").send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(list) = json.get("data").and_then(|d| d.as_array()) {
                    for item in list {
                        if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                            if seen_ids.insert(id.to_string()) {
                                models.push(HermesModelOption {
                                    id: id.to_string(),
                                    name: id.to_string(),
                                    provider: "Antigravity Bridge (Port 8766)".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Probe Gemini Web Bridge (Port 8768)
    if let Ok(resp) = client.get("http://127.0.0.1:8768/v1/models").send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(list) = json.get("data").and_then(|d| d.as_array()) {
                    for item in list {
                        if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                            // Filter internal hashes
                            if !id.chars().all(|c| c.is_ascii_hexdigit() && id.len() > 10) {
                                if seen_ids.insert(id.to_string()) {
                                    models.push(HermesModelOption {
                                        id: id.to_string(),
                                        name: id.to_string(),
                                        provider: "Gemini Web Bridge (Port 8768)".to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Probe DeepSeek Web Bridge (Port 8769)
    if let Ok(resp) = client.get("http://127.0.0.1:8769/v1/models").send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(list) = json.get("data").and_then(|d| d.as_array()) {
                    for item in list {
                        if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                            if seen_ids.insert(id.to_string()) {
                                models.push(HermesModelOption {
                                    id: id.to_string(),
                                    name: id.to_string(),
                                    provider: "DeepSeek Web Bridge (Port 8769)".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. Parse Hermes config.yaml for model_aliases
    let config_paths = [
        dirs::data_local_dir().map(|d| d.join("hermes").join("config.yaml")),
        dirs::home_dir().map(|h| h.join(".hermes").join("config.yaml")),
    ];

    for maybe_path in config_paths.into_iter().flatten() {
        if maybe_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&maybe_path) {
                let mut in_aliases = false;
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("model_aliases:") {
                        in_aliases = true;
                        continue;
                    }
                    if in_aliases && !line.starts_with(' ') && !line.starts_with('\t') && !trimmed.is_empty() {
                        in_aliases = false;
                    }
                    if in_aliases && trimmed.ends_with(':') && !trimmed.contains("provider") && !trimmed.contains("model") {
                        let alias = trimmed.trim_end_matches(':');
                        if !alias.is_empty() && !alias.contains(' ') {
                            if seen_ids.insert(alias.to_string()) {
                                models.push(HermesModelOption {
                                    id: alias.to_string(),
                                    name: format!("{} (Alias)", alias),
                                    provider: "Hermes Config Aliases".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback standard options if empty
    if models.is_empty() {
        models.push(HermesModelOption {
            id: "antigravity-gemini-3.8-flash".to_string(),
            name: "antigravity-gemini-3.8-flash".to_string(),
            provider: "Default Local".to_string(),
        });
        models.push(HermesModelOption {
            id: "gemini-4-argon".to_string(),
            name: "gemini-4-argon".to_string(),
            provider: "Default Local".to_string(),
        });
        models.push(HermesModelOption {
            id: "deepseek-v4".to_string(),
            name: "deepseek-v4".to_string(),
            provider: "Default Local".to_string(),
        });
    }

    models
}
