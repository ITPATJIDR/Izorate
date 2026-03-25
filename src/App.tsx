import { useState } from "react";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { TabBar } from "./components/TabBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { TerminalPane } from "./components/TerminalPane";
import { FileManagerPane } from "./components/FileManagerPane";
import { SettingsPane } from "./components/SettingsPane";
import { AIPanel } from "./components/AIPanel";
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
    <div className="scanlines flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
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
        />
        <div className="flex-1 flex flex-col overflow-hidden relative" style={{ background: "#050a05" }}>
          {activeSession ? (
            activeTab === "Files" ? (
              <FileManagerPane session={activeSession} />
            ) : activeTab === "Settings" ? (
              <SettingsPane />
            ) : (
              <TerminalPane session={activeSession} />
            )
          ) : activeTab === "Settings" ? (
            <SettingsPane />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center select-none" style={{ opacity: 0.4 }}>
              <div className="text-6xl mb-4 crt-glow" style={{ color: "#00ff41" }}>🖧</div>
              <h2 className="text-xl font-bold tracking-widest" style={{ color: "#00ff41" }}>IZORATE TERMINAL</h2>
              <p className="text-xs font-medium mt-2" style={{ color: "#4a8a4a" }}>Select a session from the sidebar to connect.</p>
            </div>
          )}
        </div>
        <AIPanel />
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
