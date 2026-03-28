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
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="w-full max-w-sm bg-[#0d0d0d] border border-[#00ff4130] rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
				<div className="px-6 py-4 border-b border-[#00ff4110] bg-[#0f1a0f]">
					<h3 className="text-sm font-bold text-[#00ff41] crt-glow uppercase tracking-widest">Authentication Required</h3>
				</div>

				<div className="p-6 space-y-4">
					<p className="text-xs text-[#4a6e4a] leading-relaxed">
						Please enter the password for <span className="text-[#00ff41] font-bold">{sessionName}</span> to run this tool remotely.
					</p>

					<div className="space-y-1">
						<label className="text-[10px] font-bold text-[#888] uppercase">Password</label>
						<input
							autoFocus
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") onSubmit(password);
								if (e.key === "Escape") onClose();
							}}
							className="w-full bg-black border border-[#4a6e4a40] rounded px-3 py-2 text-sm text-[#ccc] focus:outline-none focus:border-[#00ff41] transition-colors"
							placeholder="••••••••"
						/>
					</div>
				</div>

				<div className="px-6 py-4 bg-black/40 flex justify-end gap-3">
					<button
						onClick={onClose}
						className="px-4 py-2 text-xs text-[#4a6e4a] hover:text-[#00ff41] transition-colors uppercase font-bold"
					>
						Cancel
					</button>
					<button
						onClick={() => onSubmit(password)}
						className="px-6 py-2 bg-[#00ff41] text-black text-xs font-bold rounded hover:bg-[#00cc33] active:scale-95 transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)] uppercase"
					>
						Connect & Run
					</button>
				</div>
			</div>
		</div>
	);
}
