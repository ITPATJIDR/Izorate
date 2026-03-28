import { useState, useEffect, useRef, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import copy from "copy-to-clipboard";
import type { Message } from "../types/ai";
import { chatWithAI } from "../services/ai";

const CopyButton = ({ code }: { code: string }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		copy(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			onClick={handleCopy}
			className={`text-[9px] px-2 py-1 rounded border transition-all uppercase font-bold backdrop-blur-sm ${copied
				? "bg-[#00ff4140] text-[#00ff41] border-[#00ff41]"
				: "bg-[#00ff4110] hover:bg-[#00ff4130] text-[#00ff4180] hover:text-[#00ff41] border-[#00ff4120]"
				}`}
		>
			{copied ? "Copied!" : "Copy"}
		</button>
	);
};

const MarkdownRenderer = memo(({ content }: { content: string }) => {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				code({ node, inline, className, children, ...props }: any) {
					const match = /language-(\w+)/.exec(className || "");
					const codeString = String(children).replace(/\n$/, "");

					if (!inline && match) {
						return (
							<div className="relative group/code my-2">
								<div className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
									<CopyButton code={codeString} />
								</div>
								<SyntaxHighlighter
									style={vscDarkPlus as any}
									language={match[1]}
									PreTag="div"
									customStyle={{
										margin: 0,
										padding: "1rem",
										fontSize: "11px",
										background: "#050505",
										border: "1px solid #00ff4115",
										borderRadius: "4px"
									}}
									{...props}
								>
									{codeString}
								</SyntaxHighlighter>
							</div>
						);
					}
					return (
						<code className={className} {...props}>
							{children}
						</code>
					);
				}
			}}
		>
			{content}
		</ReactMarkdown>
	);
});

interface AIPanelProps {
	width?: number;
	activeChatId: number | null;
	onToggleCollapse?: () => void;
}

export const AIPanel = memo(({ width = 280, activeChatId, onToggleCollapse }: AIPanelProps) => {
	const [question, setQuestion] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
	const [currentModel, setCurrentModel] = useState("");
	const [currentProvider, setCurrentProvider] = useState("OpenAI");
	const [availableModels, setAvailableModels] = useState<string[]>([]);
	const [loadingModels, setLoadingModels] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const checkAiStatus = useCallback(async () => {
		try {
			const provider = (await invoke<string | null>("get_izorate_setting", { key: "ai_provider" })) || "OpenAI";
			const model = (await invoke<string | null>("get_izorate_setting", { key: "ai_model" })) || "";
			setCurrentProvider(provider);
			setCurrentModel(model);

			const keyMap: Record<string, string> = {
				"OpenAI": "openai_api_key",
				"Anthropic": "anthropic_api_key",
				"Google": "gemini_api_key"
			};
			const key = await invoke<string | null>("get_izorate_setting", { key: keyMap[provider] });
			setHasApiKey(!!key);

			if (key || provider === "Anthropic") {
				setLoadingModels(true);
				try {
					const models = await invoke<string[]>("list_models", { provider, apiKey: key || "dummy" });
					setAvailableModels(models);
				} catch (err) {
					console.error("Failed to fetch models:", err);
				} finally {
					setLoadingModels(false);
				}
			}
		} catch (err) {
			console.error(err);
			setHasApiKey(false);
		}
	}, []);

	useEffect(() => {
		checkAiStatus();
	}, [activeChatId, checkAiStatus]);

	const handleModelChange = async (newModel: string) => {
		try {
			await invoke("set_izorate_setting", { key: "ai_model", value: newModel });
			setCurrentModel(newModel);
		} catch (err) {
			console.error(err);
		}
	};

	useEffect(() => {
		if (activeChatId) {
			setLoading(true);
			invoke<Message[]>("get_messages", { chatId: activeChatId })
				.then(setMessages)
				.catch(console.error)
				.finally(() => setLoading(false));
		} else {
			setMessages([]);
		}
	}, [activeChatId]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	const handleSend = async () => {
		if (!question.trim() || !activeChatId || isGenerating) return;

		const userMsg = question.trim();
		setQuestion("");
		setIsGenerating(true);

		try {
			// Save user message
			await invoke("add_message", {
				chatId: activeChatId,
				role: "user",
				content: userMsg
			});

			// Refresh messages locally
			const updated = await invoke<Message[]>("get_messages", { chatId: activeChatId });
			setMessages(updated);

			// Call real AI via LangChain
			const response = await chatWithAI(updated.map(m => ({ role: m.role, content: m.content })));

			// Save AI response
			await invoke("add_message", {
				chatId: activeChatId,
				role: "ai",
				content: response
			});

			const final = await invoke<Message[]>("get_messages", { chatId: activeChatId });
			setMessages(final);

		} catch (err: any) {
			console.error(err);
			// Show error in chat
			const errMsg = err?.message || "Error contacting AI service. Please check your API key in Settings.";
			setMessages(prev => [...prev, {
				id: Date.now(),
				chat_id: activeChatId,
				role: "ai",
				content: `⚠️ ${errMsg}`,
				timestamp: new Date().toISOString()
			} as Message]);
		} finally {
			setIsGenerating(false);
		}
	};

	if (width <= 0) return null;

	return (
		<div className="flex flex-col h-full shrink-0" style={{ width: `${width}px`, background: "#0a0a0a", borderLeft: "1px solid #00ff4115" }}>
			{/* Header */}
			<div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "#00ff4115", background: "#0d0d0d" }}>
				<button
					onClick={onToggleCollapse}
					className="text-[#4a6e4a] hover:text-[#00ff41] transition-colors p-0.5"
					title="Collapse AI Panel"
				>
					<span className="text-[10px]">»»</span>
				</button>
				<span className={`text-[10px] uppercase font-bold tracking-widest ${isGenerating ? 'ai-shimmer' : 'text-[#00ff4180]'}`}>
					⬡ AI Assistant
				</span>
				{(activeChatId && (isGenerating || !hasApiKey)) && (
					<div className="ml-auto flex items-center gap-1">
						{!hasApiKey ? (
							<span className="text-[9px] text-red-500 font-bold uppercase">No API Key</span>
						) : (
							<>
								<div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
								<span className="text-[10px]" style={{ color: "#00e5ff" }}>Thinking...</span>
							</>
						)}
					</div>
				)}
			</div>

			{!activeChatId ? (
				<div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30 select-none">
					<div className="text-4xl mb-4">⬡</div>
					<p className="text-xs">No active conversation.</p>
					<p className="text-[10px] mt-2">Select a chat from the AI Assistant tab to begin.</p>
				</div>
			) : (
				<>
					{/* Chat History */}
					<div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
						{loading ? (
							<div className="text-[10px] animate-pulse" style={{ color: "#00ff4140" }}>Recalling history...</div>
						) : messages.length === 0 ? (
							<div className="text-[10px] italic text-center py-4" style={{ color: "#4a6e4a" }}>Start a conversation with Izorate AI.</div>
						) : (
							messages.map((msg, i) => (
								<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
									<div className="max-w-[90%] text-xs p-2 rounded leading-relaxed border"
										style={msg.role === "ai"
											? { background: "#0f1a0f", borderColor: "#00ff4125", color: "#a0d4a0" }
											: { background: "#0a1a2a", borderColor: "#00e5ff25", color: "#a0d8e8" }
										}>
										<div className="flex justify-between items-center mb-1 opacity-40">
											<span className="text-[9px] uppercase font-bold tracking-widest">
												{msg.role === "ai" ? "Assistant" : "User"}
											</span>
										</div>
										<div className="markdown-content">
											<MarkdownRenderer content={msg.content} />
										</div>
									</div>
								</div>
							))
						)}
						{isGenerating && (
							<div className="flex justify-start">
								<div className="max-w-[90%] text-[10px] p-2 rounded italic opacity-50 border border-dashed border-[#00ff4120]" style={{ color: "#00ff41" }}>
									AI is typing...
								</div>
							</div>
						)}
					</div>

					{/* Input */}
					<div className="p-2 border-t" style={{ borderColor: "#00ff4115" }}>
						{!hasApiKey ? (
							<div className="p-3 text-center">
								<p className="text-[10px] text-red-400 mb-2">API Key required to chat.</p>
								<button
									className="text-[9px] px-2 py-1 border border-red-900/30 text-red-400/60 hover:text-red-400 transition-all uppercase font-bold"
									onClick={() => alert("Go to Settings > AI Assistant and provide an API key.")}
								>
									Open Settings
								</button>
							</div>
						) : (
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between px-1">
									<div className="flex items-center gap-1.5">
										<span className="text-[8px] text-[#4a6e4a] uppercase font-bold tracking-tighter">Model:</span>
										<select
											value={currentModel}
											onChange={(e) => handleModelChange(e.target.value)}
											disabled={loadingModels}
											className="bg-transparent text-[9px] text-[#00ff41] outline-none cursor-pointer border-none p-0 uppercase font-mono hover:text-cyan-400 transition-colors disabled:opacity-30"
										>
											{loadingModels ? (
												<option>Loading...</option>
											) : availableModels.length > 0 ? (
												availableModels.map(m => (
													<option key={m} value={m} className="bg-[#0d0d0d]">{m}</option>
												))
											) : (
												<option value="">{currentProvider === "Anthropic" ? "standard" : "No models"}</option>
											)}
										</select>
									</div>
									<span className="text-[8px] text-[#4a6e4a] uppercase font-bold">{currentProvider}</span>
								</div>

								<div className="flex items-center gap-2 p-2 rounded" style={{ background: "#0f1a0f", border: "1px solid #00ff4130" }}>
									<input
										value={question}
										onChange={e => setQuestion(e.target.value)}
										onKeyDown={e => e.key === "Enter" && handleSend()}
										disabled={isGenerating}
										className="flex-1 bg-transparent outline-none text-xs placeholder-emerald-900 disabled:opacity-30"
										style={{ color: "#00ff41", fontFamily: "inherit" }}
										placeholder={isGenerating ? "AI is thinking..." : "ask AI anything..."}
									/>
									<button
										disabled={isGenerating || !question.trim()}
										onClick={handleSend}
										className="text-xs transition-colors hover:text-green-300 disabled:opacity-20"
										style={{ color: "#00ff41" }}
									>
										⏎
									</button>
								</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
});
