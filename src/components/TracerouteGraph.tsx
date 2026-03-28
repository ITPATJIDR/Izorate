import { useMemo, useState, useEffect, useRef } from "react";

interface Hop {
	index: number;
	ip: string;
	latency: number; // in ms
	isTimeout: boolean;
	isLoop: boolean;
}

interface TracerouteGraphProps {
	rawResults: string[];
}

interface Position {
	x: number;
	y: number;
}

export function TracerouteGraph({ rawResults }: TracerouteGraphProps) {
	const [nodePositions, setNodePositions] = useState<Record<number, Position>>({});
	const [draggingNode, setDraggingNode] = useState<number | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);

	const hops = useMemo(() => {
		const parsedHops: Hop[] = [];
		const hopMap = new Map<number, Hop>();
		const seenIps = new Set<string>();

		for (const line of rawResults) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("traceroute to")) continue;

			const parts = trimmed.split(/\s+/);
			const index = parseInt(parts[0]);
			if (isNaN(index)) continue;

			if (parts[1] === "*") {
				if (!hopMap.has(index)) {
					const hop: Hop = { index, ip: "*", latency: 0, isTimeout: true, isLoop: false };
					hopMap.set(index, hop);
					parsedHops.push(hop);
				}
				continue;
			}

			const ipPart = parts.find(p => p.includes(".") || p.includes(":"));
			let latency = 0;
			for (let i = 0; i < parts.length; i++) {
				if (parts[i + 1] === "ms") {
					latency = parseFloat(parts[i]);
					break;
				}
			}

			if (ipPart && !hopMap.has(index)) {
				const ip = ipPart.replace(/[()]/g, "");
				const isLoop = seenIps.has(ip);
				if (!isLoop && ip !== "*") seenIps.add(ip);

				const hop: Hop = { index, ip, latency, isTimeout: false, isLoop };
				hopMap.set(index, hop);
				parsedHops.push(hop);
			}
		}
		return parsedHops.sort((a, b) => a.index - b.index);
	}, [rawResults]);

	// Initialize positions for new hops
	useEffect(() => {
		setNodePositions(prev => {
			const next = { ...prev };
			let changed = false;
			hops.forEach((hop, i) => {
				if (!next[hop.index]) {
					// Center horizontally (50% is roughly 400 in an 800 width view)
					next[hop.index] = { x: 400, y: 60 + i * 100 };
					changed = true;
				}
			});
			return changed ? next : prev;
		});
	}, [hops]);

	const handleMouseDown = (index: number) => {
		setDraggingNode(index);
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (draggingNode === null || !svgRef.current) return;

		const svg = svgRef.current;
		const CTM = svg.getScreenCTM();
		if (!CTM) return;

		const x = (e.clientX - CTM.e) / CTM.a;
		const y = (e.clientY - CTM.f) / CTM.d;

		setNodePositions(prev => ({
			...prev,
			[draggingNode]: { x, y }
		}));
	};

	const handleMouseUp = () => {
		setDraggingNode(null);
	};

	useEffect(() => {
		if (draggingNode !== null) {
			window.addEventListener("mouseup", handleMouseUp);
			return () => window.removeEventListener("mouseup", handleMouseUp);
		}
	}, [draggingNode]);

	const getLatencyColor = (ms: number) => {
		if (ms < 50) return "#00ff41";
		if (ms < 150) return "#ffb000";
		return "#ff2d55";
	};

	return (
		<div className="flex-1 min-h-[500px] relative bg-black/40 rounded-lg border border-[#00ff4110] overflow-hidden p-6 select-none cursor-default">
			<div className="absolute inset-0 pointer-events-none opacity-5 shadow-[inset_0_0_100px_rgba(0,255,65,0.2)]" />

			<div className="relative z-10 w-full h-full flex flex-col items-center">
				{hops.length === 0 && (
					<div className="mt-20 text-[#2d4a2d] italic text-sm">Waiting for trace data...</div>
				)}

				<svg
					ref={svgRef}
					viewBox="0 0 800 1200"
					className="w-full h-full min-h-[800px]"
					onMouseMove={handleMouseMove}
					style={{ filter: "drop-shadow(0 0 8px rgba(0,255,65,0.1))" }}
				>
					<defs>
						<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="19" refY="3.5" orient="auto">
							<polygon points="0 0, 10 3.5, 0 7" fill="#4a6e4a" />
						</marker>
						<filter id="glow">
							<feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
							<feMerge>
								<feMergeNode in="coloredBlur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					{hops.map((hop, i) => {
						const pos = nodePositions[hop.index] || { x: 400, y: 60 + i * 100 };
						const nextHop = hops[i + 1];
						const nextPos = nextHop ? (nodePositions[nextHop.index] || { x: 400, y: 60 + (i + 1) * 100 }) : null;

						return (
							<g key={hop.index}>
								{/* Path to next hop */}
								{nextPos && (
									<line
										x1={pos.x}
										y1={pos.y}
										x2={nextPos.x}
										y2={nextPos.y}
										stroke={nextHop.isTimeout ? "#2d4a2d" : getLatencyColor(nextHop.latency)}
										strokeWidth={nextHop.latency > 100 ? "3" : "2"}
										strokeDasharray={nextHop.isTimeout ? "4,4" : "none"}
										markerEnd="url(#arrowhead)"
										className="transition-all duration-300 ease-out"
										opacity={0.6}
									/>
								)}

								{/* Current Hop Node */}
								<g
									transform={`translate(${pos.x}, ${pos.y})`}
									onMouseDown={() => handleMouseDown(hop.index)}
									className="cursor-move group"
								>
									{/* Loop Indicator Glow */}
									{hop.isLoop && (
										<rect
											x="-125"
											y="-20"
											width="250"
											height="40"
											rx="6"
											fill="none"
											stroke="#ff00ff"
											strokeWidth="2"
											className="animate-pulse opacity-50"
											filter="url(#glow)"
										/>
									)}

									<rect
										x="-120"
										y="-18"
										width="240"
										height="36"
										rx="4"
										fill="#0d0d0d"
										stroke={hop.isLoop ? "#ff00ff" : (hop.isTimeout ? "#2d4a2d" : getLatencyColor(hop.latency))}
										strokeWidth={draggingNode === hop.index ? "2" : "1"}
										className="transition-all duration-300"
									/>

									<text
										x="-110"
										y="5"
										fill={hop.isLoop ? "#ff00ff" : (hop.isTimeout ? "#4a6e4a" : "#00ff41")}
										className="text-[10px] font-mono font-bold"
									>
										{hop.index}
									</text>

									<text
										x="0"
										y="5"
										textAnchor="middle"
										fill={hop.isTimeout ? "#4a6e4a" : (hop.isLoop ? "#ffb0ff" : "#ccc")}
										className="text-[11px] font-mono font-bold"
									>
										{hop.ip} {hop.isLoop && "[LOOP!]"}
									</text>

									{!hop.isTimeout && (
										<text
											x="110"
											y="5"
											textAnchor="end"
											fill={getLatencyColor(hop.latency)}
											className="text-[10px] font-mono font-bold"
										>
											{hop.latency.toFixed(1)}ms
										</text>
									)}
								</g>
							</g>
						);
					})}
				</svg>
			</div>
		</div>
	);
}
