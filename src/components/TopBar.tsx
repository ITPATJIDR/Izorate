export function TopBar() {
	const now = new Date();
	const timeStr = now.toLocaleTimeString("en-US", { hour12: false });
	const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

	return (
		<div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: "#0a0a0a", borderColor: "#00ff4120" }}>
			{/* Left: Logo */}
			<div className="flex items-center gap-3">
				<div className="flex gap-1.5">
					<div className="w-3 h-3 rounded-full" style={{ background: "#ff2d55" }} />
					<div className="w-3 h-3 rounded-full" style={{ background: "#ffb000" }} />
					<div className="w-3 h-3 rounded-full" style={{ background: "#00ff41" }} />
				</div>
				<span className="crt-glow text-sm font-bold tracking-widest" style={{ color: "#00ff41" }}>
					izo<span style={{ color: "#00e5ff" }}>RATE</span>
				</span>
				<span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#00ff4115", color: "#00ff41", border: "1px solid #00ff4130" }}>
					v0.1.0
				</span>
			</div>

			{/* Center: Nav */}
			<div className="flex gap-1">
				{["Sessions", "Files", "Tools", "Keys", "AI Assistant"].map((item, i) => (
					<button
						key={item}
						className={`px-3 py-1 text-xs rounded transition-all duration-200 ${i === 0
							? "text-green-400 font-medium"
							: "hover:text-green-400"
							}`}
						style={{
							background: i === 0 ? "#00ff4115" : "transparent",
							border: i === 0 ? "1px solid #00ff4130" : "1px solid transparent",
							color: i === 0 ? "#00ff41" : "#4a6e4a",
						}}
					>
						{item === "AI Assistant" ? <span className="ai-shimmer">{item}</span> : item}
					</button>
				))}
			</div>

			{/* Right: Status */}
			<div className="flex items-center gap-4 text-xs" style={{ color: "#4a6e4a" }}>
				<span>
					<span style={{ color: "#00ff41" }}>5</span> connected
				</span>
				<span>
					<span style={{ color: "#00e5ff" }}>2</span> tunnels
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
