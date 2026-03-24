import { useState } from "react";
import { AI_SUGGESTIONS } from "../data/mockData";

export function AIPanel() {
	const [question, setQuestion] = useState("");
	const [chatHistory] = useState([
		{ role: "ai", text: "Connected to: prod-web-01. I can see your system stats. CPU: 12%, RAM: 4.2/8GB. How can I help?" },
		{ role: "user", text: "How do I check which process is using port 80?" },
		{ role: "ai", text: "Run: `lsof -i :80` or `ss -tlnp | grep :80`. On your system, nginx is already running on port 80 (PID 1337)." },
	]);

	return (
		<div className="flex flex-col h-full" style={{ width: "280px", background: "#0a0a0a", borderLeft: "1px solid #00ff4115" }}>
			{/* Header */}
			<div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "#00ff4115", background: "#0d0d0d" }}>
				<span className="ai-shimmer text-xs font-bold">⬡ AI ASSISTANT</span>
				<div className="ml-auto flex items-center gap-1">
					<div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
					<span className="text-xs" style={{ color: "#00e5ff" }}>Active</span>
				</div>
			</div>

			{/* Context badge */}
			<div className="px-3 py-2 text-xs" style={{ background: "#0f1a0f", borderBottom: "1px solid #00ff4115" }}>
				<span style={{ color: "#4a6e4a" }}>Context: </span>
				<span style={{ color: "#00e5ff" }}>prod-web-01</span>
				<span style={{ color: "#4a6e4a" }}> | </span>
				<span style={{ color: "#00ff41" }}>nginx, systemd, bash</span>
			</div>

			{/* Suggestions */}
			<div className="px-3 py-2 border-b" style={{ borderColor: "#00ff4115" }}>
				<div className="text-xs mb-1.5" style={{ color: "#4a6e4a" }}>INSIGHTS</div>
				<div className="flex flex-col gap-1">
					{AI_SUGGESTIONS.map((s, i) => (
						<div key={i} className="text-xs p-1.5 rounded cursor-pointer hover:brightness-125 transition-all"
							style={{ background: "#0f1a10", border: "1px solid #00ff4120", color: "#a0d4a0", lineHeight: 1.5 }}>
							{s}
						</div>
					))}
				</div>
			</div>

			{/* Chat */}
			<div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
				{chatHistory.map((msg, i) => (
					<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
						<div className="max-w-[90%] text-xs p-2 rounded leading-relaxed"
							style={msg.role === "ai"
								? { background: "#0f1a0f", border: "1px solid #00ff4125", color: "#a0d4a0" }
								: { background: "#0a1a2a", border: "1px solid #00e5ff25", color: "#a0d8e8" }
							}>
							{msg.role === "ai" && <span style={{ color: "#00ff4180" }}>⬡ </span>}
							{msg.text}
						</div>
					</div>
				))}
			</div>

			{/* Input */}
			<div className="p-2 border-t" style={{ borderColor: "#00ff4115" }}>
				<div className="flex items-center gap-2 p-2 rounded" style={{ background: "#0f1a0f", border: "1px solid #00ff4130" }}>
					<input
						value={question}
						onChange={e => setQuestion(e.target.value)}
						className="flex-1 bg-transparent outline-none text-xs placeholder-emerald-900"
						style={{ color: "#00ff41", fontFamily: "inherit" }}
						placeholder="ask AI anything..."
					/>
					<button className="text-xs transition-colors hover:text-green-300" style={{ color: "#00ff41" }}>⏎</button>
				</div>
				<div className="mt-1.5 flex gap-1 flex-wrap">
					{["explain logs", "fix error", "write script", "audit security"].map(tag => (
						<button key={tag} className="text-xs px-1.5 py-0.5 rounded transition-all hover:brightness-125"
							style={{ background: "#0a1a0a", border: "1px solid #00ff4120", color: "#4a8a4a" }}>
							{tag}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
