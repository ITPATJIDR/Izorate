interface TopBarProps {
	connectedCount: number;
	activeTab: string;
	hasActiveSession: boolean;
	isMultiExec: boolean;
	onTabChange: (tab: string) => void;
	onToggleMultiExec: () => void;
}

export function TopBar({ connectedCount, activeTab, hasActiveSession, isMultiExec, onTabChange, onToggleMultiExec }: TopBarProps) {
	const now = new Date();
	const timeStr = now.toLocaleTimeString("en-US", { hour12: false });
	const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

	return (
		<div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: "var(--bg-base)", borderColor: "var(--border-focus)" }}>
			{/* Left: Logo */}
			<div className="flex items-center gap-3">
				<span className="crt-glow text-sm font-bold tracking-widest" style={{ color: "var(--accent-primary)" }}>
					izo<span style={{ color: "#00e5ff" }}>RATE</span>
				</span>
				<span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--accent-primary)15", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)30" }}>
					v0.1.0
				</span>
			</div>

			{/* Center: Nav */}
			<div className="flex gap-1">
				{["Sessions", "Files", "Tools", "Keys", "Settings", "AI Assistant"].map((item) => {
					const isActive = item === activeTab;
					const isDisabled = item === "Files" && !hasActiveSession;
					return (
						<button
							key={item}
							onClick={() => { if (!isDisabled) onTabChange(item); }}
							disabled={isDisabled}
							className={`px-3 py-1 text-xs rounded transition-all duration-200 ${isActive
								? "text-green-400 font-medium"
								: "hover:text-green-400"
								} ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
							style={{
								background: isActive ? "var(--accent-primary)15" : "transparent",
								border: isActive ? "1px solid var(--accent-primary)30" : "1px solid transparent",
								color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
							}}
						>
							{item === "AI Assistant" ? <span className="ai-shimmer">{item}</span> : item}
						</button>
					);
				})}
			</div>

			{/* Right: Status */}
			<div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
				{connectedCount > 1 && activeTab === "Sessions" && (
					<button
						onClick={onToggleMultiExec}
						className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-300 group ${isMultiExec
							? "bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
							: "bg-[var(--bg-hover)]/40 border-white/5 hover:border-[var(--accent-primary)]/40 hover:text-[var(--accent-primary)]"
							}`}
						title="Multi-Execution: Broadcast input to all sessions"
					>
						<span className={`${isMultiExec ? "animate-pulse" : "opacity-60"}`}>📡</span>
						<span className={`uppercase font-bold tracking-tighter ${isMultiExec ? "opacity-100" : "opacity-40"}`}>
							Multi-Exec {isMultiExec ? "ON" : "OFF"}
						</span>
						{isMultiExec && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot ml-0.5" />}
					</button>
				)}

				<span>
					<span style={{ color: "var(--accent-primary)" }}>{connectedCount}</span> connected
				</span>
				<span>
					<span style={{ color: "#00e5ff" }}>0</span> tunnels
				</span>
				<div className="flex items-center gap-1.5">
					<div className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
					<span style={{ color: "var(--accent-primary)" }}>{timeStr}</span>
					<span> | {dateStr}</span>
				</div>
			</div>
		</div>
	);
}
