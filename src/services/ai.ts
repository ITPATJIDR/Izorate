import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { invoke } from "@tauri-apps/api/core";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";

export type AIProvider = "OpenAI" | "Anthropic" | "Google";

export async function getAIClient() {
    const provider = (await invoke<string | null>("get_izorate_setting", { key: "ai_provider" })) || "OpenAI";
    const model = await invoke<string | null>("get_izorate_setting", { key: "ai_model" });
    
    if (provider === "OpenAI") {
        const apiKey = await invoke<string | null>("get_izorate_setting", { key: "openai_api_key" });
        if (!apiKey) throw new Error("OpenAI API Key not set");
        return new ChatOpenAI({
            apiKey: apiKey,
            model: model || "gpt-4o",
            temperature: 0.7,
        });
    } else if (provider === "Anthropic") {
        const apiKey = await invoke<string | null>("get_izorate_setting", { key: "anthropic_api_key" });
        if (!apiKey) throw new Error("Anthropic API Key not set");
        return new ChatAnthropic({
            apiKey: apiKey,
            model: model || "claude-3-5-sonnet-20240620",
            temperature: 0.7,
        });
    } else if (provider === "Google") {
        const apiKey = await invoke<string | null>("get_izorate_setting", { key: "gemini_api_key" });
        if (!apiKey) throw new Error("Gemini API Key not set");
        const googleModel = model || "gemini-1.5-pro";
        return new ChatGoogleGenerativeAI({
            apiKey: apiKey,
            model: googleModel,
            maxOutputTokens: 2048,
        });
    }
    
    throw new Error("Unsupported AI Provider");
}

export async function chatWithAI(messages: { role: string, content: string }[]) {
    const chat = await getAIClient();
    
    const langChainMessages: BaseMessage[] = [
        new SystemMessage(`You are Antigravity, a System Architecture & SRE Expert assistant. 
        You have access to a Knowledge Graph that represents structural relationships extracted from terminal logs and configurations.
        
        When "KNOWLEDGE GRAPH CONTEXT" is provided:
        1. Use it to understand dependencies, configuration paths, and structural relationships that might not be obvious in the raw text.
        2. If the user asks about issues, look for "Error" nodes or "DEPENDS_ON" chains in the graph.
        3. Explain your reasoning using both the raw context and the graph structure.`),
        ...messages.map(m => m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))
    ];
    
    const response = await chat.invoke(langChainMessages);
    return response.content.toString();
}

export async function extractGraphFromContext(context: string): Promise<{ entities: any[], relationships: any[] }> {
    const chat = await getAIClient();
    
    const prompt = `### ROLE
คุณคือ "System Architecture & SRE Expert" หน้าที่ของคุณคือการอ่าน Log หรือไฟล์ Configuration ที่ผ่านการ Sanitized แล้ว เพื่อสกัด "ความสัมพันธ์เชิงโครงสร้าง" (Structural Relationships) ออกมาเป็น Knowledge Graph

### GOAL
วิเคราะห์ข้อความที่ได้รับ และแปลงเป็น JSON สำหรับ KùzuDB โดยใช้ Schema ดังนี้:
1. Node Table: 'Entity' (id, type, properties)
2. Rel Table: 'Dependency' (source_id, target_id, rel_type)

### SCHEMA RULES
- Entity Types: [Service, Config, Error, Container, Network, Port, User, File]
- Relationship Types (rel_type): 
    - "DEPENDS_ON": ความสัมพันธ์เชิงพึ่งพา (เช่น Service พึ่งพา Network)
    - "DEFINES": ความสัมพันธ์เชิงกำหนดค่า (เช่น ไฟล์ Config กำหนดค่าให้ Service)
    - "ERRORS_IN": ความสัมพันธ์เมื่อเกิดปัญหา (เช่น Error นี้เกิดขึ้นใน Service นี้)

### EXTRACTION GUIDELINES
1. **Handle Sanitized Placeholders**: หากเจอข้อมูลที่เป็น <IP_01>, <SECRET>, หรือ <SERVER_NAME> ให้ใช้ค่าเหล่านั้นเป็น ID โดยตรง (ไม่ต้องพยายามเดาค่าจริง)
2. **Contextual Linking**:
   - ถ้าเจอคำสั่ง (Command) ให้มองเป็น Service หรือกระบวนการ
   - ถ้าเจอ Error Message หรือ Stack trace ให้สรุปใจความสั้นๆ เป็น Node 'Error'
   - ถ้าเจอ File path (เช่น /var/log/error.log) ให้มองเป็น 'File' เสมอ (ไม่ใช่ Error)
   - เชื่อม 'ERRORS_IN' ไปยัง Service ที่เกี่ยวข้องหากเป็น Error Message
3. **Property Extraction**: ในส่วน properties ให้ใส่ข้อมูลเพิ่มเติมที่สำคัญ เช่น port number, file path, หรือ error code (ถ้ามี)
4. **No Hallucinations**: สกัดเฉพาะสิ่งที่ปรากฏในข้อความเท่านั้น ห้ามเติมข้อมูลที่ไม่มีหลักฐาน
5. **IDs**: Use lowercase and standardized names for IDs to reduce duplicates.

### EXTREMELY IMPORTANT
- **Respond ONLY with raw JSON.**
- **NO markdown code blocks.**
- **NO preamble or explanation.**
- **Ensure ALL IDs ARE LOWERCASE strings.**
- **Format:**
{
  "entities": [
    {"id": "nginx", "type": "Service", "properties": {"version": "v1.18.0"}}
  ],
  "relationships": [
    {"source": "nginx", "target": "port80", "rel_type": "DEPENDS_ON"}
  ]
}

Input Context:
${context}`;

    const langChainMessages = [
        new SystemMessage("You are a Graph Data Extractor. Respond ONLY with valid JSON."),
        new HumanMessage(prompt)
    ];

    const response = await chat.invoke(langChainMessages);
    const content = response.content.toString();
    
    try {
        // Find JSON block if AI wrapped it in markdown
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        let parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
        
        // Handle nested structures like { "graph": { "entities": [...] } }
        if (!parsed.entities && parsed.graph) parsed = parsed.graph;
        if (!parsed.entities && parsed.data) parsed = parsed.data;

        return {
            entities: parsed.entities || [],
            relationships: parsed.relationships || parsed.links || parsed.edges || []
        };
    } catch (err) {
        console.error("Failed to parse graph JSON:", content);
        throw new Error("AI returned invalid JSON for the graph. Please try again.");
    }
}
