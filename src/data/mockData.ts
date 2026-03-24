import type { Session } from "../types/session";

export const SESSIONS: Session[] = [
  { id: 1, name: "prod-web-01", host: "10.0.1.10", type: "ssh", status: "connected", group: "Production" },
  { id: 2, name: "prod-db-01", host: "10.0.1.20", type: "ssh", status: "connected", group: "Production" },
  { id: 3, name: "prod-k8s-master", host: "10.0.1.30", type: "ssh", status: "disconnected", group: "Production" },
  { id: 4, name: "staging-api", host: "10.0.2.10", type: "ssh", status: "connected", group: "Staging" },
  { id: 5, name: "staging-redis", host: "10.0.2.11", type: "ssh", status: "connecting", group: "Staging" },
  { id: 6, name: "dev-laptop", host: "192.168.1.50", type: "rdp", status: "disconnected", group: "Dev" },
  { id: 7, name: "nas-storage", host: "192.168.1.100", type: "sftp", status: "connected", group: "Dev" },
];

export const TERMINAL_LINES = [
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

export const AI_SUGGESTIONS = [
  "🔍 High CPU usage detected on prod-db-01. Run: top -b -n1",
  "⚠️  /dev/sda1 at 64% — consider cleanup. Run: du -sh /* | sort -rh",
  "💡 nginx has been running 12 days. Check logs for errors: journalctl -u nginx -n 100",
];
