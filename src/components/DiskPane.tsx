import { useEffect, useRef, useState } from "react";
import type { Session } from "../types/session";

interface DiskPartition {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  use_percent: number;
  mount_point: string;
}

interface DiskTopPath {
  size: string;
  path: string;
  size_bytes: number;
}

interface DiskInfo {
  partitions: DiskPartition[];
  top_paths: DiskTopPath[];
  session_name: string;
  session_id: number;
}

interface DiskPaneProps {
  sessions: Session[];
  diskData: Record<number, DiskInfo | "loading" | "error">;
  onOpenSession: (id: number) => void;
  onRefreshSessions: (ids: number[]) => void;
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
function getUsageColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 75) return "#f59e0b";
  if (pct >= 50) return "#3b82f6";
  return "#22c55e";
}

// ──────────────────────────────────────────────────────────
// Partition row (compact table row)
// ──────────────────────────────────────────────────────────
function PartitionRow({ p, animate }: { p: DiskPartition; animate: boolean }) {
  const color = getUsageColor(p.use_percent);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "110px 1fr 50px 50px 50px 42px",
      alignItems: "center",
      gap: "8px",
      padding: "4px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.025)",
      fontSize: "11px",
    }}>
      <span style={{ color: "#e2e8f0", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.mount_point}
      </span>
      <div style={{ height: "4px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: animate ? `${p.use_percent}%` : "0%",
          background: color,
          borderRadius: "3px",
          transition: "width 1.1s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 6px ${color}70`,
        }} />
      </div>
      <span style={{ color: "var(--text-muted)", textAlign: "right" }}>{p.size}</span>
      <span style={{ color: "#e2e8f0", textAlign: "right" }}>{p.used}</span>
      <span style={{ color: "#22c55e", textAlign: "right" }}>{p.available}</span>
      <span style={{ color, fontWeight: 700, textAlign: "right" }}>{p.use_percent}%</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Top paths mini list
// ──────────────────────────────────────────────────────────
function TopPathsCompact({ paths }: { paths: DiskTopPath[] }) {
  const maxBytes = paths[0]?.size_bytes || 1;
  return (
    <div>
      {paths.slice(0, 6).map((p, i) => {
        const barPct = (p.size_bytes / maxBytes) * 100;
        const isTop = i === 0;
        return (
          <div key={p.path} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "3px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.025)",
          }}>
            <span style={{ fontSize: "10px", color: isTop ? "#f59e0b" : "var(--text-muted)", width: "14px", textAlign: "center", flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.path}
            </span>
            <div style={{ width: "70px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.06)", overflow: "hidden", flexShrink: 0 }}>
              <div style={{
                height: "100%", width: `${barPct}%`,
                background: isTop ? "#f59e0b" : "var(--accent-primary)",
                borderRadius: "2px",
              }} />
            </div>
            <span style={{ fontSize: "10px", fontWeight: 600, color: isTop ? "#f59e0b" : "#94a3b8", flexShrink: 0, minWidth: "34px", textAlign: "right" }}>
              {p.size}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Single session card
// ──────────────────────────────────────────────────────────
function SessionDiskCard({
  session, data, onOpenSession, onRefresh,
}: {
  session: Session;
  data: DiskInfo | "loading" | "error";
  onOpenSession: (id: number) => void;
  onRefresh: (id: number) => void;
}) {
  const [animate, setAnimate] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const prevData = useRef(data);

  useEffect(() => {
    if (data === "loading") {
      setSpinning(true);
      setAnimate(false);
    } else {
      setSpinning(false);
      if (data !== "error" && prevData.current !== data) {
        setTimeout(() => setAnimate(true), 80);
      }
    }
    prevData.current = data;
  }, [data]);

  const handleRefresh = () => {
    setAnimate(false);
    onRefresh(session.id);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.01)",
      border: "1px solid var(--border-focus)",
      borderRadius: "6px",
      overflow: "hidden",
    }}>
      {/* Session header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "7px",
        padding: "5px 8px",
        background: "rgba(255,255,255,0.02)",
        borderBottom: "1px solid var(--border-focus)",
      }}>
        <div style={{
          width: "5px", height: "5px", borderRadius: "50%", flexShrink: 0,
          background: session.status === "connected" ? "#22c55e" : "#6b7280",
          boxShadow: session.status === "connected" ? "0 0 5px #22c55e99" : "none",
        }} />
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent-primary)", flex: 1 }}>
          {session.name}
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
          {session.host}:{session.port || 22}
        </span>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          title="Refresh disk info"
          style={{
            width: "22px", height: "22px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px",
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: "4px",
            cursor: "pointer",
            transition: "all 0.15s",
            animation: spinning ? "spin 0.8s linear infinite" : "none",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.color = "var(--accent-primary)";
            e.currentTarget.style.borderColor = "var(--border-focus)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          ↻
        </button>

        {/* Open session button */}
        <button
          onClick={() => onOpenSession(session.id)}
          title="Open terminal"
          style={{
            display: "flex", alignItems: "center", gap: "3px",
            padding: "2px 7px",
            fontSize: "10px", fontWeight: 600,
            color: "var(--accent-primary)",
            background: "var(--accent-primary)18",
            border: "1px solid var(--accent-primary)40",
            borderRadius: "4px",
            cursor: "pointer",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "var(--accent-primary)30";
            e.currentTarget.style.borderColor = "var(--accent-primary)80";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "var(--accent-primary)18";
            e.currentTarget.style.borderColor = "var(--accent-primary)40";
          }}
        >
          ⌨ Open
        </button>
      </div>

      {/* Loading */}
      {data === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px", color: "var(--text-muted)", fontSize: "11px" }}>
          <div style={{
            width: "11px", height: "11px", flexShrink: 0,
            border: "1.5px solid var(--border-focus)",
            borderTop: "1.5px solid var(--accent-primary)", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          Connecting via SSH...
        </div>
      )}

      {/* Error */}
      {data === "error" && (
        <div style={{ padding: "8px 10px", fontSize: "11px", color: "#fca5a5", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>⚠️</span>
          <span>Could not retrieve disk info — may require password or unreachable</span>
        </div>
      )}

      {/* Data */}
      {data !== "loading" && data !== "error" && (
        <div>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "110px 1fr 50px 50px 50px 42px",
            gap: "8px",
            padding: "3px 10px",
            fontSize: "9px", fontWeight: 600, color: "var(--text-muted)",
            letterSpacing: "0.07em", textTransform: "uppercase",
            borderBottom: "1px solid var(--border-focus)",
            background: "rgba(255,255,255,0.008)",
          }}>
            <span>Mount</span><span>Usage</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span style={{ textAlign: "right" }}>Used</span>
            <span style={{ textAlign: "right" }}>Free</span>
            <span style={{ textAlign: "right" }}>%</span>
          </div>

          {data.partitions.map(p => (
            <PartitionRow key={p.mount_point} p={p} animate={animate} />
          ))}

          {data.top_paths.length > 0 && (
            <>
              <div style={{
                padding: "3px 10px",
                fontSize: "9px", fontWeight: 600, color: "var(--text-muted)",
                letterSpacing: "0.07em", textTransform: "uppercase",
                borderTop: "1px solid var(--border-focus)",
                borderBottom: "1px solid var(--border-focus)",
                background: "rgba(255,255,255,0.008)",
              }}>
                📂 Largest Directories
              </div>
              <TopPathsCompact paths={data.top_paths} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Collapsible group
// ──────────────────────────────────────────────────────────
function GroupSection({
  groupName, sessions, diskData, onOpenSession, onRefreshSessions, onRefreshOne,
  defaultOpen,
}: {
  groupName: string;
  sessions: Session[];
  diskData: Record<number, DiskInfo | "loading" | "error">;
  onOpenSession: (id: number) => void;
  onRefreshSessions: (ids: number[]) => void;
  onRefreshOne: (id: number) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const ids = sessions.map(s => s.id);
  const loadingCount = ids.filter(id => diskData[id] === "loading").length;
  const errorCount = ids.filter(id => diskData[id] === "error").length;
  const doneCount = ids.filter(id => diskData[id] !== "loading" && diskData[id] !== undefined).length;

  return (
    <div style={{
      border: "1px solid var(--border-focus)",
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      {/* Group header */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "7px 10px",
          background: "rgba(255,255,255,0.03)",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.12s",
        }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      >
        {/* Chevron */}
        <span style={{
          fontSize: "10px", color: "var(--text-muted)",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
          display: "inline-block",
          width: "12px",
        }}>▶</span>

        {/* Group name */}
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", flex: 1, letterSpacing: "0.03em" }}>
          {groupName || "Default"}
        </span>

        {/* Badges */}
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
        {loadingCount > 0 && (
          <span style={{
            fontSize: "9px", padding: "1px 6px", borderRadius: "10px",
            background: "rgba(99,102,241,0.15)", color: "#a5b4fc",
            border: "1px solid rgba(99,102,241,0.3)",
          }}>
            {loadingCount} loading
          </span>
        )}
        {errorCount > 0 && (
          <span style={{
            fontSize: "9px", padding: "1px 6px", borderRadius: "10px",
            background: "rgba(239,68,68,0.12)", color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.25)",
          }}>
            {errorCount} failed
          </span>
        )}
        {doneCount === sessions.length && errorCount === 0 && loadingCount === 0 && (
          <span style={{
            fontSize: "9px", padding: "1px 6px", borderRadius: "10px",
            background: "rgba(34,197,94,0.1)", color: "#86efac",
            border: "1px solid rgba(34,197,94,0.25)",
          }}>
            ✓ done
          </span>
        )}

        {/* Refresh group button */}
        <button
          onClick={e => { e.stopPropagation(); onRefreshSessions(ids); }}
          title="Refresh all in group"
          style={{
            padding: "2px 7px",
            fontSize: "10px", fontWeight: 600,
            color: "var(--text-muted)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border-focus)",
            borderRadius: "4px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "var(--accent-primary)";
            e.currentTarget.style.borderColor = "var(--accent-primary)60";
            e.currentTarget.style.background = "var(--accent-primary)18";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border-focus)";
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
        >
          ↻ Refresh Group
        </button>
      </div>

      {/* Session cards (collapsible) */}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", padding: "6px", background: "rgba(0,0,0,0.15)" }}>
          {sessions.map(s => (
            <SessionDiskCard
              key={s.id}
              session={s}
              data={diskData[s.id] ?? "loading"}
              onOpenSession={onOpenSession}
              onRefresh={onRefreshOne}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main DiskPane
// ──────────────────────────────────────────────────────────
export function DiskPane({ sessions, diskData, onOpenSession, onRefreshSessions }: DiskPaneProps) {
  const sshSessions = sessions.filter(s => s.type === "ssh" || s.type === "sftp");

  // Group sessions by their group field
  const groups = sshSessions.reduce<Record<string, Session[]>>((acc, s) => {
    const g = s.group || "Default";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  const groupNames = Object.keys(groups).sort();

  const handleRefreshAll = () => {
    onRefreshSessions(sshSessions.map(s => s.id));
  };

  return (
    <div style={{
      flex: 1, overflow: "auto",
      padding: "12px 14px",
      background: "var(--bg-base)",
      fontFamily: "'Inter', 'Outfit', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-primary)", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>
          💾 Disk Usage
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
          {groupNames.length} group{groupNames.length !== 1 ? "s" : ""} · {sshSessions.length} session{sshSessions.length !== 1 ? "s" : ""}
        </span>
        {sshSessions.length > 0 && (
          <button
            onClick={handleRefreshAll}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "3px 9px",
              fontSize: "10px", fontWeight: 600,
              color: "var(--text-muted)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-focus)",
              borderRadius: "5px",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "var(--accent-primary)";
              e.currentTarget.style.borderColor = "var(--accent-primary)60";
              e.currentTarget.style.background = "var(--accent-primary)15";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border-focus)";
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
          >
            ↻ Refresh All
          </button>
        )}
      </div>

      {sshSessions.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", gap: "8px", opacity: 0.35 }}>
          <div style={{ fontSize: "36px" }}>💾</div>
          <div style={{ fontSize: "12px", color: "var(--accent-primary)", letterSpacing: "0.05em" }}>NO SSH SESSIONS</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {groupNames.map((g, i) => (
            <GroupSection
              key={g}
              groupName={g}
              sessions={groups[g]}
              diskData={diskData}
              onOpenSession={onOpenSession}
              onRefreshSessions={onRefreshSessions}
              onRefreshOne={id => onRefreshSessions([id])}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
