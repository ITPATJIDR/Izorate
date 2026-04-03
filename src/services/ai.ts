import { invoke } from "@tauri-apps/api/core";

export type AIProvider = "OpenAI" | "Anthropic" | "Google";

export async function chatWithAI(messages: { role: string, content: string }[]) {
    // Call the new backend command
    return await invoke<string>("chat_with_ai_backend", { 
        messages: messages.map(m => ({
            role: m.role,
            content: m.content
        }))
    });
}

export async function extractGraphFromContext(context: string): Promise<{ entities: any[], relationships: any[] }> {
    console.log("[Service] Extracting graph via backend...");
    try {
        const res = await invoke<any>("extract_graph_backend", { context });
        
        // Backend already returns normalized data, but we can do a quick check
        return {
            entities: res.entities || [],
            relationships: res.relationships || []
        };
    } catch (err) {
        console.error("[Service] Backend graph extraction failed:", err);
        throw err;
    }
}
