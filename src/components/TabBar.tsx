import type { Session } from "../types/session";
import { STATUS_DOT } from "../types/session";

interface TabBarProps {
	sessions: Session[];
	activeId: number | null;
	openTabIds: number[];
	onSelect: (id: number) => void;
	onClose: (id: number, e: React.MouseEvent) => void;
	onNew: () => void;
}

export function TabBar({ sessions, activeId, openTabIds, onSelect, onClose, onNew }: TabBarProps) {
	const openTabs = openTabIds.map(id => sessions.find(s => s.id === id)).filter(Boolean) as Session[];
	return (
		<div className="flex items-end gap-0 px-2 border-b overflow-x-auto" style={{ background: "var(--bg-base)", borderColor: "var(--border-focus)" }}>
			{openTabs.map(s => (
				<button
					key={s.id}
					onClick={() => onSelect(s.id)}
					className={`flex items-center gap-2 px-3 py-2 text-xs flex-shrink-0 transition-all duration-150 ${s.id === activeId ? "tab-active" : ""}`}
					style={{
						borderTop: "1px solid transparent",
						borderLeft: "1px solid transparent",
						borderRight: "1px solid transparent",
						...(s.id === activeId
							? { borderColor: "var(--border-focus)", borderBottom: "none", color: "var(--accent-primary)", background: "#050a05" }
							: { color: "var(--text-muted)" }
						),
					}}>
					<div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
					{s.name}
					<span
						className="ml-1 opacity-50 hover:opacity-100 p-1 hover:bg-[var(--bg-base)]/20 rounded cursor-pointer"
						onClick={(e) => onClose(s.id, e)}
					>
						✕
					</span>
				</button>
			))}
			<button onClick={onNew} className="px-3 py-2 text-xs transition-colors ml-1" style={{ color: "var(--text-muted)" }}>+ New</button>
		</div>
	);
}
