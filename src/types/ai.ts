export interface Chat {
    id: number;
    title: string;
    created_at: string;
}

export interface Message {
    id: number;
    chat_id: number;
    role: "user" | "ai";
    content: string;
    timestamp: string;
}
