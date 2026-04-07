import { useRef, useEffect } from "react";

interface ContextChipProps {
	ctx: { id: string; sessionName: string };
	onOpenModal: () => void;
	onRemove: () => void;
}

export const ContextChip = ({ ctx, onOpenModal, onRemove }: ContextChipProps) => (
	<div
		onClick={onOpenModal}
		className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--border-focus)] bg-[var(--bg-hover)] text-[var(--accent-primary)] text-[9px] uppercase font-bold tracking-tight crt-glow group cursor-pointer hover:border-[var(--accent-primary)] transition-all"
	>
		<span className="opacity-60 text-[7px] text-[var(--text-muted)]">Terminal:</span>
		<span>{ctx.sessionName}</span>
		<button
			onClick={(e) => { e.stopPropagation(); onRemove(); }}
			className="ml-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
			title="Remove Context"
		>
			✕
		</button>
	</div>
);

interface ChatInputProps {
	question: string;
	setQuestion: (val: string) => void;
	onSend: () => void;
	isGenerating: boolean;
	hasApiKey: boolean | null;
	contexts: { id: string; sessionName: string }[];
	onRemoveContext: (id: string) => void;
	onOpenSanitizeModal: (ctx: any) => void;
	currentModel: string;
	availableModels: string[];
	handleModelChange: (model: string) => void;
	loadingModels: boolean;
	currentProvider: string;
	aiStatus: string;
}

export const ChatInput = ({
	question,
	setQuestion,
	onSend,
	isGenerating,
	hasApiKey,
	contexts,
	onRemoveContext,
	onOpenSanitizeModal,
	currentModel,
	availableModels,
	handleModelChange,
	loadingModels,
	currentProvider,
	aiStatus
}: ChatInputProps) => {
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Auto-resize textarea
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.style.height = 'auto';
			inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
		}
	}, [question]);

	if (hasApiKey === false) {
		return (
			<div className="p-3 text-center border-t" style={{ borderColor: "var(--border-focus)" }}>
				<p className="text-[10px] text-red-400 mb-2">API Key required to chat.</p>
				<button
					className="text-[9px] px-2 py-1 border border-red-900/30 text-red-400/60 hover:text-red-400 transition-all uppercase font-bold"
					onClick={() => alert("Go to Settings > AI Assistant and provide an API key.")}
				>
					Open Settings
				</button>
			</div>
		);
	}

	return (
		<div className="p-2 border-t" style={{ borderColor: "var(--border-focus)" }}>
			<div className="flex flex-col gap-2">
				{/* Context Chips */}
				<div className="flex flex-wrap gap-1.5 min-h-[5px]">
					{contexts.map(ctx => (
						<ContextChip
							key={ctx.id}
							ctx={ctx}
							onOpenModal={() => onOpenSanitizeModal(ctx)}
							onRemove={() => onRemoveContext(ctx.id)}
						/>
					))}
				</div>

				{/* Model Selection */}
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
								<option value="">No models found</option>
							)}
						</select>
					</div>
					<span className="text-[8px] text-[var(--text-muted)] uppercase font-bold">{currentProvider}</span>
				</div>

				{/* Text Input Area */}
				<div className="flex items-start gap-2 p-2 rounded" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-focus)" }}>
					<textarea
						ref={inputRef}
						value={question}
						onChange={e => setQuestion(e.target.value)}
						onKeyDown={e => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								onSend();
							}
						}}
						disabled={isGenerating}
						className="flex-1 bg-transparent outline-none text-xs placeholder-emerald-900 disabled:opacity-30 resize-none custom-scrollbar"
						style={{ color: "var(--accent-primary)", fontFamily: "inherit", minHeight: "20px", height: "auto", overflowY: "auto" }}
						placeholder={isGenerating ? (aiStatus || "AI is thinking...") : "ask AI anything... (Shift+Enter for newline)"}
					/>
					<button
						disabled={isGenerating || (!question.trim() && contexts.length === 0)}
						onClick={onSend}
						className="mt-0.5 text-xs transition-colors hover:text-green-300 disabled:opacity-20 flex-shrink-0"
						style={{ color: "var(--accent-primary)" }}
					>
						⏎
					</button>
				</div>
			</div>
		</div>
	);
};
