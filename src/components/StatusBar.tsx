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
		}, 60000); // Poll every 1 minute instead of 10s to further reduce VPN connection noise

		// Run once immediately
		invoke<{ rx: number; tx: number }>("get_ssh_stats", { id: session.id })
			.then(s => { setRx(s.rx); setTx(s.tx); }).catch(() => { });

		return () => clearInterval(interval);
	}, [session.id, session.host, session.port]);

	return (
		<div className="flex items-center gap-4 px-4 py-1 text-xs border-t" style={{ background: "#080808", borderColor: "var(--border-focus)" }}>
			<span style={{ color: "var(--accent-primary)" }}>● {session.type.toUpperCase()}</span>
			<span style={{ color: "var(--text-muted)" }}>|</span>
			<span style={{ color: "var(--text-muted)" }}>host: </span>
			<span style={{ color: "#00e5ff" }}>{session.host}</span>
			<span style={{ color: "var(--text-muted)" }}>|</span>
			<span style={{ color: "var(--text-muted)" }}>port: </span>
			<span style={{ color: "var(--accent-primary)" }}>{session.port}</span>
			<span style={{ color: "var(--text-muted)" }}>|</span>
			<span style={{ color: "var(--text-muted)" }}>user: </span>
			<span style={{ color: "var(--accent-primary)" }}>{session.username}</span>
			<span style={{ color: "var(--text-muted)" }}>|</span>
			<span style={{ color: "var(--text-muted)" }}>enc: </span>
			<span style={{ color: "var(--accent-primary)" }}>auto</span>
			<div className="ml-auto flex gap-4">
				<span style={{ color: "var(--text-muted)" }}>latency: <span style={{ color: "var(--accent-primary)" }}>{latency !== null ? `${latency}ms` : '...'}</span></span>
				<span style={{ color: "var(--text-muted)" }}>rx: <span style={{ color: "#00e5ff" }}>{formatBytes(rx)}</span></span>
				<span style={{ color: "var(--text-muted)" }}>tx: <span style={{ color: "#00e5ff" }}>{formatBytes(tx)}</span></span>
			</div>
		</div>
	);
}
