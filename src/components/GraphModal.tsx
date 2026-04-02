import { useState, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { invoke } from "@tauri-apps/api/core";

interface Node {
	id: string;
	node_type: string;
	properties: string;
	color?: string;
	name?: string;
}

interface Link {
	source: string;
	target: string;
	rel_type: string;
}

interface GraphData {
	nodes: Node[];
	links: Link[];
}

interface GraphModalProps {
	chatId: number;
	onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
	"Service": "#22d3ee", // Cyan
	"Config": "#fbbf24",  // Amber
	"Error": "#ef4444",   // Red
	"Container": "#8b5cf6", // Violet
	"Network": "#10b981",  // Emerald
	"Port": "#f472b6",    // Pink
	"User": "#60a5fa",    // Blue
	"File": "#94a3b8"     // Slate
};

export const GraphModal = ({ chatId, onClose }: GraphModalProps) => {
	const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
	const [loading, setLoading] = useState(true);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const containerRef = useRef<HTMLDivElement>(null);
	const graphRef = useRef<any>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (let entry of entries) {
				setDimensions({
					width: entry.contentRect.width,
					height: entry.contentRect.height
				});
			}
		});

		resizeObserver.observe(containerRef.current);
		return () => resizeObserver.disconnect();
	}, []);

	useEffect(() => {
		const loadGraph = async () => {
			try {
				const res = await invoke<any>("get_chat_graph", { chatId });

				const nodes = res.entities.map((e: any) => ({
					id: e.id,
					name: e.id,
					node_type: e.node_type,
					properties: e.properties,
					color: TYPE_COLORS[e.node_type] || "#ffffff"
				}));

				const links = res.relationships.map((r: any) => ({
					source: r.source,
					target: r.target,
					rel_type: r.rel_type
				}));

				setData({ nodes, links });
			} catch (err) {
				console.error("Failed to load graph:", err);
			} finally {
				setLoading(false);
			}
		};

		loadGraph();
	}, [chatId]);

	return (
		<div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md">
			<div className="w-full h-full max-w-6xl max-h-[90vh] bg-[var(--bg-base)] border border-[var(--border-focus)] rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
				{/* Header */}
				<div className="px-6 py-4 border-b flex items-center justify-between bg-[var(--bg-surface)]" style={{ borderColor: "var(--border-focus)" }}>
					<div className="flex items-center gap-3">
						<div className="text-xl">🕸️</div>
						<div>
							<h3 className="text-sm font-bold uppercase tracking-widest text-[var(--accent-primary)]">Knowledge Graph</h3>
							<p className="text-[10px] text-[var(--text-muted)]">Structural relationships extracted from sanitized context</p>
						</div>
					</div>
					<div className="flex items-center gap-6">
						<div className="flex items-center gap-4">
							{Object.entries(TYPE_COLORS).map(([type, color]) => (
								<div key={type} className="flex items-center gap-1.5">
									<div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
									<span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">{type}</span>
								</div>
							))}
						</div>
						<button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors text-xl p-1">✕</button>
					</div>
				</div>

				{/* Content */}
				<div ref={containerRef} className="flex-1 relative bg-[#050505] overflow-hidden cursor-move">
					{loading ? (
						<div className="absolute inset-0 flex items-center justify-center text-[var(--accent-primary)] animate-pulse uppercase font-black tracking-widest">
							Generating Graph Projection...
						</div>
					) : data.nodes.length === 0 ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)] opacity-30 select-none">
							<div className="text-5xl mb-4">∅</div>
							<p className="text-sm uppercase tracking-widest font-bold">No Graph Data Extracted</p>
							<p className="text-xs mt-2 italic">Add sanitized terminal context to build the knowledge graph.</p>
						</div>
					) : (
						<ForceGraph2D
							ref={graphRef}
							width={dimensions.width}
							height={dimensions.height}
							graphData={data}
							nodeColor={n => (n as any).color}
							nodeLabel={n => `[${(n as any).node_type}] ${(n as any).id}\n${(n as any).properties}`}
							linkLabel={l => (l as any).rel_type}
							linkDirectionalArrowLength={3.5}
							linkDirectionalArrowRelPos={1}
							nodeCanvasObject={(node, ctx, globalScale) => {
								const label = node.id as string;
								const fontSize = 12 / globalScale;
								ctx.font = `${fontSize}px Inter, sans-serif`;
								const textWidth = ctx.measureText(label).width;
								const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding

								ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
								ctx.fillRect((node.x as number) - bckgDimensions[0] / 2, (node.y as number) - bckgDimensions[1] / 2, bckgDimensions[0] as number, bckgDimensions[1] as number);

								ctx.textAlign = 'center';
								ctx.textBaseline = 'middle';
								ctx.fillStyle = (node as any).color;
								ctx.fillText(label, node.x as number, node.y as number);
							}}
							nodePointerAreaPaint={(node, color, ctx) => {
								ctx.fillStyle = color;
								const bckgDimensions = [ctx.measureText(node.id as string).width, 12].map(n => n + 12 * 0.2);
								ctx.fillRect((node.x as number) - bckgDimensions[0] / 2, (node.y as number) - bckgDimensions[1] / 2, bckgDimensions[0] as number, bckgDimensions[1] as number);
							}}
						/>
					)}
				</div>

				{/* Footer Controls */}
				<div className="px-6 py-3 border-t bg-[var(--bg-surface)] flex items-center justify-between" style={{ borderColor: "var(--border-focus)" }}>
					<div className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">
						Double click to focus • Scroll to zoom • Drag to navigate
					</div>
					<button
						onClick={() => graphRef.current?.zoomToFit(400)}
						className="text-[10px] px-3 py-1 bg-[var(--bg-hover)] border border-[var(--border-focus)] text-[var(--accent-primary)] font-bold uppercase hover:border-[var(--accent-primary)] transition-all"
					>
						Center Graph
					</button>
				</div>
			</div>
		</div>
	);
};
