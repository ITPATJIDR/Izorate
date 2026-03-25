import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../types/session";

function formatBytes(bytes: number) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

interface StatusBarProps {
	session: Session;
}

export function StatusBar({ session }: StatusBarProps) {
	const [latency, setLatency] = useState<number | null>(null);
	const [rx, setRx] = useState<number>(0);
	const [tx, setTx] = useState<number>(0);

	useEffect(() => {
		const interval = setInterval(async () => {
			try {
				const stats = await invoke<{ rx: number; tx: number }>("get_ssh_stats", { id: session.id });
				setRx(stats.rx);
				setTx(stats.tx);
			} catch (e) {
				// Ignore if not connected yet
			}
			try {
				const lat = await invoke<number>("measure_latency", { host: session.host, port: session.port || 22 });
				setLatency(lat);
			} catch (e) {
				setLatency(null);
			}
		}, 2000);

		// Run once immediately
		invoke<{ rx: number; tx: number }>("get_ssh_stats", { id: session.id })
			.then(s => { setRx(s.rx); setTx(s.tx); }).catch(() => { });

		return () => clearInterval(interval);
	}, [session.id, session.host, session.port]);

	return (
		<div className="flex items-center gap-4 px-4 py-1 text-xs border-t" style={{ background: "#080808", borderColor: "#00ff4115" }}>
			<span style={{ color: "#00ff41" }}>● {session.type.toUpperCase()}</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>host: </span>
			<span style={{ color: "#00e5ff" }}>{session.host}</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>port: </span>
			<span style={{ color: "#00ff41" }}>{session.port}</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>user: </span>
			<span style={{ color: "#00ff41" }}>{session.username}</span>
			<span style={{ color: "#4a6e4a" }}>|</span>
			<span style={{ color: "#4a6e4a" }}>enc: </span>
			<span style={{ color: "#00ff41" }}>auto</span>
			<div className="ml-auto flex gap-4">
				<span style={{ color: "#4a6e4a" }}>latency: <span style={{ color: "#00ff41" }}>{latency !== null ? `${latency}ms` : '...'}</span></span>
				<span style={{ color: "#4a6e4a" }}>rx: <span style={{ color: "#00e5ff" }}>{formatBytes(rx)}</span></span>
				<span style={{ color: "#4a6e4a" }}>tx: <span style={{ color: "#00e5ff" }}>{formatBytes(tx)}</span></span>
			</div>
		</div>
	);
}
