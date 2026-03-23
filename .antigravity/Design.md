# Izorate Design System

This document outlines the design principles, color palette, and component structure for **Izorate**—an open-source, AI-powered MobaXterm alternative.

## 🟢 Core Philosophy: "Hacker-Centric"
The goal is to provide a UI that feels like a professional infrastructure tool while embracing a high-fidelity "hacker" aesthetic. It prioritizes:
1.  **Low Eye-Strain**: Deep blacks and muted greens for long sessions.
2.  **Information Density**: Maximum use of screen real estate for terminal output and system stats.
3.  **Visual Feedback**: Glowing accents and animations that signal system activity.
4.  **AI Integration**: Seamless AI assistance that feels like an integrated part of the terminal experience.

---

## 🎨 Color Palette
| Name | Hex | Usage |
| :--- | :--- | :--- |
| **Matrix Green** | `#00ff41` | Primary actions, headings, active text, status icons. |
| **Emerald Dim** | `#4a6e4a` | Secondary text, inactive tabs, borders. |
| **Hacker Black** | `#0a0a0a` | Main background, panels. |
| **Dark Panel** | `#0d0d0d` | Sidebar background, secondary containers. |
| **Cyber Cyan** | `#00e5ff` | AI-related elements, special highlights, tunnels. |
| **Alert Red** | `#ff2d55` | Errors, close buttons, disconnected status. |
| **Warning Amber** | `#ffb000` | Connecting state, warnings. |

---

## 🔡 Typography
- **Primary Font**: `JetBrains Mono` or `Fira Code` (Monospace).
- **Fallback**: System monospace.
- **Rules**:
  - Use `text-xs` (12px) for most UI elements to maintain high information density.
  - Use `tracking-widest` for headers to give a "technical" feel.

---

## ✨ Effects & Animations
### 📺 CRT Scanlines
A fixed overlay using a repeating linear gradient to simulate a retro monitor.
```css
background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
```

### 🕯️ Glow Effects
Critical text (like the logo) uses `text-shadow` for a CRT-like glow.
```css
text-shadow: 0 0 8px #00ff41, 0 0 20px #00ff4140;
```

### 🤖 AI Shimmer
AI-related text uses a linear-gradient animation to signify "thinking" or "intelligence."
```css
background: linear-gradient(90deg, #00ff41 0%, #00e5ff 50%, #00ff41 100%);
animation: shimmer 2s linear infinite;
```

---

## 🏗️ UI Architecture
### 1. **Top Navigation**
- Global controls, system-wide stats (total connections/tunnels), and Clock.
- Branding uses "izo**RATE**" with mixed green/cyan colors.

### 2. **Session Manager (Sidebar)**
- **Filter**: Immediate search functionality.
- **Tree Structure**: Folders for environments (PROD, STAGING, DEV).
- **Status Indicators**: Pulse dots for active/connecting states.

### 3. **Terminal Workspace**
- **Tabs**: Support for multiple concurrent SSH/SFTP sessions.
- **Split Screen**: (Planned) Support for horizontal/vertical tiling.
- **Command Bar**: A fast input field at the bottom for quick commands.

### 4. **AI Side Panel**
- **Insights**: Proactive system analysis based on terminal output.
- **Context-Aware Chat**: Conversation localized to the active server session.
- **Quick Actions**: One-click log audit, fix suggestions, and script generation.

### 5. **Status Bar**
- Per-session metadata (Encryption, Latency, Data Transfer rates).

---

## 🚀 Roadmap
- [ ] **SFTP Integration**: A visual file explorer with the same hacker theme.
- [ ] **Theme Customization**: Support for AMBER (Orange) or TERMINATOR (Red) variants.
- [ ] **AI Log Highlights**: Automatically highlight error patterns in the terminal stream.
