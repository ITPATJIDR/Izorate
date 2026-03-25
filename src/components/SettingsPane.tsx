import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function SettingsPane() {
	const [activeCategory, setActiveCategory] = useState("Recording");
	const [recordingPath, setRecordingPath] = useState("");
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

	useEffect(() => {
		const loadSettings = async () => {
			try {
				const path = await invoke<string | null>("get_izorate_setting", { key: "recording_path" });
				setRecordingPath(path || "");
			} catch (err) {
				console.error("Failed to load settings:", err);
			} finally {
				setLoading(false);
			}
		};
		loadSettings();
	}, []);

	const saveSettings = async () => {
		try {
			await invoke("set_izorate_setting", { key: "recording_path", value: recordingPath });
			setMessage({ text: "Settings saved successfully!", type: "success" });
			setTimeout(() => setMessage(null), 3000);
		} catch (err) {
			setMessage({ text: `Failed to save: ${err}`, type: "error" });
		}
	};

	const categories = [
		{ id: "General", icon: "⚙️" },
		{ id: "Terminal", icon: "💻" },
		{ id: "Recording", icon: "🎥" },
		{ id: "Appearance", icon: "🎨" },
	];

	if (loading) return <div className="p-8 text-[#4a6e4a]">Loading settings...</div>;

	return (
		<div className="flex-1 flex flex-col md:flex-row bg-[#0a0a0a] overflow-hidden">
			{/* List (Sidebar/TopNav) */}
			<div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-[#00ff4110] bg-[#0d0d0d] flex flex-col shrink-0">
				<h3 className="hidden md:block px-3 py-4 text-[10px] uppercase tracking-widest text-[#4a6e4a] font-bold">Categories</h3>
				<div className="flex flex-row md:flex-col p-2 gap-1 overflow-x-auto md:overflow-x-visible no-scrollbar">
					{categories.map((cat) => (
						<button
							key={cat.id}
							onClick={() => setActiveCategory(cat.id)}
							className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded text-xs transition-all whitespace-nowrap ${activeCategory === cat.id
								? "bg-[#00ff4115] text-[#00ff41] border border-[#00ff4130]"
								: "text-[#4a6e4a] hover:bg-[#00ff410a] hover:text-[#00ff41]"
								}`}
						>
							<span className="text-sm md:text-base">{cat.icon}</span>
							{cat.id}
						</button>
					))}
				</div>
			</div>

			{/* Attributes (Form) */}
			<div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto">
				<div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
					<div className="mb-8">
						<h2 className="text-xl md:text-2xl font-bold text-[#00ff41] crt-glow mb-1">{activeCategory} Settings</h2>
						<p className="text-xs text-[#4a6e4a]">Configure your {activeCategory.toLowerCase()} preferences.</p>
					</div>

					{activeCategory === "Recording" && (
						<div className="space-y-6">
							<div className="space-y-2">
								<label className="text-xs font-semibold text-[#888] block">Save Path</label>
								<div className="flex gap-2">
									<input
										type="text"
										value={recordingPath}
										onChange={(e) => setRecordingPath(e.target.value)}
										placeholder="/home/user/recordings"
										className="flex-1 bg-black border border-[#4a6e4a40] rounded px-3 py-2 text-xs text-[#ccc] focus:outline-none focus:border-[#00ff41] min-w-0"
									/>
								</div>
								<p className="text-[10px] text-[#4a6e4a]">The directory where terminal video recordings will be saved. Ensure the path exists and is writable.</p>
							</div>
						</div>
					)}

					{activeCategory !== "Recording" && (
						<div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-[#4a6e4a40] rounded text-[#4a6e4a] italic text-center">
							No settings available for this category yet.
						</div>
					)}

					<div className="mt-8 pt-8 border-t border-[#00ff4110] flex flex-col sm:flex-row items-center justify-between gap-4">
						<div className="text-xs min-h-[1.5em]">
							{message && (
								<span style={{ color: message.type === "success" ? "#00ff41" : "#ff2d55" }}>
									{message.type === "success" ? "✓" : "✗"} {message.text}
								</span>
							)}
						</div>
						<button
							onClick={saveSettings}
							className="w-full sm:w-auto px-8 py-2.5 rounded bg-[#00ff41] text-black text-xs font-bold hover:bg-[#00cc33] active:scale-95 transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]"
						>
							Save Changes
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
