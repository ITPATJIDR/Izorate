import React from "react";

interface SanitizationModalProps {
	editingContext: { id: string; text: string; sessionId: number } | null;
	onClose: () => void;
	sessionRules: any[];
	newRule: { pattern: string; replacement: string };
	setNewRule: (rule: { pattern: string; replacement: string }) => void;
	onAddRule: () => void;
	onDeleteRule: (id: number) => void;
	onSave: () => void;
	onUpdateText: (text: string) => void;
	isMaximized: boolean;
	setIsMaximized: (val: boolean) => void;
	modalWidth: number;
	modalHeight: number;
	startModalResize: (e: React.MouseEvent) => void;
}

export const SanitizationModal = ({
	editingContext,
	onClose,
	sessionRules,
	newRule,
	setNewRule,
	onAddRule,
	onDeleteRule,
	onSave,
	onUpdateText,
	isMaximized,
	setIsMaximized,
	modalWidth,
	modalHeight,
	startModalResize
}: SanitizationModalProps) => {
	if (!editingContext) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
			<div
				className={`bg-[var(--bg-base)] border border-[var(--border-focus)] rounded-lg shadow-2xl flex flex-col overflow-hidden relative ${isMaximized ? "fixed inset-8 w-auto max-w-none max-h-none" : ""}`}
				style={!isMaximized ? { width: `${modalWidth}px`, height: `${modalHeight}px`, maxWidth: "95vw", maxHeight: "90vh" } : {}}
			>
				{/* Modal Header */}
				<div className="px-4 py-3 border-b flex items-center justify-between bg-[var(--bg-surface)]" style={{ borderColor: "var(--border-focus)" }}>
					<h3 className="text-sm font-bold uppercase tracking-widest text-[var(--accent-primary)] flex items-center gap-2">
						<span>🛡️ Sanitized Context</span>
						<span className="text-[10px] text-[var(--text-muted)] font-normal">Apply rules and edit sensitive info</span>
					</h3>
					<div className="flex items-center gap-4">
						<button
							onClick={() => setIsMaximized(!isMaximized)}
							className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors uppercase font-bold tracking-tighter"
							title={isMaximized ? "Restore" : "Maximize"}
						>
							{isMaximized ? "🗗 Restore" : "🗖 Maximize"}
						</button>
						<button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors">✕</button>
					</div>
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
							onChange={(e) => onUpdateText(e.target.value)}
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
											onClick={() => onDeleteRule(rule.id)}
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
								onClick={onAddRule}
								disabled={!newRule.pattern}
								className="w-full bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/40 text-[var(--accent-primary)] text-[10px] font-black py-2 uppercase tracking-widest hover:bg-[var(--accent-primary)] hover:text-black transition-all disabled:opacity-10 cursor-pointer rounded mt-1 shadow-[0_4px_10px_rgba(0,0,0,0.3)]"
							>
								Apply Globally
							</button>
						</div>
					</div>
				</div>

				{/* Modal Footer */}
				<div className="px-4 py-3 border-t flex items-center justify-end gap-3 bg-[var(--bg-surface)] relative" style={{ borderColor: "var(--border-focus)" }}>
					<button onClick={onClose} className="text-[10px] text-[var(--text-muted)] uppercase font-bold px-4 py-2 hover:bg-[var(--bg-hover)] rounded transition-all">Cancel</button>
					<button
						onClick={onSave}
						className="bg-[var(--accent-primary)] text-black text-[10px] uppercase font-bold px-6 py-2 rounded hover:shadow-[0_0_15px_var(--accent-primary)] transition-all flex items-center gap-2"
					>
						Save Sanitized Context
					</button>

					{/* Resize Handle */}
					{!isMaximized && (
						<div
							onMouseDown={startModalResize}
							className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 group"
						>
							<div className="w-2 h-2 border-r-2 border-b-2 border-[var(--text-muted)] group-hover:border-[var(--accent-primary)] transition-colors" />
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
