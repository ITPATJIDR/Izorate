import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Session } from "../types/session";

interface FileInfo {
	name: string;
	is_dir: boolean;
	size: number;
	modified: number;
}

interface Props {
	session: Session;
}

function formatBytes(bytes: number) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function FileManagerPane({ session }: Props) {
	const [currentPath, setCurrentPath] = useState("/");
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const loadPath = async (path: string) => {
		setLoading(true);
		setError(null);
		try {
			const res = await invoke<FileInfo[]>("list_sftp_directory", { id: session.id, path });
			res.sort((a, b) => {
				if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
				return a.is_dir ? -1 : 1;
			});
			setFiles(res);
			setCurrentPath(path);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadPath(currentPath);
	}, [session.id]);

	useEffect(() => {
		let unlistenDrop: (() => void) | undefined;
		let unlistenHover: (() => void) | undefined;
		let unlistenCancel: (() => void) | undefined;

		const setupListeners = async () => {
			unlistenHover = await listen('tauri://drag-enter', () => setIsDragging(true));
			unlistenCancel = await listen('tauri://drag-leave', () => setIsDragging(false));
			unlistenDrop = await listen<{ paths: string[] }>('tauri://drop', async (event) => {
				setIsDragging(false);
				if (!event.payload.paths) return;

				setLoading(true);
				for (const path of event.payload.paths) {
					const filename = path.split(/[/\\]/).pop();
					if (!filename) continue;
					const remotePath = currentPath + (currentPath.endsWith('/') ? '' : '/') + filename;
					try {
						await invoke("upload_file", { id: session.id, localPath: path, remotePath });
					} catch (err) {
						alert(`Failed to upload ${filename}: ${err}`);
					}
				}
				loadPath(currentPath);
			});
		};
		setupListeners();

		return () => {
			if (unlistenDrop) unlistenDrop();
			if (unlistenHover) unlistenHover();
			if (unlistenCancel) unlistenCancel();
		};
	}, [session.id, currentPath]);

	const handleDoubleClick = (file: FileInfo) => {
		if (file.is_dir) {
			const newPath = currentPath.endsWith('/') ? currentPath + file.name : currentPath + '/' + file.name;
			loadPath(newPath);
		}
	};

	const goUp = () => {
		if (currentPath === '/') return;
		const parts = currentPath.split('/').filter(Boolean);
		parts.pop();
		const newPath = parts.length === 0 ? '/' : '/' + parts.join('/');
		loadPath(newPath);
	};

	return (
		<div className="flex-1 flex flex-col bg-[#0a0a0a] text-xs relative overflow-hidden min-h-0">
			{/* Toolbar / Breadcrumbs */}
			<div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "#00ff4120", background: "#0d0d0d" }}>
				<button
					onClick={goUp}
					disabled={currentPath === '/'}
					className="px-2 py-1 rounded transition-colors disabled:opacity-50 hover:bg-[#00ff4120]"
					style={{ color: "#00ff41", border: "1px solid #00ff4140" }}
				>
					↑ Up
				</button>
				<input
					value={currentPath}
					readOnly
					className="flex-1 bg-transparent outline-none px-2 text-[#00e5ff] font-medium"
					style={{ fontFamily: "'Fira Code', 'Courier New', monospace" }}
				/>
				<button
					onClick={() => loadPath(currentPath)}
					className="px-2 py-1 rounded transition-colors hover:bg-[#00ff4120]"
					style={{ color: "#00ff41", border: "1px solid #00ff4140" }}
				>
					↻ Refresh
				</button>
			</div>

			{error && (
				<div className="p-2 m-2 rounded" style={{ background: "#2a0a0a", border: "1px solid #ff2d5530", color: "#ff6b6b" }}>
					{error}
				</div>
			)}

			{/* File List Grid */}
			<div className="flex-1 overflow-y-auto p-2" style={{ fontFamily: "inherit" }}>
				<table className="w-full text-left border-collapse">
					<thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-sm shadow-[#0a0a0a]">
						<tr>
							<th className="p-2 font-semibold border-b" style={{ borderColor: "#00ff4115", color: "#4a8a4a" }}>Name</th>
							<th className="p-2 font-semibold border-b w-24" style={{ borderColor: "#00ff4115", color: "#4a8a4a" }}>Size</th>
							<th className="p-2 font-semibold border-b w-32" style={{ borderColor: "#00ff4115", color: "#4a8a4a" }}>Modified</th>
						</tr>
					</thead>
					<tbody style={{ opacity: loading ? 0.5 : 1 }}>
						{files.map(f => (
							<tr
								key={f.name}
								className="hover:bg-[#00ff4110] transition-colors cursor-pointer group"
								onDoubleClick={() => handleDoubleClick(f)}
							>
								<td className="p-2 border-b flex items-center gap-2" style={{ borderColor: "#00ff410a", color: f.is_dir ? "#00e5ff" : "#ccc" }}>
									<span>{f.is_dir ? "📁" : "📄"}</span>
									{f.name}
								</td>
								<td className="p-2 border-b" style={{ borderColor: "#00ff410a", color: "#888" }}>
									{f.is_dir ? "--" : formatBytes(f.size)}
								</td>
								<td className="p-2 border-b" style={{ borderColor: "#00ff410a", color: "#888" }}>
									{new Date(f.modified * 1000).toLocaleString()}
								</td>
							</tr>
						))}
					</tbody>
				</table>

				{files.length === 0 && !loading && !error && (
					<div className="text-center p-8 italic" style={{ color: "#4a8a4a" }}>
						Directory is empty
					</div>
				)}
			</div>

			{isDragging && (
				<div
					className="absolute inset-0 flex items-center justify-center pointer-events-none"
					style={{ background: "rgba(0, 255, 65, 0.1)", backdropFilter: "blur(2px)", border: "2px dashed #00ff41" }}
				>
					<div className="bg-[#0a0a0a] px-6 py-4 rounded-lg shadow-2xl border" style={{ borderColor: "#00ff41" }}>
						<h2 className="text-lg font-bold crt-glow" style={{ color: "#00ff41" }}>Drop files to upload via SFTP</h2>
						<p style={{ color: "#4a8a4a" }}>Files will be saved to: {currentPath}</p>
					</div>
				</div>
			)}
		</div>
	);
}
