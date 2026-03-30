import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function SettingsPane() {
	const [activeCategory, setActiveCategory] = useState("Terminal");
	const [recordingPath, setRecordingPath] = useState("");
	const [terminalFontColor, setTerminalFontColor] = useState("var(--accent-primary)");

	const [aiProvider, setAiProvider] = useState("OpenAI");
	const [openaiApiKey, setOpenaiApiKey] = useState("");
	const [anthropicApiKey, setAnthropicApiKey] = useState("");
	const [geminiApiKey, setGeminiApiKey] = useState("");

	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

	useEffect(() => {
		const loadSettings = async () => {
			try {
				const [path, color, provider, oak, aak, gak] = await Promise.all([
					invoke<string | null>("get_izorate_setting", { key: "recording_path" }),
					invoke<string | null>("get_izorate_setting", { key: "terminal_font_color" }),
					invoke<string | null>("get_izorate_setting", { key: "ai_provider" }),
					invoke<string | null>("get_izorate_setting", { key: "openai_api_key" }),
					invoke<string | null>("get_izorate_setting", { key: "anthropic_api_key" }),
					invoke<string | null>("get_izorate_setting", { key: "gemini_api_key" }),
				]);
				setRecordingPath(path || "");
				setTerminalFontColor(color || "var(--accent-primary)");
				setAiProvider(provider || "OpenAI");
				setOpenaiApiKey(oak || "");
				setAnthropicApiKey(aak || "");
				setGeminiApiKey(gak || "");
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
			await Promise.all([
				invoke("set_izorate_setting", { key: "recording_path", value: recordingPath }),
				invoke("set_izorate_setting", { key: "terminal_font_color", value: terminalFontColor }),
				invoke("set_izorate_setting", { key: "ai_provider", value: aiProvider }),
				invoke("set_izorate_setting", { key: "openai_api_key", value: openaiApiKey }),
				invoke("set_izorate_setting", { key: "anthropic_api_key", value: anthropicApiKey }),
				invoke("set_izorate_setting", { key: "gemini_api_key", value: geminiApiKey }),
			]);
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
		{ id: "AI Assistant", icon: "⬡" },
	];

	if (loading) return <div className="p-8 text-[var(--text-muted)]">Loading settings...</div>;

	return (
		<div className="flex-1 flex flex-col md:flex-row bg-[var(--bg-base)] overflow-hidden">
			{/* List (Sidebar/TopNav) */}
			<div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-[var(--bg-hover)] bg-[var(--bg-surface)] flex flex-col shrink-0">
				<h3 className="hidden md:block px-3 py-4 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Categories</h3>
				<div className="flex flex-row md:flex-col p-2 gap-1 overflow-x-auto md:overflow-x-visible no-scrollbar">
					{categories.map((cat) => (
						<button
							key={cat.id}
							onClick={() => setActiveCategory(cat.id)}
							className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded text-xs transition-all whitespace-nowrap ${activeCategory === cat.id
								? "bg-[var(--bg-hover)] text-[var(--accent-primary)] border border-[var(--border-focus)]"
								: "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-primary)]"
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
						<h2 className="text-xl md:text-2xl font-bold text-[var(--accent-primary)] crt-glow mb-1">{activeCategory} Settings</h2>
						<p className="text-xs text-[var(--text-muted)]">Configure your {activeCategory.toLowerCase()} preferences.</p>
					</div>

					{activeCategory === "Terminal" && (
						<div className="space-y-6">
							<div className="space-y-4">
								<label className="text-xs font-semibold text-[var(--text-muted)] block">Font Color Preset</label>
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
									{[
										{ name: "Digital Green", color: "var(--accent-primary)" },
										{ name: "Cyberpunk Pink", color: "#ff00cc" },
										{ name: "Classic White", color: "#ffffff" },
										{ name: "Amber Terminal", color: "#ffb000" },
										{ name: "Matrix Blue", color: "#008cff" },
										{ name: "Ghost Gray", color: "#888888" },
									].map(preset => (
										<button
											key={preset.color}
											onClick={() => setTerminalFontColor(preset.color)}
											className={`flex items-center gap-2 px-3 py-2 rounded border transition-all ${terminalFontColor.toLowerCase() === preset.color.toLowerCase()
												? "bg-[var(--bg-hover)] border-[var(--border-focus)]"
												: "bg-[var(--bg-base)]/40 border-[#ffffff10] hover:border-[#ffffff30]"
												}`}
										>
											<div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ background: preset.color }} />
											<span className="text-[10px] text-[var(--text-main)]">{preset.name}</span>
										</button>
									))}
								</div>
							</div>

						</div>
					)}

					{activeCategory === "Recording" && (
						<div className="space-y-6">
							<div className="space-y-2">
								<label className="text-xs font-semibold text-[var(--text-muted)] block">Save Path</label>
								<div className="flex gap-2">
									<input
										type="text"
										value={recordingPath}
										onChange={(e) => setRecordingPath(e.target.value)}
										placeholder="/home/user/recordings"
										className="flex-1 bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)] min-w-0"
									/>
								</div>
								<p className="text-[10px] text-[var(--text-muted)]">The directory where terminal video recordings will be saved. Ensure the path exists and is writable.</p>
							</div>
						</div>
					)}

					{activeCategory === "AI Assistant" && (
						<div className="space-y-6">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<label className="text-xs font-semibold text-[var(--text-muted)] block uppercase tracking-tighter">Provider</label>
									<select
										value={aiProvider}
										onChange={(e) => setAiProvider(e.target.value)}
										className="w-full bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--accent-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
									>
										<option value="OpenAI">OpenAI</option>
										<option value="Anthropic">Anthropic</option>
										<option value="Google">Google (Gemini)</option>
									</select>
								</div>
							</div>

							<div className="space-y-4 pt-4 border-t border-[var(--bg-hover)]">
								{/* Provider Specific Keys */}
								{aiProvider === "OpenAI" && (
									<div className="space-y-2">
										<label className="text-xs font-semibold text-[var(--text-muted)] block uppercase tracking-tighter">OpenAI API Key</label>
										<input
											type="password"
											value={openaiApiKey}
											onChange={(e) => setOpenaiApiKey(e.target.value)}
											placeholder="sk-..."
											className="w-full bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
										/>
									</div>
								)}
								{aiProvider === "Anthropic" && (
									<div className="space-y-2">
										<label className="text-xs font-semibold text-[var(--text-muted)] block uppercase tracking-tighter">Anthropic API Key</label>
										<input
											type="password"
											value={anthropicApiKey}
											onChange={(e) => setAnthropicApiKey(e.target.value)}
											placeholder="sk-ant-..."
											className="w-full bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
										/>
									</div>
								)}
								{aiProvider === "Google" && (
									<div className="space-y-2">
										<label className="text-xs font-semibold text-[var(--text-muted)] block uppercase tracking-tighter">Google Gemini API Key</label>
										<input
											type="password"
											value={geminiApiKey}
											onChange={(e) => setGeminiApiKey(e.target.value)}
											placeholder="AIza..."
											className="w-full bg-[var(--bg-base)] border border-[var(--border-focus)] rounded px-3 py-2 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
										/>
									</div>
								)}
							</div>

							<p className="text-[10px] text-[var(--text-muted)] italic">
								Note: API keys are stored locally. The AI Assistant model is selected directly in the chat panel.
							</p>
						</div>
					)}

					{activeCategory !== "Recording" && activeCategory !== "Terminal" && activeCategory !== "AI Assistant" && (
						<div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-[var(--border-focus)] rounded text-[var(--text-muted)] italic text-center">
							No settings available for this category yet.
						</div>
					)}

					<div className="mt-8 pt-8 border-t border-[var(--bg-hover)] flex flex-col sm:flex-row items-center justify-between gap-4">
						<div className="text-xs min-h-[1.5em]">
							{message && (
								<span style={{ color: message.type === "success" ? "var(--accent-primary)" : "var(--red)" }}>
									{message.type === "success" ? "✓" : "✗"} {message.text}
								</span>
							)}
						</div>
						<button
							onClick={saveSettings}
							className="w-full sm:w-auto px-8 py-2.5 rounded bg-[var(--accent-primary)] text-black text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)]"
						>
							Save Changes
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
