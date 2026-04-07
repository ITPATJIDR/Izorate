import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../types/session";

interface S3Bucket {
	name: string;
	created_at?: string;
}

interface S3Object {
	key: string;
	size: number;
	last_modified?: string;
	is_dir: boolean;
}

interface Props {
	session: Session;
}

export function S3Manager({ session }: Props) {
	const [buckets, setBuckets] = useState<S3Bucket[]>([]);
	const [activeBucket, setActiveBucket] = useState<string | null>(null);
	const [objects, setObjects] = useState<S3Object[]>([]);
	const [prefix, setPrefix] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadBuckets = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await invoke<S3Bucket[]>("list_s3_buckets", { id: session.id });
			setBuckets(res);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, [session.id]);

	const loadObjects = useCallback(async (bucket: string, currentPrefix: string) => {
		setLoading(true);
		setError(null);
		try {
			const res = await invoke<S3Object[]>("list_s3_objects", {
				id: session.id,
				bucket,
				prefix: currentPrefix
			});
			setObjects(res);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, [session.id]);

	useEffect(() => {
		loadBuckets();
	}, [loadBuckets]);

	useEffect(() => {
		if (activeBucket) {
			loadObjects(activeBucket, prefix);
		}
	}, [activeBucket, prefix, loadObjects]);

	const formatSize = (bytes: number) => {
		if (bytes === 0) return "-";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const handleBucketClick = (bucketName: string) => {
		setActiveBucket(bucketName);
		setPrefix("");
	};

	const handleObjectClick = (obj: S3Object) => {
		if (obj.is_dir) {
			setPrefix(obj.key);
		}
	};

	const handleDelete = async (key: string) => {
		if (!activeBucket) return;
		if (!confirm(`Delete ${key}?`)) return;

		try {
			await invoke("delete_s3_object", { id: session.id, bucket: activeBucket, key });
			loadObjects(activeBucket, prefix);
		} catch (err) {
			alert(`Delete failed: ${err}`);
		}
	};

	const goBack = () => {
		if (prefix === "") {
			setActiveBucket(null);
			setObjects([]);
		} else {
			// Remove last part of prefix
			const parts = prefix.split("/").filter(p => p !== "");
			parts.pop();
			setPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
		}
	};

	return (
		<div className="flex-1 flex flex-col bg-[var(--bg-base)] overflow-hidden font-sans">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "var(--border-focus)", background: "var(--bg-surface)" }}>
				<div className="flex items-center gap-2">
					<span className="text-sm font-bold text-[var(--accent-primary)] uppercase tracking-widest">☁ S3 Manager</span>
					<span className="text-xs text-[var(--text-muted)]">| {session.name} ({session.host})</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => activeBucket ? loadObjects(activeBucket, prefix) : loadBuckets()}
						className="text-[10px] px-2 py-1 bg-[var(--bg-hover)] border border-[var(--border-focus)] text-[var(--text-muted)] hover:text-white"
					>
						REFRESH
					</button>
				</div>
			</div>

			{/* Breadcrumbs */}
			<div className="px-4 py-1 bg-[var(--bg-base)] border-b border-[var(--border-focus)] flex items-center gap-2 overflow-x-auto no-scrollbar">
				<button onClick={() => { setActiveBucket(null); setPrefix(""); }} className="text-[10px] text-[var(--accent-primary)] uppercase hover:underline shrink-0">S3 Root</button>
				{activeBucket && (
					<>
						<span className="text-[var(--text-muted)]">/</span>
						<button onClick={() => setPrefix("")} className="text-[10px] text-[var(--accent-primary)] uppercase hover:underline shrink-0">{activeBucket}</button>
					</>
				)}
				{prefix && prefix.split("/").filter(p => p).map((p, i, arr) => (
					<span key={i} className="flex items-center gap-2 shrink-0">
						<span className="text-[var(--text-muted)]">/</span>
						<button
							onClick={() => setPrefix(arr.slice(0, i + 1).join("/") + "/")}
							className="text-[10px] text-[var(--accent-primary)] uppercase hover:underline"
						>
							{p}
						</button>
					</span>
				))}
			</div>

			{/* Main Content */}
			<div className="flex-1 overflow-y-auto custom-scrollbar">
				{loading && (
					<div className="p-4 text-[10px] text-[var(--accent-primary)] animate-pulse uppercase font-bold text-center">Contacting AWS...</div>
				)}

				{error && (
					<div className="m-4 p-3 bg-red-900/20 border border-red-500/50 text-red-400 text-xs rounded">
						⚠ Error: {error}
					</div>
				)}

				{!activeBucket ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
						{buckets.map(b => (
							<div
								key={b.name}
								onClick={() => handleBucketClick(b.name)}
								className="p-3 border border-[var(--border-focus)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] cursor-pointer transition-all group"
							>
								<div className="flex items-center gap-3">
									<span className="text-xl group-hover:scale-110 transition-transform">🪣</span>
									<div className="min-w-0">
										<div className="text-xs font-bold truncate text-white">{b.name}</div>
										<div className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">Bucket</div>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<table className="w-full text-left text-[11px] border-collapse">
						<thead className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-focus)] text-[var(--text-muted)] uppercase font-bold text-[9px] z-10">
							<tr>
								<th className="px-4 py-2 font-bold tracking-widest">Name</th>
								<th className="px-4 py-2 font-bold tracking-widest text-right">Size</th>
								<th className="px-4 py-2 font-bold tracking-widest">Last Modified</th>
								<th className="px-4 py-2 font-bold tracking-widest text-center">Actions</th>
							</tr>
						</thead>
						<tbody>
							{prefix !== "" && (
								<tr onClick={goBack} className="hover:bg-[var(--bg-hover)] cursor-pointer text-[var(--accent-primary)] border-b border-[var(--border-focus)]/30">
									<td className="px-4 py-2 font-bold">.. [Parent Directory]</td>
									<td></td><td></td><td></td>
								</tr>
							)}
							{objects.map(obj => (
								<tr
									key={obj.key}
									onClick={() => obj.is_dir && handleObjectClick(obj)}
									className={`border-b border-[var(--border-focus)]/20 hover:bg-[var(--bg-hover)] group ${obj.is_dir ? 'cursor-pointer' : ''}`}
								>
									<td className="px-4 py-2 flex items-center gap-2">
										<span>{obj.is_dir ? "📁" : "📄"}</span>
										<span className={obj.is_dir ? "text-amber-400 font-bold" : "text-[var(--text-main)]"}>
											{obj.is_dir ? obj.key.replace(prefix, "").replace("/", "") : obj.key.replace(prefix, "")}
										</span>
									</td>
									<td className="px-4 py-2 text-right text-[var(--text-muted)] font-mono">{formatSize(obj.size)}</td>
									<td className="px-4 py-2 text-[var(--text-muted)]">{obj.last_modified ? new Date(obj.last_modified).toLocaleString() : "-"}</td>
									<td className="px-4 py-2 text-center">
										{!obj.is_dir && (
											<button
												onClick={(e) => { e.stopPropagation(); handleDelete(obj.key); }}
												className="text-[10px] text-red-500/50 hover:text-red-500 uppercase font-bold transition-colors"
											>
												Delete
											</button>
										)}
									</td>
								</tr>
							))}
							{objects.length === 0 && !loading && (
								<tr>
									<td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)] italic opacity-30">This folder is empty.</td>
								</tr>
							)}
						</tbody>
					</table>
				)}
			</div>

			{!activeBucket && buckets.length === 0 && !loading && !error && (
				<div className="flex-1 flex flex-col items-center justify-center opacity-30 select-none">
					<div className="text-5xl mb-4">☁</div>
					<p className="text-xs uppercase font-bold tracking-widest">No Buckets Found</p>
					<p className="text-[10px] mt-2 italic">Ensure your credentials have s3:ListAllMyBuckets permission.</p>
				</div>
			)}
		</div>
	);
}
