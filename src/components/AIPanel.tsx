import { useState, useEffect, useRef, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
				? "bg-[var(--border-focus)] text-[var(--accent-primary)] border-[var(--accent-primary)]"
				: "bg-[var(--bg-hover)] hover:bg-[var(--border-focus)] text-text-emerald-500/80 hover:text-[var(--accent-primary)] border-[var(--border-focus)]"
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
										background: "var(--bg-card)",
										border: "1px solid var(--accent-primary)15",
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
	const [contexts, setContexts] = useState<{ id: string, text: string, sessionName: string, sessionId: number }[]>([]);
	const [editingContext, setEditingContext] = useState<{ id: string, text: string, sessionId: number } | null>(null);
	const [sessionRules, setSessionRules] = useState<any[]>([]);
	const [newRule, setNewRule] = useState({ pattern: "", replacement: "" });
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Auto-resize textarea
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.style.height = 'auto';
			inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
		}
	}, [question]);

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

	useEffect(() => {
		const unlisten = listen<{ text: string, sessionName: string, sessionId: number }>("terminal-selection-to-ai", async (event) => {
			const { text, sessionName, sessionId } = event.payload;

			// Load rules for this session
			let sanitizedText = text;
			try {
				const rules = await invoke<any[]>("get_sanitize_rules", { sessionId });
				rules.forEach(rule => {
					// Use regex for global replace if replaceAll is hitting lint errors
					const pattern = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
					sanitizedText = sanitizedText.replace(new RegExp(pattern, 'g'), rule.replacement);
				});
			} catch (err) {
				console.error("Failed to apply sanitize rules:", err);
			}

			setContexts(prev => [
				...prev,
				{ id: crypto.randomUUID(), text: sanitizedText, sessionName, sessionId }
			]);

			// Open AI Panel if it's collapsed
			if (width <= 0 && onToggleCollapse) {
				onToggleCollapse();
			}
		});

		return () => {
			unlisten.then(f => f());
		};
	}, [width, onToggleCollapse]);

	const openSanitizeModal = async (ctx: { id: string, text: string, sessionId: number }) => {
		setEditingContext(ctx);
		try {
			const rules = await invoke<any[]>("get_sanitize_rules", { sessionId: ctx.sessionId });
			setSessionRules(rules);
		} catch (err) {
			console.error(err);
		}
	};

	const addRule = async () => {
		if (!newRule.pattern || !editingContext) return;
		try {
			await invoke("add_sanitize_rule", {
				sessionId: editingContext.sessionId,
				pattern: newRule.pattern,
				replacement: newRule.replacement
			});
			const rules = await invoke<any[]>("get_sanitize_rules", { sessionId: editingContext.sessionId });
			setSessionRules(rules);

			const pattern = newRule.pattern;
			const replacement = newRule.replacement;

			// Apply to ALL contexts from the same session
			setContexts(prev => prev.map(c =>
				c.sessionId === editingContext.sessionId
					? { ...c, text: c.text.split(pattern).join(replacement) }
					: c
			));

			// Also update current editing view
			setEditingContext(prev => prev ? {
				...prev,
				text: prev.text.split(pattern).join(replacement)
			} : null);

			setNewRule({ pattern: "", replacement: "" });
		} catch (err) {
			console.error(err);
		}
	};

	const deleteRule = async (id: number) => {
		if (!editingContext) return;
		try {
			await invoke("delete_sanitize_rule", { id });
			const rules = await invoke<any[]>("get_sanitize_rules", { sessionId: editingContext.sessionId });
			setSessionRules(rules);
		} catch (err) {
			console.error(err);
		}
	};

	const saveEditedContext = () => {
		if (!editingContext) return;
		setContexts(prev => prev.map(c => c.id === editingContext.id ? { ...c, text: editingContext.text } : c));
		setEditingContext(null);
	};

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

	const removeContext = (id: string) => {
		setContexts(prev => prev.filter(c => c.id !== id));
	};

	const handleSend = async () => {
		if ((!question.trim() && contexts.length === 0) || !activeChatId || isGenerating) return;

		let userMsg = question.trim();

		// Append context if available
		if (contexts.length > 0) {
			const contextBlock = contexts.map(c =>
				`Context from [${c.sessionName}]:\n\`\`\`\n${c.text}\n\`\`\``
			).join("\n\n");

			userMsg = userMsg
				? `${userMsg}\n\n---\n${contextBlock}`
				: `Please analyze this terminal context:\n\n${contextBlock}`;
		}

		setQuestion("");
		setContexts([]);
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
		<div className="flex flex-col h-full shrink-0" style={{ width: `${width}px`, background: "var(--bg-base)", borderLeft: "1px solid var(--border-focus)" }}>
			{/* Header */}
			<div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "var(--border-focus)", background: "var(--bg-surface)" }}>
				<button
					onClick={onToggleCollapse}
					className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors p-0.5"
					title="Collapse AI Panel"
				>
					<span className="text-[10px]">»»</span>
				</button>
				<span className={`text-[10px] uppercase font-bold tracking-widest ${isGenerating ? 'ai-shimmer' : 'text-text-emerald-500/80'}`}>
					⬡ AI Assistant
				</span>
				{(activeChatId && (isGenerating || !hasApiKey)) && (
					<div className="ml-auto flex items-center gap-1">
						{!hasApiKey ? (
							<span className="text-[9px] text-red-500 font-bold uppercase">No API Key</span>
						) : (
							<>
								<div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
								<span className="text-[10px]" style={{ color: "var(--cyan)" }}>Thinking...</span>
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
							<div className="text-[10px] animate-pulse" style={{ color: "var(--accent-primary)40" }}>Recalling history...</div>
						) : messages.length === 0 ? (
							<div className="text-[10px] italic text-center py-4" style={{ color: "var(--text-muted)" }}>Start a conversation with Izorate AI.</div>
						) : (
							messages.map((msg, i) => (
								<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
									<div className="max-w-[90%] text-xs p-2 rounded leading-relaxed border"
										style={{ background: "var(--bg-surface)", borderColor: "var(--border-focus)", color: "var(--text-main)" }}>
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
								<div className="max-w-[90%] text-[10px] p-2 rounded italic opacity-50 border border-dashed border-[var(--border-focus)]" style={{ color: "var(--accent-primary)" }}>
									AI is typing...
								</div>
							</div>
						)}
					</div>

					{/* Input */}
					<div className="p-2 border-t" style={{ borderColor: "var(--border-focus)" }}>
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
								<div className="flex flex-wrap gap-1.5 min-h-[5px]">
									{contexts.map(ctx => (
										<div
											key={ctx.id}
											onClick={() => openSanitizeModal(ctx)}
											className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--border-focus)] bg-[var(--bg-hover)] text-[var(--accent-primary)] text-[9px] uppercase font-bold tracking-tight crt-glow group cursor-pointer hover:border-[var(--accent-primary)] transition-all"
										>
											<span className="opacity-60 text-[7px] text-[var(--text-muted)]">Terminal:</span>
											<span>{ctx.sessionName}</span>
											<button
												onClick={(e) => { e.stopPropagation(); removeContext(ctx.id); }}
												className="ml-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
												title="Remove Context"
											>
												✕
											</button>
										</div>
									))}
								</div>

								<div className="flex items-center justify-between px-1">
									<div className="flex items-center gap-1.5">
										<span className="text-[8px] text-[var(--text-muted)] uppercase font-bold tracking-tighter">Model:</span>
										<select
											value={currentModel}
											onChange={(e) => handleModelChange(e.target.value)}
											disabled={loadingModels}
											className="bg-transparent text-[9px] text-[var(--accent-primary)] outline-none cursor-pointer border-none p-0 uppercase font-mono hover:text-cyan-400 transition-colors disabled:opacity-30"
										>
											{loadingModels ? (
												<option>Loading...</option>
											) : availableModels.length > 0 ? (
												availableModels.map(m => (
													<option key={m} value={m} className="bg-[var(--bg-surface)]">{m}</option>
												))
											) : (
												<option value="">{currentProvider === "Anthropic" ? "standard" : "No models"}</option>
											)}
										</select>
									</div>
									<span className="text-[8px] text-[var(--text-muted)] uppercase font-bold">{currentProvider}</span>
								</div>

								<div className="flex items-start gap-2 p-2 rounded" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-focus)" }}>
									<textarea
										ref={inputRef}
										value={question}
										onChange={e => setQuestion(e.target.value)}
										onKeyDown={e => {
											if (e.key === "Enter" && !e.shiftKey) {
												e.preventDefault();
												handleSend();
											}
										}}
										disabled={isGenerating}
										className="flex-1 bg-transparent outline-none text-xs placeholder-emerald-900 disabled:opacity-30 resize-none custom-scrollbar"
										style={{ color: "var(--accent-primary)", fontFamily: "inherit", minHeight: "20px", height: "auto", overflowY: "auto" }}
										placeholder={isGenerating ? "AI is thinking..." : "ask AI anything... (Shift+Enter for newline)"}
									/>
									<button
										disabled={isGenerating || (!question.trim() && contexts.length === 0)}
										onClick={handleSend}
										className="mt-0.5 text-xs transition-colors hover:text-green-300 disabled:opacity-20 flex-shrink-0"
										style={{ color: "var(--accent-primary)" }}
									>
										⏎
									</button>
								</div>
							</div>
						)}
					</div>
				</>
			)}

			{/* Sanitize Modal */}
			{editingContext && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
					<div className="bg-[var(--bg-base)] border border-[var(--border-focus)] rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
						{/* Modal Header */}
						<div className="px-4 py-3 border-b flex items-center justify-between bg-[var(--bg-surface)]" style={{ borderColor: "var(--border-focus)" }}>
							<h3 className="text-sm font-bold uppercase tracking-widest text-[var(--accent-primary)] flex items-center gap-2">
								<span>🛡️ Sanitized Context</span>
								<span className="text-[10px] text-[var(--text-muted)] font-normal">Apply rules and edit sensitive info</span>
							</h3>
							<button onClick={() => setEditingContext(null)} className="text-[var(--text-muted)] hover:text-white transition-colors">✕</button>
						</div>

						{/* Modal Content */}
						<div className="flex-1 flex overflow-hidden">
							<div className="flex-[3] flex flex-col p-4 border-r overflow-hidden" style={{ borderColor: "var(--border-focus)" }}>
								<div className="flex items-center justify-between mb-2">
									<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase italic">Terminal Output / Context Payload</label>
									<span className="text-[9px] text-[var(--accent-primary)]/40 font-mono select-none">Line Editing Mode</span>
								</div>
								<textarea
									value={editingContext.text}
									onChange={(e) => setEditingContext({ ...editingContext, text: e.target.value })}
									className="flex-1 bg-[var(--bg-base)]/30 border border-[var(--border-focus)] rounded p-4 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-primary)] font-mono resize-none custom-scrollbar leading-relaxed"
									placeholder="Context is empty..."
								/>
							</div>

							<div className="flex-[2] flex flex-col p-4 bg-[var(--bg-surface)]/30 overflow-hidden border-l border-white/5">
								<div className="flex items-center gap-2 mb-3">
									<div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
									<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Sanitization History</label>
								</div>

								{/* Rule List (Replacement Log) */}
								<div className="flex-1 overflow-y-auto mb-4 border border-[var(--border-focus)] rounded bg-[var(--bg-base)]/80 p-2 flex flex-col gap-2 custom-scrollbar shadow-inner">
									{sessionRules.length === 0 ? (
										<div className="h-full flex flex-col items-center justify-center text-[10px] italic text-[var(--text-muted)] p-6 text-center opacity-30 select-none">
											<div className="text-2xl mb-2">∅</div>
											<p>No active filters for this session.</p>
										</div>
									) : (
										sessionRules.map(rule => (
											<div key={rule.id} className="p-2.5 border border-[var(--border-focus)] bg-[var(--bg-surface)] rounded-md relative group hover:bg-[var(--bg-hover)] transition-all">
												<div className="flex flex-col gap-1">
													<div className="flex items-center gap-1.5 overflow-hidden">
														<span className="text-[9px] text-red-400 font-bold px-1.5 py-0.5 rounded bg-red-400/10 border border-red-400/20 shrink-0">FIND</span>
														<span className="text-[10px] font-mono truncate opacity-80">{rule.pattern}</span>
													</div>
													<div className="flex items-center gap-1.5 overflow-hidden">
														<span className="text-[9px] text-green-400 font-bold px-1.5 py-0.5 rounded bg-green-400/10 border border-green-400/20 shrink-0">REPL</span>
														<span className="text-[10px] font-mono truncate opacity-100">{rule.replacement || "—"}</span>
													</div>
												</div>
												<button
													onClick={() => deleteRule(rule.id)}
													className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-500/10 rounded"
													title="Delete Rule"
												>✕</button>
											</div>
										))
									)}
								</div>

								{/* New Rule Form */}
								<div className="space-y-3 p-4 border border-[var(--accent-primary)]/20 rounded bg-[var(--bg-base)] shadow-lg relative overflow-hidden">
									<div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent-primary)] opacity-30" />
									<p className="text-[9px] font-black text-[var(--accent-primary)] uppercase tracking-[0.2em] mb-1">Add Sanitization Rule</p>

									<div className="space-y-2">
										<div className="flex flex-col gap-1">
											<span className="text-[8px] text-[var(--text-muted)] uppercase font-bold ml-1">Pattern to hide</span>
											<input
												type="text"
												placeholder="e.g. password=123"
												value={newRule.pattern}
												onChange={e => setNewRule({ ...newRule, pattern: e.target.value })}
												className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] rounded-md px-3 py-2 text-[10px] text-white outline-none focus:border-[var(--accent-primary)] transition-all placeholder:opacity-30"
											/>
										</div>
										<div className="flex flex-col gap-1">
											<span className="text-[8px] text-[var(--text-muted)] uppercase font-bold ml-1">Replacement text</span>
											<input
												type="text"
												placeholder="e.g. [SECRET_HIDDEN]"
												value={newRule.replacement}
												onChange={e => setNewRule({ ...newRule, replacement: e.target.value })}
												className="w-full bg-[var(--bg-surface)] border border-[var(--border-focus)] rounded-md px-3 py-2 text-[10px] text-white outline-none focus:border-[var(--accent-primary)] transition-all placeholder:opacity-30"
											/>
										</div>
									</div>

									<button
										onClick={addRule}
										disabled={!newRule.pattern}
										className="w-full bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/40 text-[var(--accent-primary)] text-[10px] font-black py-2 uppercase tracking-widest hover:bg-[var(--accent-primary)] hover:text-black transition-all disabled:opacity-10 cursor-pointer rounded mt-1 shadow-[0_4px_10px_rgba(0,0,0,0.3)]"
									>
										Apply Globally
									</button>
								</div>
							</div>
						</div>

						{/* Modal Footer */}
						<div className="px-4 py-3 border-t flex items-center justify-end gap-3 bg-[var(--bg-surface)]" style={{ borderColor: "var(--border-focus)" }}>
							<button onClick={() => setEditingContext(null)} className="text-[10px] text-[var(--text-muted)] uppercase font-bold px-4 py-2 hover:bg-[var(--bg-hover)] rounded transition-all">Cancel</button>
							<button onClick={saveEditedContext} className="bg-[var(--accent-primary)] text-black text-[10px] uppercase font-bold px-6 py-2 rounded hover:shadow-[0_0_15px_var(--accent-primary)] transition-all">Save Context</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
});
