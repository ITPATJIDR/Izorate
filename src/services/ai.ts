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
        new SystemMessage("You are Antigravity, a helpful assistant integrated into the Izorate connection manager. You help users with shell commands, system diagnostics, and server management."),
        ...messages.map(m => m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))
    ];
    
    const response = await chat.invoke(langChainMessages);
    return response.content.toString();
}
