import type { Session } from "../types/session";

interface StatusBarProps {
	session: Session;
}

export function StatusBar({ session }: StatusBarProps) {
	return (
		<div className="flex items-center gap-4 px-4 py-1 text-xs border-t" style={{ background: "#080808", borderColor: "#00ff4115" }}>
			<span style={{ color: "#00ff41" }}>● SSH</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>host: </span>
			<span style={{ color: "#00e5ff" }}>{session.host}</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>user: </span>
			<span style={{ color: "#00ff41" }}>root</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>enc: </span>
			<span style={{ color: "#00ff41" }}>AES256-CTR</span>
			<div className="ml-auto flex gap-4">
				<span style={{ color: "#4a6e4a" }}>latency: <span style={{ color: "#00ff41" }}>12ms</span></span>
				<span style={{ color: "#4a6e4a" }}>rx: <span style={{ color: "#00e5ff" }}>1.2MB</span></span>
				<span style={{ color: "#4a6e4a" }}>tx: <span style={{ color: "#00e5ff" }}>340KB</span></span>
			</div>
		</div>
	);
}
