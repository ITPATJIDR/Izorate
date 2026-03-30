import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../types/session";
import { STATUS_DOT, TYPE_ICON } from "../types/session";

interface SessionSidebarProps {
	sessions: Session[];
	activeId: number | null;
	onSelect: (id: number) => void;
	onNewSession: () => void;
	onEditSession: (session: Session) => void;
	onSessionsChanged: (sessions: Session[]) => void;
	onDataChanged: () => void;
	refreshTrigger: number;
	width?: number;
}

type ContextMenuState = { x: number; y: number } & (
	| { type: "session"; session: Session }
	| { type: "group"; name: string }
);

export function SessionSidebar({
	sessions,
	activeId,
	onSelect,
	onNewSession,
	onEditSession,
	onSessionsChanged,
	onDataChanged,
	refreshTrigger,
	width = 220,
}: SessionSidebarProps) {
	const [filter, setFilter] = useState("");
	const [dbGroups, setDbGroups] = useState<string[]>([]);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const [isCreatingGroup, setIsCreatingGroup] = useState(false);
	const [newGroupName, setNewGroupName] = useState("");
	const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	const handleMoveToGroup = async (sessionId: number, groupName: string) => {
		try {
			await invoke("move_connection_group", { id: sessionId, groupName });
			onDataChanged();
		} catch (err) {
			console.error("Failed to move session:", err);
		}
	};

	useEffect(() => {
		Promise.all([
			invoke<{ id: number; name: string; host: string; port: number; conn_type: string; username: string; group_name: string; password?: string }[]>("get_connections"),
			invoke<string[]>("get_groups").catch(() => ["Default"])
		])
			.then(([conns, groups]) => {
				setDbGroups(groups);
				if (conns.length > 0) {
					const mapped: Session[] = conns.map(c => ({
						id: c.id,
						name: c.name,
						host: c.host,
						port: c.port,
						type: c.conn_type as Session["type"],
						status: "disconnected",
						group: c.group_name,
						username: c.username,
						password: c.password,
					}));
					onSessionsChanged(mapped);
				} else {
					onSessionsChanged([]);
				}
			})
			.catch(() => {
				onSessionsChanged([]);
			});
	}, [refreshTrigger, onSessionsChanged]);

	useEffect(() => {
		const handleGlobalClick = () => setContextMenu(null);
		window.addEventListener("click", handleGlobalClick);
		return () => window.removeEventListener("click", handleGlobalClick);
	}, []);

	const toggleGroup = (group: string) => {
		setCollapsedGroups(prev => {
			const next = new Set(prev);
			if (next.has(group)) next.delete(group);
			else next.add(group);
			return next;
		});
	};

	const handleCreateGroup = async (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && newGroupName.trim()) {
			try {
				await invoke("add_group", { name: newGroupName.trim() });
				setNewGroupName("");
				setIsCreatingGroup(false);
				setDbGroups(prev => Array.from(new Set([...prev, newGroupName.trim()])));
				onDataChanged();
			} catch (err) {
				console.error("Failed to add group:", err);
			}
		} else if (e.key === "Escape") {
			setIsCreatingGroup(false);
			setNewGroupName("");
		}
	};

	const handleDeleteSession = async (id: number) => {
		if (confirm("Are you sure you want to delete this connection?")) {
			try {
				await invoke("delete_connection", { id });
				onDataChanged();
			} catch (err) {
				console.error(err);
			}
		}
	};

	const handleRenameGroup = async (oldName: string) => {
		const newName = prompt(`Rename group "${oldName}" to:`, oldName);
		if (newName && newName.trim() !== "" && newName !== oldName) {
			try {
				await invoke("rename_group", { oldName, newName: newName.trim() });
				onDataChanged();
			} catch (err) {
				console.error(err);
			}
		}
	};

	const handleDeleteGroup = async (name: string) => {
		if (confirm(`Delete group "${name}"?\n(Connections inside will be moved to Default)`)) {
			try {
				await invoke("delete_group", { name });
				onDataChanged();
			} catch (err) {
				console.error(err);
			}
		}
	};

	const filtered = sessions.filter(s =>
		filter === "" || s.name.toLowerCase().includes(filter.toLowerCase()) || s.host.includes(filter)
	);

	const displayGroups = filter === ""
		? dbGroups
		: [...new Set(filtered.map(s => s.group))];

	return (
		<div className="relative flex flex-col h-full shrink-0" style={{ width: `${width}px`, background: "var(--bg-surface)", borderRight: "1px solid var(--accent-primary)15" }}>
			{/* Search & Add Group Header */}
			<div className="flex flex-col gap-2 p-2 border-b" style={{ borderColor: "var(--border-focus)" }}>
				<div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-primary)25" }}>
					<span style={{ color: "var(--accent-primary)80" }}>⌕</span>
					<input
						className="bg-transparent text-xs outline-none flex-1 placeholder-emerald-900"
						placeholder="filter sessions..."
						style={{ color: "var(--accent-primary)", fontFamily: "inherit" }}
						value={filter}
						onChange={e => setFilter(e.target.value)}
					/>
				</div>
				<div className="flex justify-between items-center px-1">
					<span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>GROUPS</span>
					<button
						onClick={() => setIsCreatingGroup(true)}
						className="text-xs hover:text-green-400 transition-colors"
						style={{ color: "var(--accent-primary)60" }}
						title="Create new group"
					>
						+
					</button>
				</div>
			</div>

			{isCreatingGroup && (
				<div className="px-2 py-2 border-b" style={{ borderColor: "var(--border-focus)", background: "var(--bg-base)" }}>
					<input
						autoFocus
						className="w-full bg-transparent text-xs outline-none px-2 py-1 rounded placeholder-emerald-900"
						placeholder="group name & Enter..."
						style={{ color: "var(--accent-primary)", border: "1px dashed var(--accent-primary)40" }}
						value={newGroupName}
						onChange={e => setNewGroupName(e.target.value)}
						onKeyDown={handleCreateGroup}
						onBlur={() => { setIsCreatingGroup(false); setNewGroupName(""); }}
					/>
				</div>
			)}

			{/* Group List */}
			<div className="flex-1 overflow-y-auto py-1 custom-scrollbar" onContextMenu={e => e.preventDefault()}>
				{displayGroups.map(group => {
					const groupSessions = filtered.filter(s => s.group === group);
					const isCollapsed = collapsedGroups.has(group);
					const isDragOver = dragOverGroup === group;

					return (
						<div
							key={group}
							className={`mb-1 transition-colors duration-200 ${isDragOver ? "bg-[var(--bg-hover)] border-y border-[var(--border-focus)]" : ""}`}
							onDragOver={e => {
								e.preventDefault();
								if (dragOverGroup !== group) setDragOverGroup(group);
							}}
							onDragLeave={() => setDragOverGroup(null)}
							onDrop={e => {
								e.preventDefault();
								setDragOverGroup(null);
								const sessionId = e.dataTransfer.getData("sessionId");
								if (sessionId) handleMoveToGroup(Number(sessionId), group);
							}}
						>
							<button
								onClick={() => toggleGroup(group)}
								onContextMenu={e => {
									e.preventDefault();
									e.stopPropagation();
									if (group.toLowerCase() !== "default") {
										setContextMenu({ x: e.pageX, y: e.pageY, type: "group", name: group });
									}
								}}
								className="w-full px-3 py-1.5 flex items-center gap-1 text-xs font-semibold tracking-widest transition-colors hover:bg-[var(--bg-base)]/20"
								style={{ color: isDragOver ? "var(--accent-primary)" : "var(--accent-primary)50" }}
							>
								<span>{isCollapsed ? "▸" : "▾"}</span>
								{group.toUpperCase()}
								<span className="ml-auto text-[10px]" style={{ color: "var(--accent-primary)20" }}>
									{groupSessions.length}
								</span>
							</button>

							{!isCollapsed && (
								<div className="pl-1">
									{groupSessions.length === 0 && filter === "" && (
										<div className="px-5 py-1 text-[10px] italic" style={{ color: "#2a4a2a" }}>
											Empty
										</div>
									)}
									{groupSessions.map(session => (
										<button
											key={session.id}
											draggable
											onDragStart={e => {
												e.dataTransfer.setData("sessionId", session.id.toString());
												// Add a ghost image or just let default handle it
											}}
											onClick={() => onSelect(session.id)}
											onContextMenu={e => {
												e.preventDefault();
												e.stopPropagation();
												setContextMenu({ x: e.pageX, y: e.pageY, type: "session", session });
											}}
											className="w-full flex items-center gap-2 px-4 py-1.5 text-left transition-all duration-150 cursor-grab active:cursor-grabbing"
											style={{
												background: activeId === session.id ? "var(--bg-hover)" : "transparent",
												borderLeft: activeId === session.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
											}}
										>
											<div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[session.status]}`} />
											<span className="text-xs truncate" style={{ color: activeId === session.id ? "var(--accent-primary)" : "var(--text-muted)" }}>
												{TYPE_ICON[session.type]} {session.name}
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Add Session button */}
			<div className="p-2 border-t" style={{ borderColor: "var(--border-focus)" }}>
				<button
					onClick={onNewSession}
					className="w-full py-2 text-xs rounded transition-all duration-200 hover:brightness-125"
					style={{
						background: "linear-gradient(135deg, #0f2a0f, #1a4a1a)",
						border: "1px solid var(--accent-primary)40",
						color: "var(--accent-primary)",
					}}
				>
					+ New Session
				</button>
			</div>

			{/* Context Menu Overlay */}
			{contextMenu && (
				<div
					className="fixed z-50 py-1 rounded shadow-xl border flex flex-col"
					style={{
						left: contextMenu.x,
						top: contextMenu.y,
						background: "var(--bg-surface)",
						borderColor: "var(--border-focus)",
						minWidth: "140px",
					}}
					onClick={e => e.stopPropagation()}
				>
					{contextMenu.type === "session" ? (
						<>
							<button
								className="px-4 py-1.5 text-xs text-left hover:bg-[var(--bg-base)]/40 transition-colors"
								style={{ color: "var(--accent-primary)" }}
								onClick={() => { onEditSession(contextMenu.session); setContextMenu(null); }}
							>
								✎ Edit Connection
							</button>
							<button
								className="px-4 py-1.5 text-xs text-left hover:bg-[var(--bg-base)]/40 transition-colors"
								style={{ color: "#ff6b6b" }}
								onClick={() => { handleDeleteSession(contextMenu.session.id); setContextMenu(null); }}
							>
								✕ Delete Connection
							</button>
						</>
					) : (
						<>
							<button
								className="px-4 py-1.5 text-xs text-left hover:bg-[var(--bg-base)]/40 transition-colors"
								style={{ color: "var(--accent-primary)" }}
								onClick={() => { handleRenameGroup(contextMenu.name); setContextMenu(null); }}
							>
								✎ Rename Group
							</button>
							<button
								className="px-4 py-1.5 text-xs text-left hover:bg-[var(--bg-base)]/40 transition-colors"
								style={{ color: "#ff6b6b" }}
								onClick={() => { handleDeleteGroup(contextMenu.name); setContextMenu(null); }}
							>
								✕ Delete Group
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
