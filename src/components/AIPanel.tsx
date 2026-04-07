import { useState, useEffect, useRef, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Message } from "../types/ai";
import { chatWithAI, extractGraphFromContext } from "../services/ai";
import { GraphModal } from "./GraphModal";
import { ChatMessage } from "./chat/ChatMessage";
import { ChatInput } from "./chat/ChatInput";
import { SanitizationModal } from "./chat/SanitizationModal";

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

	const [modalWidth, setModalWidth] = useState(900);
	const [modalHeight, setModalHeight] = useState(600);
	const [isResizingModal, setIsResizingModal] = useState(false);
	const [isMaximized, setIsMaximized] = useState(false);
	const [isGraphOpen, setIsGraphOpen] = useState(false);
	const [isExtractingGraph, setIsExtractingGraph] = useState(false);
	const [aiStatus, setAiStatus] = useState<string>("");

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

	const startModalResize = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizingModal(true);
	};

	useEffect(() => {
		const handleMove = (e: MouseEvent) => {
			if (isResizingModal) {
				// Get modal container starting point (it's centered)
				const modalX = (window.innerWidth - modalWidth) / 2;
				const modalY = (window.innerHeight - modalHeight) / 2;
				const newWidth = Math.max(600, e.clientX - modalX);
				const newHeight = Math.max(400, e.clientY - modalY);
				setModalWidth(newWidth);
				setModalHeight(newHeight);
			}
		};
		const handleUp = () => setIsResizingModal(false);

		if (isResizingModal) {
			window.addEventListener("mousemove", handleMove);
			window.addEventListener("mouseup", handleUp);
		}
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [isResizingModal, modalWidth, modalHeight]);

	useEffect(() => {
		checkAiStatus();
	}, [activeChatId, checkAiStatus]);

	// Auto-select model if current is invalid
	useEffect(() => {
		if (availableModels.length > 0 && (!currentModel || !availableModels.includes(currentModel))) {
			handleModelChange(availableModels[0]);
		}
	}, [availableModels, currentModel]);

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

	const extractAndSaveGraph = async (ctx: { text: string }) => {
		if (!activeChatId) {
			console.warn("No active chat ID for graph extraction");
			return;
		}
		setIsExtractingGraph(true);
		console.log("Starting graph extraction for chat:", activeChatId);
		try {
			const graphData = await extractGraphFromContext(ctx.text);
			console.log("Extracted graph data from AI:", graphData);

			if (graphData.entities && graphData.entities.length > 0) {
				const sanitizedData = {
					entities: graphData.entities
						.filter((e: any) => e && (e.id || e.id === 0)) // Ensure ID exists
						.map((e: any) => ({
							id: String(e.id).toLowerCase().trim(),
							node_type: e.type || e.node_type || e.label || "Entity",
							properties: typeof e.properties === 'object' ? JSON.stringify(e.properties) : String(e.properties || "")
						})),
					relationships: (graphData.relationships || []).map((r: any) => ({
						source: String(r.source || r.source_id || r.from || "").toLowerCase().trim(),
						target: String(r.target || r.target_id || r.to || "").toLowerCase().trim(),
						rel_type: r.rel_type || r.type || r.label || "DEPENDS_ON"
					})).filter(r => r.source && r.target) // Ensure source and target are not empty
				};

				if (sanitizedData.entities.length > 0) {
					console.log("Sending sanitized graph data to backend:", sanitizedData);
					await invoke("add_chat_graph", { chatId: activeChatId, data: sanitizedData });
					console.log("Graph data saved successfully");
				} else {
					console.warn("No valid entities found after sanitization");
				}
			} else {
				console.warn("AI returned empty entities array");
			}
		} catch (err: any) {
			console.error("Failed to extract graph:", err);
			const errMsg = typeof err === 'string' ? err : (err?.message || "Extraction Failed");
			setAiStatus(`⚠️ ${errMsg}`);
			// Keep the status for a bit so user can see it
			setTimeout(() => {
				if (isGenerating) setAiStatus("Thinking...");
				else setAiStatus("");
			}, 5000);
		} finally {
			setIsExtractingGraph(false);
		}
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
		if (scrollRef.current && !loading) {
			const scroll = scrollRef.current;
			// Use requestAnimationFrame to ensure DOM is updated
			requestAnimationFrame(() => {
				scroll.scrollTop = scroll.scrollHeight;
			});
		}
	}, [messages, loading]);

	const removeContext = (id: string) => {
		setContexts(prev => prev.filter(c => c.id !== id));
	};

	const handleSend = async () => {
		if (isGenerating || (!question.trim() && contexts.length === 0) || !activeChatId) return;

		setIsGenerating(true);
		let userMsg = question.trim();

		// 1. Automatic Graph Extraction for new contexts
		if (contexts.length > 0) {
			setAiStatus("Extracting Knowledge Graph...");
			for (const ctx of contexts) {
				await extractAndSaveGraph(ctx);
			}
		}

		// 2. Retrieve & Prune Graph Data for Retrieval-Augmentation (Backend Powered)
		setAiStatus("Consulting Knowledge Graph...");
		let graphContext = "";
		try {
			const pruned = await invoke<any>("get_relevant_graph", {
				chatId: activeChatId,
				query: userMsg
			});

			if (pruned.entities && pruned.entities.length > 0) {
				graphContext = "\n\n### RELEVANT KNOWLEDGE GRAPH CONTEXT\n";
				graphContext += "Entities:\n" + pruned.entities.map((e: any) => `- [${e.node_type}] ${e.id}: ${e.properties}`).join("\n");
				if (pruned.relationships && pruned.relationships.length > 0) {
					graphContext += "\nRelationships:\n" + pruned.relationships.map((r: any) => `- ${r.source} --(${r.rel_type})--> ${r.target}`).join("\n");
				}
				graphContext += "\n\n(Use the structural relationships above to inform your analysis)";
			}
		} catch (err) {
			console.error("Failed to retrieve relevant graph:", err);
		}

		// Append context if available
		if (contexts.length > 0 || graphContext) {
			const contextBlock = contexts.map(c =>
				`Context from [${c.sessionName}]:\n\`\`\`\n${c.text}\n\`\`\``
			).join("\n\n");

			const combinedContext = contextBlock ? `${contextBlock}${graphContext}` : graphContext;

			userMsg = userMsg
				? `${userMsg}\n\n---\n${combinedContext}`
				: `Please analyze the terminal context and knowledge graph:\n\n${combinedContext}`;
		}

		setQuestion("");
		setContexts([]);
		setAiStatus("Thinking...");

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
			console.error("AI Error:", err);
			// Tauri invoke errors are often just strings or { message: string }
			const errMsg = typeof err === 'string' ? err : (err?.message || "Error contacting AI service. Please check your API key in Settings.");

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
				{activeChatId && (
					<button
						onClick={() => setIsGraphOpen(true)}
						className={`ml-2 text-[10px] px-2 py-0.5 rounded border border-[var(--border-focus)] transition-all uppercase font-bold flex items-center gap-1 ${isExtractingGraph ? 'animate-pulse text-amber-500' : 'text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]'}`}
						title="Knowledge Graph (Graph RAG)"
					>
						<span>{isExtractingGraph ? "⚡" : "🕸️"}</span>
						<span className="hidden group-hover:inline">Graph</span>
					</button>
				)}
				{activeChatId && (
					<button
						onClick={() => {
							setLoading(true);
							invoke<Message[]>("get_messages", { chatId: activeChatId })
								.then(setMessages)
								.catch(console.error)
								.finally(() => setLoading(false));
						}}
						className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-focus)] transition-all text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
						title="Refresh Chat History"
					>
						⟳
					</button>
				)}
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
								<ChatMessage key={i} msg={msg} />
							))
						)}
						{isGenerating && (
							<div className="flex justify-start">
								<div className="max-w-[90%] text-[10px] p-2 rounded italic opacity-70 border border-dashed border-[var(--border-focus)] animate-pulse" style={{ color: "var(--accent-primary)" }}>
									{aiStatus || "AI is typing..."}
								</div>
							</div>
						)}
					</div>

					<ChatInput
						question={question}
						setQuestion={setQuestion}
						onSend={handleSend}
						isGenerating={isGenerating}
						hasApiKey={hasApiKey}
						contexts={contexts}
						onRemoveContext={removeContext}
						onOpenSanitizeModal={openSanitizeModal}
						currentModel={currentModel}
						availableModels={availableModels}
						handleModelChange={handleModelChange}
						loadingModels={loadingModels}
						currentProvider={currentProvider}
						aiStatus={aiStatus}
					/>
				</>
			)}

			<SanitizationModal
				editingContext={editingContext}
				onClose={() => setEditingContext(null)}
				sessionRules={sessionRules}
				newRule={newRule}
				setNewRule={setNewRule}
				onAddRule={addRule}
				onDeleteRule={deleteRule}
				onSave={saveEditedContext}
				onUpdateText={(text) => setEditingContext(prev => prev ? { ...prev, text } : null)}
				isMaximized={isMaximized}
				setIsMaximized={setIsMaximized}
				modalWidth={modalWidth}
				modalHeight={modalHeight}
				startModalResize={startModalResize}
			/>

			{isGraphOpen && activeChatId && (
				<GraphModal chatId={activeChatId} onClose={() => setIsGraphOpen(false)} />
			)}
		</div>
	);
});
