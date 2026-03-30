import { useEffect, useRef, useState } from "react";
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
	const fitAddonRef = useRef<FitAddon | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const [refreshKey, setRefreshKey] = useState(0);
	const [isRecording, setIsRecording] = useState(false);
	const [fontSize, setFontSize] = useState(14);
	const [fontColor, setFontColor] = useState("var(--accent-primary)");

	useEffect(() => {
		invoke<string | null>("get_izorate_setting", { key: "terminal_font_color" })
			.then(color => {
				if (color) setFontColor(color);
			})
			.catch(console.error);
	}, []);

	useEffect(() => {
		if (!terminalRef.current) return;

		// Initialize Xterm.js
		const term = new Terminal({
			theme: {
				background: "#0a0a0a",
				foreground: fontColor,
				cursor: fontColor,
				selectionBackground: `${fontColor}40`,
			},
			fontFamily: "'Fira Code', 'Courier New', monospace",
			fontSize: fontSize,
			cursorBlink: true,
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		fitAddonRef.current = fitAddon;
		term.loadAddon(fitAddon);

		term.open(terminalRef.current);

		// Slight delay to ensure DOM is ready for fit calculation
		setTimeout(() => {
			try { fitAddon.fit(); } catch (e) { }
		}, 10);

		xtermRef.current = term;

		// Handle Ctrl + ] for AI context
		term.attachCustomKeyEventHandler((e) => {
			if (e.ctrlKey && (e.key === "]" || e.keyCode === 221) && e.type === "keydown") {
				const selection = term.getSelection();
				if (selection) {
					invoke("emit_terminal_selection", {
						text: selection,
						sessionName: session.name
					}).catch(console.error);
				}
				return false; // Prevent default
			}
			return true;
		});

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

		// Auto-copy on selection
		const onSelectionDisp = term.onSelectionChange(() => {
			const selection = term.getSelection();
			if (selection && selection.length > 0) {
				navigator.clipboard.writeText(selection).then(() => {
					invoke("save_clipboard_history", { content: selection }).catch(console.error);
				}).catch(console.error);
			}
		});

		const handleWindowResize = () => {
			try { fitAddon.fit(); } catch (e) { }
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey) {
				if (e.key === '=' || e.key === '+') {
					e.preventDefault();
					setFontSize(prev => Math.min(prev + 1, 30));
				} else if (e.key === '-') {
					e.preventDefault();
					setFontSize(prev => Math.max(prev - 1, 8));
				} else if (e.key === '0') {
					e.preventDefault();
					setFontSize(14);
				}
			}
		};

		const handleWheel = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
				if (e.deltaY < 0) {
					setFontSize(prev => Math.min(prev + 1, 30));
				} else {
					setFontSize(prev => Math.max(prev - 1, 8));
				}
			}
		};

		const handleContextMenu = async (e: MouseEvent) => {
			e.preventDefault();
			try {
				const text = await navigator.clipboard.readText();
				if (text) {
					term.paste(text);
				}
			} catch (err) {
				console.error("Failed to read clipboard:", err);
			}
		};

		window.addEventListener("resize", handleWindowResize);
		const terminalEl = terminalRef.current;
		if (terminalEl) {
			terminalEl.addEventListener("keydown", handleKeyDown, true);
			terminalEl.addEventListener("wheel", handleWheel, { passive: false });
			terminalEl.addEventListener("contextmenu", handleContextMenu);
		}

		return () => {
			window.removeEventListener("resize", handleWindowResize);
			if (terminalEl) {
				terminalEl.removeEventListener("keydown", handleKeyDown, true);
				terminalEl.removeEventListener("wheel", handleWheel);
				terminalEl.removeEventListener("contextmenu", handleContextMenu);
			}
			onDataDisp.dispose();
			onResizeDisp.dispose();
			onSelectionDisp.dispose();
			term.dispose();
			if (unlistenOut) unlistenOut();
			if (unlistenConnected) unlistenConnected();
			if (unlistenClosed) unlistenClosed();

			// Attempt to safely close the session backend side when switching tabs
			invoke("write_pty", { id: session.id, data: "exit\n" }).catch(() => { });
		};
	}, [session.id, refreshKey]); // Re-run when switching sessions or refreshing

	useEffect(() => {
		if (xtermRef.current && fitAddonRef.current) {
			xtermRef.current.options.fontSize = fontSize;
			try {
				fitAddonRef.current.fit();
			} catch (e) { }
		}
	}, [fontSize]);

	useEffect(() => {
		if (xtermRef.current) {
			xtermRef.current.options.theme = {
				background: "#0a0a0a",
				foreground: fontColor,
				cursor: fontColor,
				selectionBackground: `${fontColor}40`,
			};
		}
	}, [fontColor]);

	const startRecording = () => {
		if (!terminalRef.current) return;
		const canvas = terminalRef.current.querySelector('canvas.xterm-webgl-layer')
			|| terminalRef.current.querySelector('canvas.xterm-link-layer')
			|| terminalRef.current.querySelector('canvas.xterm-text-layer')
			|| terminalRef.current.querySelector('canvas');

		if (!canvas) {
			console.error("Canvas element not found for recording");
			return;
		}

		try {
			// @ts-ignore - captureStream might not be in the typings but exists in browsers
			const stream = (canvas as any).captureStream(30);
			const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

			chunksRef.current = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.onstop = async () => {
				const blob = new Blob(chunksRef.current, { type: 'video/webm' });
				const arrayBuffer = await blob.arrayBuffer();
				const bytes = new Uint8Array(arrayBuffer);
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const filename = `terminal-${session.name}-${timestamp}.webm`;

				try {
					await invoke("save_terminal_video", { bytes: Array.from(bytes), filename });
					alert(`Recording saved as ${filename}`);
				} catch (err) {
					console.error("Failed to save recording:", err);
					alert(`Failed to save recording: ${err}`);
				}
			};

			recorder.start();
			mediaRecorderRef.current = recorder;
			setIsRecording(true);
		} catch (err) {
			console.error("Failed to start recording:", err);
			alert("Failed to start recording. MediaRecorder might not be supported or canvas capture failed.");
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
			mediaRecorderRef.current.stop();
			setIsRecording(false);
		}
	};

	return (
		<div className="flex-1 flex flex-col bg-[var(--bg-base)]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "var(--border-focus)", background: "#0d0d0d" }}>
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold crt-glow" style={{ color: fontColor }}>
						{session.name}
					</span>
					<span className="text-xs" style={{ color: "var(--text-muted)" }}>
						{session.username}@{session.host}:{session.port || 22}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => isRecording ? stopRecording() : startRecording()}
						className="px-3 py-1 text-xs font-semibold rounded transition-colors"
						style={{
							color: isRecording ? "#ff3e3e" : fontColor,
							border: `1px solid ${isRecording ? "#ff3e3e40" : fontColor + "40"}`,
							background: isRecording ? "#ff3e3e10" : "transparent"
						}}
						onMouseEnter={(e) => e.currentTarget.style.background = isRecording ? "#ff3e3e20" : `${fontColor}20`}
						onMouseLeave={(e) => e.currentTarget.style.background = isRecording ? "#ff3e3e10" : "transparent"}
						title={isRecording ? "Stop Recording" : "Record Terminal"}
					>
						{isRecording ? "Stop" : "Record"}
					</button>

					<button
						onClick={() => setRefreshKey(prev => prev + 1)}
						className="px-3 py-1 text-xs font-semibold rounded transition-colors"
						style={{ color: fontColor, border: `1px solid ${fontColor}40`, background: "transparent", cursor: "pointer" }}
						onMouseEnter={(e) => e.currentTarget.style.background = `${fontColor}20`}
						onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
						title="Refresh Connection"
					>
						Refresh
					</button>
				</div>
			</div>

			{/* Terminal Container */}
			<div className="flex-1 relative overflow-hidden">
				<div ref={terminalRef} className="absolute inset-0" style={{ padding: '8px 4px 8px 8px' }} />
			</div>
		</div>
	);
}
