import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Chat } from "../types/ai";

interface AIPageProps {
	activeChatId: number | null;
	onSelectChat: (id: number) => void;
}

export function AIPage({ activeChatId, onSelectChat }: AIPageProps) {
	const [chats, setChats] = useState<Chat[]>([]);
	const [loading, setLoading] = useState(true);

	const loadChats = async () => {
		try {
			const result = await invoke<Chat[]>("get_chats");
			setChats(result);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadChats();
	}, []);

	const handleNewChat = async () => {
		const title = prompt("Enter chat title:", `Chat ${new Date().toLocaleString()}`);
		if (title) {
			try {
				const id = await invoke<number>("create_chat", { title });
				await loadChats();
				onSelectChat(id);
			} catch (err) {
				console.error(err);
			}
		}
	};

	const handleRenameChat = async (id: number, currentTitle: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const newTitle = prompt("Enter new chat title:", currentTitle);
		if (newTitle && newTitle !== currentTitle) {
			try {
				await invoke("update_chat_title", { id, title: newTitle });
				loadChats();
			} catch (err) {
				console.error(err);
			}
		}
	};

	const handleDeleteChat = async (id: number, e: React.MouseEvent) => {
		e.stopPropagation();
		if (confirm("Delete this chat and all its messages?")) {
			try {
				await invoke("delete_chat", { id });
				loadChats();
			} catch (err) {
				console.error(err);
			}
		}
	};

	return (
		<div className="flex-1 flex flex-col p-6 overflow-hidden">
			<div className="flex justify-between items-center mb-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tighter crt-glow" style={{ color: "var(--accent-primary)" }}>AI ASSISTANT</h1>
					<p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Manage your persistent conversations and insights.</p>
				</div>
				<button
					onClick={handleNewChat}
					className="px-4 py-2 text-xs font-bold border transition-all hover:bg-[var(--bg-hover)]"
					style={{ borderColor: "var(--border-focus)", color: "var(--accent-primary)" }}
				>
					+ NEW CONVERSATION
				</button>
			</div>

			<div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
				{loading ? (
					<div className="text-xs animate-pulse" style={{ color: "var(--accent-primary)40" }}>Loading conversations...</div>
				) : chats.length === 0 ? (
					<div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
						<div className="text-4xl mb-4">⬡</div>
						<p className="text-xs">No conversations yet.</p>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{chats.map(chat => (
							<div
								key={chat.id}
								onClick={() => onSelectChat(chat.id!)}
								className={`p-4 border cursor-pointer transition-all hover:translate-y-[-2px] ${activeChatId === chat.id ? 'bg-[var(--bg-hover)]' : 'bg-[var(--bg-base)]/20'}`}
								style={{
									borderColor: activeChatId === chat.id ? "var(--accent-primary)60" : "var(--accent-primary)15",
									boxShadow: activeChatId === chat.id ? "0 0 15px var(--accent-primary)10" : "none"
								}}
							>
								<div className="flex justify-between items-start mb-2">
									<h3 className="text-sm font-bold truncate pr-4" style={{ color: activeChatId === chat.id ? "var(--accent-primary)" : "var(--text-main)" }}>
										{chat.title}
									</h3>
									<div className="flex items-center gap-2">
										<button
											onClick={(e) => handleRenameChat(chat.id!, chat.title, e)}
											className="text-[10px] opacity-40 hover:opacity-100 hover:text-[var(--accent-primary)] transition-all"
											title="Rename Chat"
										>
											✎
										</button>
										<button
											onClick={(e) => handleDeleteChat(chat.id!, e)}
											className="text-xs opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
										>
											✕
										</button>
									</div>
								</div>
								<div className="flex items-center gap-2 mt-4">
									<span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
										{new Date(chat.created_at).toLocaleString()}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
