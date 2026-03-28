import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { TabBar } from "./components/TabBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { TerminalPane } from "./components/TerminalPane";
import { FileManagerPane } from "./components/FileManagerPane";
import { SettingsPane } from "./components/SettingsPane";
import { ToolsPane } from "./components/ToolsPane";
import { KeysPane } from "./components/KeysPane";
import { AIPanel } from "./components/AIPanel";
import { AIPage } from "./components/AIPage";
import { StatusBar } from "./components/StatusBar";
import { NewConnectionModal } from "./components/NewConnectionModal";
import type { Session } from "./types/session";

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [openTabIds, setOpenTabIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState("Sessions");
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);

  // Resizable Panels State
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [aiPanelWidth, setAiPanelWidth] = useState(280);
  const [lastAiPanelWidth, setLastAiPanelWidth] = useState(280);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingAiPanel, setIsResizingAiPanel] = useState(false);

  const toggleAiPanel = useCallback(() => {
    if (aiPanelWidth > 0) {
      setLastAiPanelWidth(aiPanelWidth);
      setAiPanelWidth(0);
    } else {
      setAiPanelWidth(lastAiPanelWidth || 280);
    }
  }, [aiPanelWidth, lastAiPanelWidth]);

  const startResizingSidebar = useCallback(() => setIsResizingSidebar(true), []);
  const startResizingAiPanel = useCallback(() => setIsResizingAiPanel(true), []);
  const stopResizing = useCallback(() => {
    setIsResizingSidebar(false);
    setIsResizingAiPanel(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizingSidebar) {
      const newWidth = Math.max(150, Math.min(window.innerWidth * 0.5, e.clientX));
      setSidebarWidth(newWidth);
    } else if (isResizingAiPanel) {
      const newWidth = Math.max(100, Math.min(window.innerWidth * 0.4, window.innerWidth - e.clientX));
      setAiPanelWidth(newWidth);
    }
  }, [isResizingSidebar, isResizingAiPanel]);

  useEffect(() => {
    if (isResizingSidebar || isResizingAiPanel) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizingSidebar, isResizingAiPanel, resize, stopResizing]);

  // Collapse AI panel if no API keys pre-check
  useEffect(() => {
    const checkAiAndCollapse = async () => {
      try {
        const provider = (await invoke<string | null>("get_izorate_setting", { key: "ai_provider" })) || "OpenAI";
        const keyMap: Record<string, string> = {
          "OpenAI": "openai_api_key",
          "Anthropic": "anthropic_api_key",
          "Google": "gemini_api_key"
        };
        const key = await invoke<string | null>("get_izorate_setting", { key: keyMap[provider] });
        if (!key) {
          setAiPanelWidth(0);
        }
      } catch (err) {
        console.error("AI pre-check failed:", err);
      }
    };
    checkAiAndCollapse();
  }, [refreshTrigger]);

  const activeSession = activeId ? sessions.find(s => s.id === activeId) : undefined;

  const handleSessionsChanged = (updated: Session[]) => {
    setSessions(updated);
    if (activeId && !updated.find(s => s.id === activeId)) {
      setActiveId(null);
    }
    setOpenTabIds(prev => prev.filter(id => updated.some(s => s.id === id)));
  };

  const handleDataChanged = (newId?: number) => {
    // Triggers Sidebar to remount/fetch updated connections & groups from SQLite
    setRefreshTrigger(prev => prev + 1);
    if (typeof newId === "number") {
      handleSelectSession(newId);
    }
  };

  const handleSelectSession = (id: number) => {
    setActiveId(id);
    setOpenTabIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleCloseTab = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabIds.filter(tid => tid !== id);
    setOpenTabIds(newTabs);
    if (activeId === id) {
      setActiveId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
    }
  };

  const handleNewSession = () => {
    setEditingSession(undefined);
    setShowModal(true);
  };

  const handleEditSession = (session: Session) => {
    setEditingSession(session);
    setShowModal(true);
  };

  return (
    <div className={`scanlines flex flex-col ${isResizingSidebar || isResizingAiPanel ? 'select-none' : ''}`} style={{ height: "100vh", overflow: "hidden" }}>
      <TopBar connectedCount={openTabIds.length} activeTab={activeTab} hasActiveSession={activeId !== null} onTabChange={setActiveTab} />
      <TabBar
        sessions={sessions}
        activeId={activeId}
        openTabIds={openTabIds}
        onSelect={handleSelectSession}
        onClose={handleCloseTab}
        onNew={handleNewSession}
      />
      <div className="flex flex-1 overflow-hidden">
        <SessionSidebar
          sessions={sessions}
          activeId={activeId}
          onSelect={handleSelectSession}
          onNewSession={handleNewSession}
          onEditSession={handleEditSession}
          onSessionsChanged={handleSessionsChanged}
          onDataChanged={handleDataChanged}
          refreshTrigger={refreshTrigger}
          width={sidebarWidth}
        />

        {/* Left Resize Handle */}
        <div
          onMouseDown={startResizingSidebar}
          className={`w-1 cursor-col-resize transition-colors hover:bg-[#00ff4140] ${isResizingSidebar ? 'bg-[#00ff4160]' : 'bg-transparent'}`}
          style={{ zIndex: 10 }}
        />

        <div className="flex-1 flex flex-col overflow-hidden relative" style={{ background: "#050a05" }}>
          {/* Terminal Layer - Persists terminals for all open tabs */}
          <div className="flex-1 relative flex flex-col" style={{ display: activeTab === "Sessions" && activeId !== null ? "flex" : "none" }}>
            {openTabIds.map(id => {
              const s = sessions.find(sess => sess.id === id);
              if (!s) return null;
              return (
                <div key={id} className="absolute inset-0 flex flex-col" style={{ visibility: activeId === id ? "visible" : "hidden", pointerEvents: activeId === id ? "auto" : "none" }}>
                  <TerminalPane session={s} />
                </div>
              );
            })}
          </div>

          {/* Welcome Screen / Empty State */}
          {activeTab === "Sessions" && activeId === null && (
            <div className="flex-1 flex flex-col items-center justify-center text-center select-none" style={{ opacity: 0.4 }}>
              <div className="text-6xl mb-4 crt-glow" style={{ color: "#00ff41" }}>🖧</div>
              <h2 className="text-xl font-bold tracking-widest" style={{ color: "#00ff41" }}>IZORATE TERMINAL</h2>
              <p className="text-xs font-medium mt-2" style={{ color: "#4a8a4a" }}>Select a session from the sidebar to connect.</p>
            </div>
          )}

          {/* Other Panes */}
          {activeTab === "Files" && activeSession && (
            <FileManagerPane session={activeSession} />
          )}

          {activeTab === "Tools" && (
            <ToolsPane sessions={sessions} />
          )}

          {activeTab === "Keys" && (
            <KeysPane />
          )}

          {activeTab === "AI Assistant" && (
            <AIPage activeChatId={activeChatId} onSelectChat={setActiveChatId} />
          )}

          {activeTab === "Settings" && (
            <SettingsPane />
          )}
        </div>

        {/* Right Resize Handle or Expand Bar */}
        {aiPanelWidth > 0 ? (
          <div
            onMouseDown={startResizingAiPanel}
            className={`w-1 cursor-col-resize transition-colors hover:bg-[#00ff4140] ${isResizingAiPanel ? 'bg-[#00ff4160]' : 'bg-transparent'}`}
            style={{ zIndex: 10 }}
          />
        ) : (
          <div
            onClick={toggleAiPanel}
            className="w-4 bg-[#0a0a0a] border-l border-[#00ff4115] hover:bg-[#00ff4108] cursor-pointer flex flex-col items-center justify-center gap-1 transition-all group"
            title="Expand AI Assistant"
          >
            <span className="text-[10px] text-[#4a6e4a] group-hover:text-[#00ff41] transition-colors" style={{ writingMode: 'vertical-rl' }}>AI ASSISTANT</span>
            <span className="text-[10px] text-[#4a6e4a] group-hover:text-[#00ff41]">««</span>
          </div>
        )}

        <AIPanel width={aiPanelWidth} activeChatId={activeChatId} onToggleCollapse={toggleAiPanel} />
      </div>
      {activeSession && <StatusBar session={activeSession} />}

      {showModal && (
        <NewConnectionModal
          onClose={() => setShowModal(false)}
          onSaved={handleDataChanged}
          editSession={editingSession}
        />
      )}
    </div>
  );
}
