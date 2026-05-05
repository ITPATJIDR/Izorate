import { useEffect, useState } from "react";
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
}

function getUsageColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 75) return "#f59e0b";
  if (pct >= 50) return "#3b82f6";
  return "#22c55e";
}

function PartitionRow({ p, animate }: { p: DiskPartition; animate: boolean }) {
  const color = getUsageColor(p.use_percent);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "120px 1fr 52px 52px 52px 44px",
      alignItems: "center",
      gap: "8px",
      padding: "5px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      fontSize: "11px",
    }}>
      {/* Mount point */}
      <span style={{ color: "#e2e8f0", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.mount_point}
      </span>

      {/* Progress bar */}
      <div style={{ height: "4px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: animate ? `${p.use_percent}%` : "0%",
          background: color,
          borderRadius: "3px",
          transition: "width 1.1s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 6px ${color}80`,
        }} />
      </div>

      <span style={{ color: "var(--text-muted)", textAlign: "right" }}>{p.size}</span>
      <span style={{ color: "#e2e8f0", textAlign: "right" }}>{p.used}</span>
      <span style={{ color: "#22c55e", textAlign: "right" }}>{p.available}</span>
      <span style={{ color, fontWeight: 700, textAlign: "right" }}>{p.use_percent}%</span>
    </div>
  );
}

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
            padding: "4px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.03)",
          }}>
            <span style={{ fontSize: "10px", color: isTop ? "#f59e0b" : "var(--text-muted)", width: "14px", textAlign: "center", flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.path}
            </span>
            <div style={{ width: "80px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.06)", overflow: "hidden", flexShrink: 0 }}>
              <div style={{
                height: "100%", width: `${barPct}%`,
                background: isTop ? "#f59e0b" : "var(--accent-primary)",
                borderRadius: "2px",
                transition: "width 1s ease",
              }} />
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: isTop ? "#f59e0b" : "#94a3b8", flexShrink: 0, minWidth: "36px", textAlign: "right" }}>
              {p.size}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SessionDiskCard({
  session,
  data,
  onOpenSession,
}: {
  session: Session;
  data: DiskInfo | "loading" | "error";
  onOpenSession: (id: number) => void;
}) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (data !== "loading" && data !== "error") {
      const t = setTimeout(() => setAnimate(true), 80);
      return () => clearTimeout(t);
    }
  }, [data]);

  return (
    <div style={{
      background: "rgba(255,255,255,0.012)",
      border: "1px solid var(--border-focus)",
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      {/* Session header bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "7px 10px",
        background: "rgba(255,255,255,0.025)",
        borderBottom: "1px solid var(--border-focus)",
      }}>
        <div style={{
          width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
          background: session.status === "connected" ? "#22c55e" : "#6b7280",
          boxShadow: session.status === "connected" ? "0 0 6px #22c55e99" : "none",
        }} />
        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-primary)", flex: 1 }}>
          {session.name}
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
          {session.host}:{session.port || 22}
        </span>

        {/* Open session button */}
        <button
          onClick={() => onOpenSession(session.id)}
          title="Open terminal for this session"
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "3px 8px",
            fontSize: "10px", fontWeight: 600,
            color: "var(--accent-primary)",
            background: "var(--accent-primary)18",
            border: "1px solid var(--accent-primary)40",
            borderRadius: "4px",
            cursor: "pointer",
            transition: "all 0.15s",
            letterSpacing: "0.04em",
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 10px", color: "var(--text-muted)", fontSize: "11px" }}>
          <div style={{
            width: "12px", height: "12px", flexShrink: 0,
            border: "1.5px solid var(--border-focus)",
            borderTop: "1.5px solid var(--accent-primary)", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          Connecting via SSH...
        </div>
      )}

      {/* Error */}
      {data === "error" && (
        <div style={{ padding: "10px", fontSize: "11px", color: "#fca5a5", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>⚠️</span>
          <span>Could not retrieve disk info — session may require a password or is unreachable</span>
        </div>
      )}

      {/* Data */}
      {data !== "loading" && data !== "error" && (
        <div>
          {/* Partition table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 52px 52px 52px 44px",
            gap: "8px",
            padding: "4px 10px",
            fontSize: "9px", fontWeight: 600, color: "var(--text-muted)",
            letterSpacing: "0.08em", textTransform: "uppercase",
            borderBottom: "1px solid var(--border-focus)",
            background: "rgba(255,255,255,0.01)",
          }}>
            <span>Mount</span>
            <span>Usage</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span style={{ textAlign: "right" }}>Used</span>
            <span style={{ textAlign: "right" }}>Free</span>
            <span style={{ textAlign: "right" }}>%</span>
          </div>

          {data.partitions.map(p => (
            <PartitionRow key={p.mount_point} p={p} animate={animate} />
          ))}

          {/* Top paths */}
          {data.top_paths.length > 0 && (
            <>
              <div style={{
                padding: "4px 10px",
                fontSize: "9px", fontWeight: 600, color: "var(--text-muted)",
                letterSpacing: "0.08em", textTransform: "uppercase",
                borderTop: "1px solid var(--border-focus)",
                borderBottom: "1px solid var(--border-focus)",
                background: "rgba(255,255,255,0.01)",
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

export function DiskPane({ sessions, diskData, onOpenSession }: DiskPaneProps) {
  const sshSessions = sessions.filter(s => s.type === "ssh" || s.type === "sftp");

  return (
    <div style={{
      flex: 1, overflow: "auto",
      padding: "12px 16px",
      background: "var(--bg-base)",
      fontFamily: "'Inter', 'Outfit', system-ui, sans-serif",
    }}>
      {/* Compact header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          💾 Disk Usage
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
          {sshSessions.length} session{sshSessions.length !== 1 ? "s" : ""} · snapshot on startup
        </span>
      </div>

      {sshSessions.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", gap: "8px", opacity: 0.35 }}>
          <div style={{ fontSize: "36px" }}>💾</div>
          <div style={{ fontSize: "12px", color: "var(--accent-primary)", letterSpacing: "0.05em" }}>NO SSH SESSIONS</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {sshSessions.map(s => (
            <SessionDiskCard
              key={s.id}
              session={s}
              data={diskData[s.id] ?? "loading"}
              onOpenSession={onOpenSession}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
