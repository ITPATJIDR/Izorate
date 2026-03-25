interface TopBarProps {
	connectedCount: number;
	activeTab: string;
	hasActiveSession: boolean;
	onTabChange: (tab: string) => void;
}

export function TopBar({ connectedCount, activeTab, hasActiveSession, onTabChange }: TopBarProps) {
	const now = new Date();
	const timeStr = now.toLocaleTimeString("en-US", { hour12: false });
	const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

	return (
		<div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: "#0a0a0a", borderColor: "#00ff4120" }}>
			{/* Left: Logo */}
			<div className="flex items-center gap-3">
				<span className="crt-glow text-sm font-bold tracking-widest" style={{ color: "#00ff41" }}>
					izo<span style={{ color: "#00e5ff" }}>RATE</span>
				</span>
				<span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#00ff4115", color: "#00ff41", border: "1px solid #00ff4130" }}>
					v0.1.0
				</span>
			</div>

			{/* Center: Nav */}
			<div className="flex gap-1">
				{["Sessions", "Files", "Tools", "Keys", "AI Assistant"].map((item) => {
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
								background: isActive ? "#00ff4115" : "transparent",
								border: isActive ? "1px solid #00ff4130" : "1px solid transparent",
								color: isActive ? "#00ff41" : "#4a6e4a",
							}}
						>
							{item === "AI Assistant" ? <span className="ai-shimmer">{item}</span> : item}
						</button>
					);
				})}
			</div>

			{/* Right: Status */}
			<div className="flex items-center gap-4 text-xs" style={{ color: "#4a6e4a" }}>
				<span>
					<span style={{ color: "#00ff41" }}>{connectedCount}</span> connected
				</span>
				<span>
					<span style={{ color: "#00e5ff" }}>0</span> tunnels
				</span>
				<div className="flex items-center gap-1.5">
					<div className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
					<span style={{ color: "#00ff41" }}>{timeStr}</span>
					<span> | {dateStr}</span>
				</div>
			</div>
		</div>
	);
}
