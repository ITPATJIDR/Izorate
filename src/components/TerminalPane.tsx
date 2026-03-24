import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Session } from "../types/session";

interface Props {
	session: Session;
}

export function TerminalPane({ session }: Props) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);

	useEffect(() => {
		if (!terminalRef.current) return;

		// Initialize Xterm.js
		const term = new Terminal({
			theme: {
				background: "#0a0a0a",
				foreground: "#00ff41",
				cursor: "#00ff41",
				selectionBackground: "#00ff4140",
			},
			fontFamily: "'Fira Code', 'Courier New', monospace",
			fontSize: 14,
			cursorBlink: true,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(terminalRef.current);

		// Slight delay to ensure DOM is ready for fit calculation
		setTimeout(() => {
			try { fitAddon.fit(); } catch (e) { }
		}, 10);

		xtermRef.current = term;

		term.writeln(`\x1b[32m[Izorate] Connecting to ${session.username}@${session.host}...\x1b[0m`);

		let unlistenOut: (() => void) | undefined;
		let unlistenConnected: (() => void) | undefined;
		let unlistenClosed: (() => void) | undefined;

		// Start connection
		invoke("connect_ssh", { id: session.id }).catch(err => {
			term.writeln(`\r\n\x1b[31;1m[Terminal Error]\x1b[0m ${err}`);
			term.writeln(`\r\n\x1b[33mHint: Make sure the server is reachable and password is correct.\x1b[0m`);
		});

		const setupListeners = async () => {
			unlistenOut = await listen<string>(`ssh-out-${session.id}`, (e) => {
				term.write(e.payload);
			});
			unlistenConnected = await listen(`ssh-connected-${session.id}`, () => {
				term.writeln(`\r\n\x1b[32;1m[Connected]\x1b[0m`);
				// Sync terminal size with remote PTY instantly
				try {
					invoke("resize_pty", { id: session.id, cols: term.cols, rows: term.rows }).catch(() => { });
				} catch (e) { }
			});
			unlistenClosed = await listen(`ssh-closed-${session.id}`, () => {
				term.writeln(`\r\n\x1b[31;1m[Connection Closed by Remote Host]\x1b[0m`);
			});
		};
		setupListeners();

		// Send input from user typing
		const onDataDisp = term.onData(data => {
			invoke("write_pty", { id: session.id, data }).catch(console.error);
		});

		// Handle resize
		const onResizeDisp = term.onResize(({ cols, rows }) => {
			invoke("resize_pty", { id: session.id, cols, rows }).catch(console.error);
		});

		const handleWindowResize = () => {
			try { fitAddon.fit(); } catch (e) { }
		};
		window.addEventListener("resize", handleWindowResize);

		return () => {
			window.removeEventListener("resize", handleWindowResize);
			onDataDisp.dispose();
			onResizeDisp.dispose();
			term.dispose();
			if (unlistenOut) unlistenOut();
			if (unlistenConnected) unlistenConnected();
			if (unlistenClosed) unlistenClosed();

			// Attempt to safely close the session backend side when switching tabs
			invoke("write_pty", { id: session.id, data: "exit\n" }).catch(() => { });
		};
	}, [session.id]); // Re-run when switching sessions

	return (
		<div className="flex-1 flex flex-col bg-[#0a0a0a]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "#00ff4120", background: "#0d0d0d" }}>
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold crt-glow" style={{ color: "#00ff41" }}>
						{session.name}
					</span>
					<span className="text-xs" style={{ color: "#4a6e4a" }}>
						{session.username}@{session.host}:{session.port || 22}
					</span>
				</div>
			</div>

			{/* Terminal Container */}
			<div className="flex-1 relative overflow-hidden p-2">
				<div ref={terminalRef} className="w-full h-full" style={{ paddingLeft: '4px' }} />
			</div>
		</div>
	);
}
