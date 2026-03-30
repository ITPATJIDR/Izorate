import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Session } from "../types/session";
import { TracerouteGraph } from "./TracerouteGraph";
import { PasswordPromptModal } from "./PasswordPromptModal";

interface Props {
	sessions: Session[];
}

export function ToolsPane({ sessions }: Props) {
	const [activeTool, setActiveTool] = useState("Ping");
	const [destination, setDestination] = useState("");
	const [results, setResults] = useState<string[]>([]);
	const [traceResults, setTraceResults] = useState<string[]>([]);
	const [isPinging, setIsPinging] = useState(false);
	const [isTracing, setIsTracing] = useState(false);
	const [ports, setPorts] = useState<any[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [checkResult] = useState<{ port: number, status: 'idle' | 'checking' | 'connected' | 'failed', latency?: number, error?: string } | null>(null);
	const resultsEndRef = useRef<HTMLDivElement>(null);

	// Remote execution state
	const [sourceSessionId, setSourceSessionId] = useState<number>(-1); // -1 = Local Machine
	const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
	const [pendingAction, setPendingAction] = useState<{ type: string, args: any } | null>(null);

	// Tool availability state
	const [toolAvailability, setToolAvailability] = useState<any>(null);

	const scrollToBottom = () => {
		resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [results]);

	useEffect(() => {
		// Fetch tool availability info on mount
		invoke("check_tool_availability").then((result: any) => {
			setToolAvailability(result);
		}).catch(console.error);
	}, []);

	useEffect(() => {
		let unlistenPing: (() => void) | undefined;
		let unlistenTrace: (() => void) | undefined;

		const setupListeners = async () => {
			unlistenPing = await listen<string>("ping-result", (event) => {
				setResults(prev => [...prev, event.payload]);
			});
			unlistenTrace = await listen<string>("traceroute-result", (event) => {
				setTraceResults(prev => [...prev, event.payload]);
			});
		};

		setupListeners();

		return () => {
			if (unlistenPing) unlistenPing();
			if (unlistenTrace) unlistenTrace();
		};
	}, []);

	const checkAndRun = async (type: string, args: any) => {
		if (sourceSessionId === -1) {
			runTool(type, args);
			return;
		}

		const session = sessions.find(s => (s.id as unknown as number) === sourceSessionId);
		if (session && !session.password) {
			setPendingAction({ type, args });
			setIsPasswordModalOpen(true);
		} else {
			runTool(type, args);
		}
	};

	const runTool = async (type: string, args: any, password?: string) => {
		if (type === 'ping') {
			setResults([`Pinging ${args.host} from ${sourceSessionId === -1 ? 'Local Machine' : 'Remote Session'}...`]);
			setIsPinging(true);
			try {
				await invoke("ping_host", {
					host: args.host,
					count: 4,
					sourceSessionId,
					password: password || null
				});
			} catch (err) {
				setResults(prev => [...prev, `Error: ${err}`]);
			} finally {
				setIsPinging(false);
			}
		} else if (type === 'trace') {
			setTraceResults([`Traceroute to ${args.host} from ${sourceSessionId === -1 ? 'Local Machine' : 'Remote Session'}...`]);
			setIsTracing(true);
			try {
				await invoke("traceroute_host", {
					host: args.host,
					sourceSessionId,
					password: password || null
				});
			} catch (err) {
				setTraceResults(prev => [...prev, `Error: ${err}`]);
			} finally {
				setIsTracing(false);
			}
		} else if (type === 'ports') {
			setIsScanning(true);
			setPorts([]);
			try {
				const result = await invoke<any[]>("get_local_ports", {
					sourceSessionId,
					password: password || null
				});
				setPorts(result);
			} catch (err) {
				console.error("Failed to fetch ports:", err);
			} finally {
				setIsScanning(false);
			}
		}
	};

	const handlePasswordSubmit = (password: string) => {
		if (pendingAction) {
			runTool(pendingAction.type, pendingAction.args, password);
			setPendingAction(null);
		}
		setIsPasswordModalOpen(false);
	};

	const tools = [
		{ id: "Ping", icon: "📡" },
		{ id: "Port Scan", icon: "🔍" },
		{ id: "Trace", icon: "📍" },
	];

	const activeSessionName = sessions.find(s => (s.id as unknown as number) === sourceSessionId)?.name || "Local Machine";

	return (
		<div className="flex-1 flex flex-col md:flex-row bg-[var(--bg-base)] overflow-hidden">
			{/* Sidebar */}
			<div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-[var(--bg-hover)] bg-[var(--bg-surface)] flex flex-col shrink-0">
				<h3 className="hidden md:block px-3 py-4 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Network Tools</h3>
				<div className="flex flex-row md:flex-col p-2 gap-1 overflow-x-auto md:overflow-x-visible no-scrollbar">
					{tools.map((tool) => (
						<button
							key={tool.id}
							onClick={() => setActiveTool(tool.id)}
							className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded text-xs transition-all whitespace-nowrap ${activeTool === tool.id
								? "bg-[var(--bg-hover)] text-[var(--accent-primary)] border border-[var(--border-focus)]"
								: "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-primary)]"
								}`}
						>
							<span className="text-sm md:text-base">{tool.icon}</span>
							{tool.id}
						</button>
					))}
				</div>
			</div>

			{/* Tool Content */}
			<div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto">
				<div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
					<div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
						<div>
							<h2 className="text-xl md:text-2xl font-bold text-[var(--accent-primary)] crt-glow mb-1">{activeTool}</h2>
							<p className="text-xs text-[var(--text-muted)]">
								{activeTool === "Ping" ? "Test connectivity to a remote host." :
									activeTool === "Port Scan" ? "Scan local/remote ports and test connectivity." :
										activeTool === "Trace" ? "Visualize network hops to a destination." :
											"This tool is not implemented yet."}
							</p>
							{toolAvailability && sourceSessionId === -1 && (() => {
								const key = activeTool === "Ping" ? "ping" : activeTool === "Trace" ? "traceroute" : "ports";
								const info = toolAvailability[key];
								if (!info) return null;
								const isNative = info.native;
								return (
									<span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded-full border ${isNative ? 'text-text-emerald-500/80 border-[var(--border-focus)] bg-[var(--bg-hover)]' : 'text-[var(--amber)] border-[var(--amber)30] bg-[var(--amber)08]'}`}>
										<span className="text-[8px]">{isNative ? '●' : '◐'}</span>
										{isNative ? 'Native' : `Fallback: ${info.fallback}`}
									</span>
								);
							})()}
						</div>

						{/* Source Selector */}
						<div className="flex flex-col gap-1.5 min-w-[200px]">
							<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Execute From (Source)</label>
							<select
								value={sourceSessionId}
								onChange={(e) => setSourceSessionId(parseInt(e.target.value))}
								className="bg-[#0f1a0f] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs rounded px-3 py-2 outline-none focus:border-[var(--accent-primary)] transition-all"
							>
								<option value="-1">Local Machine (This PC)</option>
								<optgroup label="Saved Sessions">
									{sessions.map(s => (
										<option key={s.id} value={s.id as unknown as number}>{s.name} ({s.host})</option>
									))}
								</optgroup>
							</select>
						</div>
					</div>

					{activeTool === "Ping" ? (
						<div className="flex-1 flex flex-col gap-6">
							<div className="grid grid-cols-1 gap-4">
								<div className="space-y-2">
									<label className="text-xs font-semibold text-[var(--text-muted)] block">Destination Host</label>
									<div className="flex gap-1">
										<input
											type="text"
											value={destination}
											onChange={(e) => setDestination(e.target.value)}
											placeholder="google.com or 8.8.8.8"
											className="flex-1 bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
										/>
										<select
											className="bg-[#0f1a0f] border border-[var(--border-focus)] text-[var(--accent-primary)] text-[10px] rounded px-1 outline-none w-20"
											onChange={(e) => { if (e.target.value) setDestination(e.target.value); e.target.value = ""; }}
											value=""
										>
											<option value="" disabled>Saved</option>
											{sessions.map(s => (
												<option key={s.id} value={s.host}>{s.name} ({s.host})</option>
											))}
										</select>
									</div>
								</div>
							</div>

							<button
								onClick={() => checkAndRun('ping', { host: destination })}
								disabled={isPinging || !destination}
								className="w-full sm:w-auto px-8 py-2.5 rounded bg-[var(--accent-primary)] text-black text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)] disabled:opacity-50 disabled:cursor-not-allowed self-start"
							>
								{isPinging ? "Pinging..." : "Start Ping"}
							</button>

							<div className="flex-1 mt-4 flex flex-col rounded border border-[var(--border-focus)] bg-[var(--bg-base)]/50 overflow-hidden min-h-[200px]">
								<div className="px-3 py-2 border-b border-[var(--bg-hover)] bg-[var(--bg-surface)] flex items-center justify-between">
									<span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Output ({activeSessionName})</span>
									<button onClick={() => setResults([])} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-primary)]">Clear</button>
								</div>
								<div className="flex-1 p-3 font-mono text-xs overflow-y-auto custom-scrollbar">
									{results.length === 0 ? (
										<span className="text-[#2d4a2d] italic">No results yet.</span>
									) : (
										results.map((line, i) => (
											<div key={i} className="text-[var(--accent-primary)] leading-relaxed select-text">
												{line}
											</div>
										))
									)}
									<div ref={resultsEndRef} />
								</div>
							</div>
						</div>
					) : activeTool === "Trace" ? (
						<div className="flex-1 flex flex-col gap-6">
							<div className="grid grid-cols-1 gap-4">
								<div className="space-y-2">
									<label className="text-xs font-semibold text-[var(--text-muted)] block">Destination Host</label>
									<div className="flex gap-1">
										<input
											type="text"
											value={destination}
											onChange={(e) => setDestination(e.target.value)}
											placeholder="google.com or 8.8.8.8"
											className="flex-1 bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
										/>
										<select
											className="bg-[#0f1a0f] border border-[var(--border-focus)] text-[var(--accent-primary)] text-[10px] rounded px-1 outline-none w-20"
											onChange={(e) => { if (e.target.value) setDestination(e.target.value); e.target.value = ""; }}
											value=""
										>
											<option value="" disabled>Saved</option>
											{sessions.map(s => (
												<option key={s.id} value={s.host}>{s.name} ({s.host})</option>
											))}
										</select>
									</div>
								</div>
							</div>

							<button
								onClick={() => checkAndRun('trace', { host: destination })}
								disabled={isTracing || !destination}
								className="w-full sm:w-auto px-8 py-2.5 rounded bg-[var(--accent-primary)] text-black text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)] disabled:opacity-50 disabled:cursor-not-allowed self-start"
							>
								{isTracing ? "Tracing..." : "Start Trace"}
							</button>

							<div className="flex-1 flex flex-col gap-4 min-h-[500px]">
								<TracerouteGraph rawResults={traceResults} />

								<div className="h-48 flex flex-col rounded border border-[var(--border-focus)] bg-[var(--bg-base)]/50 overflow-hidden shrink-0">
									<div className="px-3 py-1.5 border-b border-[var(--bg-hover)] bg-[var(--bg-surface)] flex items-center justify-between">
										<span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Raw Log ({activeSessionName})</span>
										<button onClick={() => setTraceResults([])} className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent-primary)]">Clear</button>
									</div>
									<div className="flex-1 p-2 font-mono text-[10px] overflow-y-auto custom-scrollbar">
										{traceResults.map((line, i) => (
											<div key={i} className="text-text-emerald-500/80 leading-tight select-text">
												{line}
											</div>
										))}
									</div>
								</div>
							</div>
						</div>
					) : activeTool === "Port Scan" ? (
						<div className="flex-1 flex flex-col gap-8">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								{/* Local Port Scanner */}
								<div className="space-y-4 flex flex-col">
									<div>
										<h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Listening Ports</h4>
										<p className="text-[10px] text-[#2d4a2d] mb-4">View ports currently listening on <span className="text-[var(--accent-primary)]">{activeSessionName}</span>.</p>
										<button
											onClick={() => checkAndRun('ports', {})}
											disabled={isScanning}
											className="w-full py-2 rounded bg-[var(--bg-hover)] text-[var(--accent-primary)] border border-[var(--border-focus)] text-xs font-bold hover:bg-[var(--border-focus)] transition-all disabled:opacity-50"
										>
											{isScanning ? "Scanning..." : "Fetch Listening Ports"}
										</button>
									</div>

									<div className="flex-1 min-h-[300px] border border-[var(--border-focus)] rounded bg-[var(--bg-base)]/50 overflow-hidden flex flex-col">
										<div className="grid grid-cols-4 px-3 py-2 border-b border-[var(--bg-hover)] bg-[var(--bg-surface)] text-[10px] font-bold text-[var(--text-muted)] uppercase">
											<span>Proto</span>
											<span>Port</span>
											<span className="col-span-2 text-right">Address</span>
										</div>
										<div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px]">
											{ports.length === 0 ? (
												<div className="p-4 text-[#2d4a2d] italic text-center">No ports scanned yet.</div>
											) : (
												ports.map((p, i) => (
													<div key={i} className="grid grid-cols-4 px-3 py-1.5 border-b border-[#ffffff05] hover:bg-[var(--bg-hover)] group transition-colors">
														<span className="text-text-emerald-500/80">{p.protocol}</span>
														<span className="text-[var(--accent-primary)] font-bold">{p.port}</span>
														<span className="col-span-2 text-right text-[var(--text-main)] truncate">{p.address}</span>
													</div>
												))
											)}
										</div>
									</div>
								</div>

								{/* External Port Checker */}
								<div className="space-y-4">
									<div>
										<h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Connectivity Checker (Telnet)</h4>
										<p className="text-[10px] text-[#2d4a2d] mb-4">Test if a remote host:port is reachable from <span className="text-[var(--accent-primary)]">{activeSessionName}</span>.</p>
									</div>

									<div className="space-y-3 p-4 border border-[var(--bg-hover)] rounded bg-[var(--bg-surface)]">
										<div className="space-y-1">
											<label className="text-[10px] font-bold text-[var(--text-muted)]">Destination Host</label>
											<div className="flex gap-1">
												<input
													type="text"
													value={destination}
													onChange={(e) => setDestination(e.target.value)}
													placeholder="google.com"
													className="flex-1 bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
												/>
												<select
													className="bg-[#0f1a0f] border border-[var(--border-focus)] text-[var(--accent-primary)] text-[10px] rounded px-1 outline-none w-20"
													onChange={(e) => { if (e.target.value) setDestination(e.target.value); e.target.value = ""; }}
													value=""
												>
													<option value="" disabled>Saved</option>
													{sessions.map(s => (
														<option key={s.id} value={s.host}>{s.name} ({s.host})</option>
													))}
												</select>
											</div>
										</div>

										<div className="space-y-1">
											<label className="text-[10px] font-bold text-[var(--text-muted)]">Port Number</label>
											<input
												id="port-checker-input"
												type="number"
												placeholder="443"
												className="w-full bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
												onKeyDown={(e) => {
													if (e.key === 'Enter') {
														const port = parseInt(e.currentTarget.value);
														if (!isNaN(port)) runTool('check_port', { host: destination, port });
													}
												}}
											/>
										</div>

										<button
											onClick={() => {
												const input = document.getElementById('port-checker-input') as HTMLInputElement;
												const port = parseInt(input?.value || "0");
												if (port > 0) runTool('check_port', { host: destination, port });
											}}
											disabled={checkResult?.status === 'checking' || !destination}
											className="w-full py-2.5 rounded bg-[var(--accent-primary)] text-black text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)] disabled:opacity-50"
										>
											{checkResult?.status === 'checking' ? "Connecting..." : "Test Connection"}
										</button>

										{checkResult && (
											<div className={`mt-4 p-4 rounded border ${checkResult.status === 'connected' ? 'border-[var(--border-focus)] bg-[var(--bg-hover)]' : 'border-red-900/30 bg-red-900/5'}`}>
												<div className="flex items-center justify-between mb-2">
													<span className={`text-[10px] font-bold uppercase ${checkResult.status === 'connected' ? 'text-[var(--accent-primary)]' : 'text-[var(--red)]'}`}>
														{checkResult.status === 'connected' ? 'Success' : checkResult.status === 'failed' ? 'Failed' : 'Checking...'}
													</span>
													{checkResult.latency && (
														<span className="text-[10px] font-mono text-text-emerald-500/80">{checkResult.latency}ms</span>
													)}
												</div>
												<div className="text-xs font-mono">
													{checkResult.status === 'connected' ? (
														<span className="text-[var(--text-main)]">Connected to <span className="text-[var(--accent-primary)]">{destination}</span> on port <span className="text-[var(--accent-primary)]">{checkResult.port}</span></span>
													) : checkResult.status === 'failed' ? (
														<span className="text-[var(--red)80]">{checkResult.error || 'Connection timed out'}</span>
													) : (
														<span className="text-[var(--text-muted)] animate-pulse">Attempting TCP handshake...</span>
													)}
												</div>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					) : null}

					<PasswordPromptModal
						isOpen={isPasswordModalOpen}
						onClose={() => setIsPasswordModalOpen(false)}
						onSubmit={handlePasswordSubmit}
						sessionName={activeSessionName}
					/>
				</div>
			</div>
		</div>
	);
}
