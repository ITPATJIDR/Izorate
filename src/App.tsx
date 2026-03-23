import { useState, useRef, useEffect } from "react";
import "./App.css";

// Types
type SessionType = "ssh" | "sftp" | "rdp" | "telnet";
type SessionStatus = "connected" | "disconnected" | "connecting";

interface Session {
  id: number;
  name: string;
  host: string;
  type: SessionType;
  status: SessionStatus;
  group: string;
}

// Mock data
const SESSIONS: Session[] = [
  { id: 1, name: "prod-web-01", host: "10.0.1.10", type: "ssh", status: "connected", group: "Production" },
  { id: 2, name: "prod-db-01", host: "10.0.1.20", type: "ssh", status: "connected", group: "Production" },
  { id: 3, name: "prod-k8s-master", host: "10.0.1.30", type: "ssh", status: "disconnected", group: "Production" },
  { id: 4, name: "staging-api", host: "10.0.2.10", type: "ssh", status: "connected", group: "Staging" },
  { id: 5, name: "staging-redis", host: "10.0.2.11", type: "ssh", status: "connecting", group: "Staging" },
  { id: 6, name: "dev-laptop", host: "192.168.1.50", type: "rdp", status: "disconnected", group: "Dev" },
  { id: 7, name: "nas-storage", host: "192.168.1.100", type: "sftp", status: "connected", group: "Dev" },
];

const TERMINAL_LINES = [
  { text: "Last login: Mon Mar 23 21:00:01 2026 from 192.168.1.1", color: "text-emerald-600" },
  { text: "[root@prod-web-01 ~]# systemctl status nginx", color: "text-green-400" },
  { text: "● nginx.service - A high performance web server", color: "text-green-300" },
  { text: "   Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled)", color: "text-emerald-500" },
  { text: "   Active: active (running) since Mon 2026-03-23 18:30:12 UTC", color: "text-green-400 font-bold" },
  { text: " Main PID: 1337 (nginx)", color: "text-emerald-500" },
  { text: "[root@prod-web-01 ~]# df -h", color: "text-green-400" },
  { text: "Filesystem      Size  Used Avail Use% Mounted on", color: "text-emerald-600" },
  { text: "/dev/sda1        50G   32G   18G  64% /", color: "text-green-300" },
  { text: "[root@prod-web-01 ~]# uptime", color: "text-green-400" },
  { text: " 21:15:20 up 12 days, 3:22, 2 users, load average: 0.45, 0.38, 0.31", color: "text-emerald-400" },
];

const AI_SUGGESTIONS = [
  "🔍 High CPU usage detected on prod-db-01. Run: top -b -n1",
  "⚠️  /dev/sda1 at 64% — consider cleanup. Run: du -sh /* | sort -rh",
  "💡 nginx has been running 12 days. Check logs for errors: journalctl -u nginx -n 100",
];

const STATUS_COLORS: Record<SessionStatus, string> = {
  connected: "text-green-400",
  disconnected: "text-zinc-500",
  connecting: "text-amber-400",
};

const STATUS_DOT: Record<SessionStatus, string> = {
  connected: "bg-green-400",
  disconnected: "bg-zinc-600",
  connecting: "bg-amber-400 pulse-dot",
};

const TYPE_ICON: Record<SessionType, string> = {
  ssh: "⌨",
  sftp: "📁",
  rdp: "🖥",
  telnet: "📡",
};

// Components
function TopBar() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour12: false });
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: "#0a0a0a", borderColor: "#00ff4120" }}>
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: "#ff2d55" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: "#ffb000" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: "#00ff41" }} />
        </div>
        <span className="crt-glow text-sm font-bold tracking-widest" style={{ color: "#00ff41" }}>
          izo<span style={{ color: "#00e5ff" }}>RATE</span>
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#00ff4115", color: "#00ff41", border: "1px solid #00ff4130" }}>
          v0.1.0
        </span>
      </div>

      {/* Center: Nav */}
      <div className="flex gap-1">
        {["Sessions", "Files", "Tools", "Keys", "AI Assistant"].map((item, i) => (
          <button
            key={item}
            className={`px-3 py-1 text-xs rounded transition-all duration-200 ${i === 0
              ? "text-green-400 font-medium"
              : "hover:text-green-400"
              }`}
            style={{
              background: i === 0 ? "#00ff4115" : "transparent",
              border: i === 0 ? "1px solid #00ff4130" : "1px solid transparent",
              color: i === 0 ? "#00ff41" : "#4a6e4a",
            }}
          >
            {item === "AI Assistant" ? <span className="ai-shimmer">{item}</span> : item}
          </button>
        ))}
      </div>

      {/* Right: Status */}
      <div className="flex items-center gap-4 text-xs" style={{ color: "#4a6e4a" }}>
        <span>
          <span style={{ color: "#00ff41" }}>5</span> connected
        </span>
        <span>
          <span style={{ color: "#00e5ff" }}>2</span> tunnels
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
          <span style={{ color: "#00ff41" }}>{timeStr}</span>
          <span> | {dateStr}</span>
        </div>
      </div>
    </div>
  );
}

function SessionSidebar({ sessions, activeId, onSelect }: {
  sessions: Session[];
  activeId: number;
  onSelect: (id: number) => void;
}) {
  const groups = [...new Set(sessions.map(s => s.group))];

  return (
    <div className="flex flex-col h-full" style={{ width: "220px", background: "#0d0d0d", borderRight: "1px solid #00ff4115" }}>
      {/* Search */}
      <div className="p-2 border-b" style={{ borderColor: "#00ff4115" }}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "#0f1a0f", border: "1px solid #00ff4125" }}>
          <span style={{ color: "#00ff4180" }}>⌕</span>
          <input
            className="bg-transparent text-xs outline-none flex-1 placeholder-emerald-900"
            placeholder="filter sessions..."
            style={{ color: "#00ff41", fontFamily: "inherit" }}
          />
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.map(group => (
          <div key={group}>
            <div className="px-3 py-1.5 text-xs font-semibold tracking-widest" style={{ color: "#00ff4150" }}>
              ▸ {group.toUpperCase()}
            </div>
            {sessions.filter(s => s.group === group).map(session => (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-150"
                style={{
                  background: activeId === session.id ? "#0f2a0f" : "transparent",
                  borderLeft: activeId === session.id ? "2px solid #00ff41" : "2px solid transparent",
                }}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[session.status]}`} />
                <span className="text-xs truncate" style={{ color: activeId === session.id ? "#00ff41" : "#4a6e4a" }}>
                  {TYPE_ICON[session.type]} {session.name}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Add Session button */}
      <div className="p-2 border-t" style={{ borderColor: "#00ff4115" }}>
        <button
          className="w-full py-2 text-xs rounded transition-all duration-200 hover:shadow-lg"
          style={{
            background: "linear-gradient(135deg, #0f2a0f, #1a4a1a)",
            border: "1px solid #00ff4140",
            color: "#00ff41",
          }}
        >
          + New Session
        </button>
      </div>
    </div>
  );
}

function TerminalPane({ session }: { session: Session }) {
  const [lines, setLines] = useState(TERMINAL_LINES);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when terminal area is clicked
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  // Scroll to bottom when lines change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const command = input.trim();

      // Add command line to history
      const commandLine = { text: `[root@${session.name} ~]# ${input}`, color: "text-green-400" };

      let resonance: { text: string; color: string }[] = [];

      // Mock execution results
      if (command === "ls") {
        resonance = [{ text: "Desktop  Documents  Downloads  Music  Pictures  Videos", color: "text-blue-400" }];
      } else if (command === "clear") {
        setLines([]);
        setInput("");
        return;
      } else if (command === "help") {
        resonance = [
          { text: "Available commands:", color: "text-amber-400" },
          { text: "ls     - list directory contents", color: "text-zinc-400" },
          { text: "clear  - clear terminal screen", color: "text-zinc-400" },
          { text: "help   - show this help message", color: "text-zinc-400" },
          { text: "exit   - close session", color: "text-zinc-400" },
        ];
      } else if (command !== "") {
        resonance = [{ text: `bash: ${command.split(' ')[0]}: command not found`, color: "text-red-400" }];
      }

      setLines(prev => [...prev, commandLine, ...resonance]);
      setInput("");
    }
  };

  return (
    <div
      className="flex flex-col h-full cursor-text"
      style={{ background: "#080808" }}
      onClick={handleTerminalClick}
    >
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ background: "#0d0d0d", borderColor: "#00ff4115" }}>
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: "#00ff41" }}>⌨</span>
          <span style={{ color: "#00ff41" }}>{session.name}</span>
          <span style={{ color: "#4a6e4a" }}>@</span>
          <span style={{ color: "#00e5ff" }}>{session.host}</span>
          <span className={`ml-1 text-xs ${STATUS_COLORS[session.status]}`}>● {session.status}</span>
        </div>
        <div className="flex gap-2 text-xs" style={{ color: "#4a6e4a" }}>
          <button className="hover:text-green-400 transition-colors px-2">⊞ Split</button>
          <button className="hover:text-green-400 transition-colors px-2">⊡ Fullscreen</button>
          <button className="hover:text-amber-400 transition-colors px-2">↯ Reconnect</button>
          <button className="hover:text-red-400 transition-colors px-2">✕ Close</button>
        </div>
      </div>

      {/* Terminal output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {lines.map((line, i) => (
          <div key={i} className={line.color}>{line.text}</div>
        ))}
        {/* Active line */}
        <div className="flex items-center gap-0 mt-1">
          <span className="text-green-400">[root@{session.name} ~]# </span>
          <span className="text-green-300 whitespace-pre-wrap">{input}</span>
          <span className="blink text-green-400">█</span>
        </div>

        {/* Hidden input to capture keystrokes */}
        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute w-0 h-0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
    </div>
  );
}

function AIPanel() {
  const [question, setQuestion] = useState("");
  const [chatHistory] = useState([
    { role: "ai", text: "Connected to: prod-web-01. I can see your system stats. CPU: 12%, RAM: 4.2/8GB. How can I help?" },
    { role: "user", text: "How do I check which process is using port 80?" },
    { role: "ai", text: "Run: `lsof -i :80` or `ss -tlnp | grep :80`. On your system, nginx is already running on port 80 (PID 1337)." },
  ]);

  return (
    <div className="flex flex-col h-full" style={{ width: "280px", background: "#0a0a0a", borderLeft: "1px solid #00ff4115" }}>
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "#00ff4115", background: "#0d0d0d" }}>
        <span className="ai-shimmer text-xs font-bold">⬡ AI ASSISTANT</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
          <span className="text-xs" style={{ color: "#00e5ff" }}>Active</span>
        </div>
      </div>

      {/* Context badge */}
      <div className="px-3 py-2 text-xs" style={{ background: "#0f1a0f", borderBottom: "1px solid #00ff4115" }}>
        <span style={{ color: "#4a6e4a" }}>Context: </span>
        <span style={{ color: "#00e5ff" }}>prod-web-01</span>
        <span style={{ color: "#4a6e4a" }}> | </span>
        <span style={{ color: "#00ff41" }}>nginx, systemd, bash</span>
      </div>

      {/* Suggestions */}
      <div className="px-3 py-2 border-b" style={{ borderColor: "#00ff4115" }}>
        <div className="text-xs mb-1.5" style={{ color: "#4a6e4a" }}>INSIGHTS</div>
        <div className="flex flex-col gap-1">
          {AI_SUGGESTIONS.map((s, i) => (
            <div key={i} className="text-xs p-1.5 rounded cursor-pointer hover:brightness-125 transition-all"
              style={{ background: "#0f1a10", border: "1px solid #00ff4120", color: "#a0d4a0", lineHeight: 1.5 }}>
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[90%] text-xs p-2 rounded leading-relaxed"
              style={msg.role === "ai"
                ? { background: "#0f1a0f", border: "1px solid #00ff4125", color: "#a0d4a0" }
                : { background: "#0a1a2a", border: "1px solid #00e5ff25", color: "#a0d8e8" }
              }>
              {msg.role === "ai" && <span style={{ color: "#00ff4180" }}>⬡ </span>}
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-2 border-t" style={{ borderColor: "#00ff4115" }}>
        <div className="flex items-center gap-2 p-2 rounded" style={{ background: "#0f1a0f", border: "1px solid #00ff4130" }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="flex-1 bg-transparent outline-none text-xs placeholder-emerald-900"
            style={{ color: "#00ff41", fontFamily: "inherit" }}
            placeholder="ask AI anything..."
          />
          <button className="text-xs transition-colors hover:text-green-300" style={{ color: "#00ff41" }}>⏎</button>
        </div>
        <div className="mt-1.5 flex gap-1 flex-wrap">
          {["explain logs", "fix error", "write script", "audit security"].map(tag => (
            <button key={tag} className="text-xs px-1.5 py-0.5 rounded transition-all hover:brightness-125"
              style={{ background: "#0a1a0a", border: "1px solid #00ff4120", color: "#4a8a4a" }}>
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBar({ session }: { session: Session }) {
  return (
    <div className="flex items-center gap-4 px-4 py-1 text-xs border-t" style={{ background: "#080808", borderColor: "#00ff4115" }}>
      <span style={{ color: "#00ff41" }}>● SSH</span>
      <span style={{ color: "#4a6e4a" }}>|</span>
      <span style={{ color: "#4a6e4a" }}>host: </span>
      <span style={{ color: "#00e5ff" }}>{session.host}</span>
      <span style={{ color: "#4a6e4a" }}>|</span>
      <span style={{ color: "#4a6e4a" }}>user: </span>
      <span style={{ color: "#00ff41" }}>root</span>
      <span style={{ color: "#4a6e4a" }}>|</span>
      <span style={{ color: "#4a6e4a" }}>enc: </span>
      <span style={{ color: "#00ff41" }}>AES256-CTR</span>
      <div className="ml-auto flex gap-4">
        <span style={{ color: "#4a6e4a" }}>latency: <span style={{ color: "#00ff41" }}>12ms</span></span>
        <span style={{ color: "#4a6e4a" }}>rx: <span style={{ color: "#00e5ff" }}>1.2MB</span></span>
        <span style={{ color: "#4a6e4a" }}>tx: <span style={{ color: "#00e5ff" }}>340KB</span></span>
      </div>
    </div>
  );
}

// Tab bar for multiple terminal tabs
function TabBar({ sessions, activeId, onSelect }: { sessions: Session[]; activeId: number; onSelect: (id: number) => void }) {
  const openTabs = sessions.filter(s => s.status === "connected");
  return (
    <div className="flex items-end gap-0 px-2 border-b overflow-x-auto" style={{ background: "#0a0a0a", borderColor: "#00ff4115" }}>
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
              ? { borderColor: "#00ff4130", borderBottom: "none", color: "#00ff41" }
              : { color: "#4a6e4a" }
            ),
          }}>
          <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
          {s.name}
          <span className="ml-1 opacity-50 hover:opacity-100">✕</span>
        </button>
      ))}
      <button className="px-3 py-2 text-xs transition-colors ml-1" style={{ color: "#4a6e4a" }}>+ New</button>
    </div>
  );
}

// Main App
export default function App() {
  const [activeId, setActiveId] = useState(1);
  const activeSession = SESSIONS.find(s => s.id === activeId) ?? SESSIONS[0];

  return (
    <div className="scanlines flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
      <TopBar />
      <TabBar sessions={SESSIONS} activeId={activeId} onSelect={setActiveId} />
      <div className="flex flex-1 overflow-hidden">
        <SessionSidebar sessions={SESSIONS} activeId={activeId} onSelect={setActiveId} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TerminalPane session={activeSession} />
        </div>
        <AIPanel />
      </div>
      <StatusBar session={activeSession} />
    </div>
  );
}
