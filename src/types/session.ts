export type SessionType = "ssh" | "sftp" | "rdp" | "telnet";
export type SessionStatus = "connected" | "disconnected" | "connecting";

export interface Session {
  id: number;
  name: string;
  host: string;
  port?: number;
  type: SessionType;
  status: SessionStatus;
  group: string;
  username?: string;
}

export const STATUS_COLORS: Record<SessionStatus, string> = {
  connected: "text-green-400",
  disconnected: "text-zinc-500",
  connecting: "text-amber-400",
};

export const STATUS_DOT: Record<SessionStatus, string> = {
  connected: "bg-green-400",
  disconnected: "bg-zinc-600",
  connecting: "bg-amber-400 pulse-dot",
};

export const TYPE_ICON: Record<SessionType, string> = {
  ssh: "⌨",
  sftp: "📁",
  rdp: "🖥",
  telnet: "📡",
};
