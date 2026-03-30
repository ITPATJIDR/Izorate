import { useState } from "react";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (password: string) => void;
	sessionName: string;
}

export function PasswordPromptModal({ isOpen, onClose, onSubmit, sessionName }: Props) {
	const [password, setPassword] = useState("");

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--bg-base)]/60 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-focus)] rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
				<div className="px-6 py-4 border-b border-[var(--bg-hover)] bg-[#0f1a0f]">
					<h3 className="text-sm font-bold text-[var(--accent-primary)] crt-glow uppercase tracking-widest">Authentication Required</h3>
				</div>

				<div className="p-6 space-y-4">
					<p className="text-xs text-[var(--text-muted)] leading-relaxed">
						Please enter the password for <span className="text-[var(--accent-primary)] font-bold">{sessionName}</span> to run this tool remotely.
					</p>

					<div className="space-y-1">
						<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Password</label>
						<input
							autoFocus
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") onSubmit(password);
								if (e.key === "Escape") onClose();
							}}
							className="w-full bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
							placeholder="••••••••"
						/>
					</div>
				</div>

				<div className="px-6 py-4 bg-[var(--bg-base)]/40 flex justify-end gap-3">
					<button
						onClick={onClose}
						className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors uppercase font-bold"
					>
						Cancel
					</button>
					<button
						onClick={() => onSubmit(password)}
						className="px-6 py-2 bg-[var(--accent-primary)] text-black text-xs font-bold rounded hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)] uppercase"
					>
						Connect & Run
					</button>
				</div>
			</div>
		</div>
	);
}
