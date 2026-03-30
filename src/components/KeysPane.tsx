import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Credential {
	id?: number;
	name: string;
	username: string;
	password?: string;
	private_key?: string;
	passphrase?: string;
}

export function KeysPane() {
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingCred, setEditingCred] = useState<Credential | null>(null);

	// Form state
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [privateKey, setPrivateKey] = useState("");
	const [passphrase, setPassphrase] = useState("");

	const fetchCredentials = async () => {
		try {
			const res = await invoke<Credential[]>("get_credentials");
			setCredentials(res);
		} catch (err) {
			console.error("Failed to fetch credentials:", err);
		}
	};

	useEffect(() => {
		fetchCredentials();
	}, []);

	const handleOpenModal = (cred?: Credential) => {
		if (cred) {
			setEditingCred(cred);
			setName(cred.name);
			setUsername(cred.username);
			setPassword(cred.password || "");
			setPrivateKey(cred.private_key || "");
			setPassphrase(cred.passphrase || "");
		} else {
			setEditingCred(null);
			setName("");
			setUsername("");
			setPassword("");
			setPrivateKey("");
			setPassphrase("");
		}
		setIsModalOpen(true);
	};

	const handleSave = async () => {
		if (!name || !username) return;

		const cred: Credential = {
			id: editingCred?.id,
			name,
			username,
			password: password || undefined,
			private_key: privateKey || undefined,
			passphrase: passphrase || undefined,
		};

		try {
			await invoke("upsert_credential", { cred });
			await fetchCredentials();
			setIsModalOpen(false);
		} catch (err) {
			alert(`Error saving: ${err}`);
		}
	};

	const handleDelete = async (id: number) => {
		if (!confirm("Are you sure you want to delete this credential?")) return;
		try {
			await invoke("delete_credential", { id });
			await fetchCredentials();
		} catch (err) {
			alert(`Error deleting: ${err}`);
		}
	};

	return (
		<div className="flex-1 flex flex-col bg-[var(--bg-base)] overflow-hidden">
			<div className="p-6 md:p-8 max-w-5xl w-full mx-auto">
				<div className="mb-8 flex justify-between items-end">
					<div>
						<h2 className="text-2xl font-bold text-[var(--accent-primary)] crt-glow mb-1 uppercase tracking-tighter">Credential Vault</h2>
						<p className="text-xs text-[var(--text-muted)]">Manage reusable SSH keys and passwords for your connections.</p>
					</div>
					<button
						onClick={() => handleOpenModal()}
						className="px-4 py-2 bg-[var(--accent-primary)] text-black text-xs font-bold rounded hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)] uppercase"
					>
						+ Add New Key
					</button>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{credentials.length === 0 ? (
						<div className="col-span-full py-12 border border-dashed border-[#4a6e4a30] rounded-lg flex flex-col items-center justify-center text-[var(--text-muted)]">
							<span className="text-4xl mb-4">🔐</span>
							<p className="text-sm italic">No credentials saved yet.</p>
						</div>
					) : (
						credentials.map((cred) => (
							<div
								key={cred.id}
								className="group relative bg-[var(--bg-surface)] border border-[var(--bg-hover)] hover:border-[var(--border-focus)] rounded-lg p-4 transition-all hover:bg-[var(--bg-hover)]"
							>
								<div className="flex items-start justify-between mb-3">
									<div className="w-10 h-10 rounded bg-[#1a1a1a] flex items-center justify-center text-xl">
										{cred.private_key ? "🔑" : "⌨️"}
									</div>
									<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											onClick={() => handleOpenModal(cred)}
											className="p-1.5 hover:text-[var(--accent-primary)] text-[var(--text-muted)]"
										>
											✏️
										</button>
										<button
											onClick={() => cred.id && handleDelete(cred.id)}
											className="p-1.5 hover:text-red-500 text-[var(--text-muted)]"
										>
											🗑️
										</button>
									</div>
								</div>
								<h4 className="text-sm font-bold text-[var(--text-main)] truncate">{cred.name}</h4>
								<div className="mt-2 space-y-1">
									<p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Username</p>
									<p className="text-xs text-text-emerald-500/80 font-mono">{cred.username}</p>
								</div>
								{cred.password && (
									<div className="mt-2 space-y-1">
										<p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Auth Type</p>
										<p className="text-[10px] text-[var(--text-muted)]">Password Protected</p>
									</div>
								)}
								{cred.private_key && (
									<div className="mt-2 space-y-1">
										<p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Auth Type</p>
										<p className="text-[10px] text-[var(--text-muted)]">SSH Private Key</p>
									</div>
								)}
							</div>
						))
					)}
				</div>
			</div>

			{/* Add/Edit Modal */}
			{isModalOpen && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
					<div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-focus)] rounded-lg shadow-2xl overflow-hidden">
						<div className="px-6 py-4 border-b border-[var(--bg-hover)] bg-[#0f1a0f] flex items-center justify-between">
							<h3 className="text-sm font-bold text-[var(--accent-primary)] crt-glow uppercase tracking-widest">
								{editingCred ? "Edit Credential" : "New Credential"}
							</h3>
							<button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--accent-primary)]">✕</button>
						</div>

						<div className="p-6 space-y-4">
							<div className="space-y-1">
								<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Label (Friendly Name)</label>
								<input
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="w-full bg-black border border-[var(--border-focus)] rounded px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
									placeholder="e.g. Production Web Server"
								/>
							</div>

							<div className="space-y-1">
								<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Username</label>
								<input
									type="text"
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									className="w-full bg-black border border-[var(--border-focus)] rounded px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
								/>
							</div>

							<div className="space-y-1">
								<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Password (Optional)</label>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									className="w-full bg-black border border-[var(--border-focus)] rounded px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)]"
								/>
							</div>

							<div className="space-y-1">
								<label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">SSH Private Key (Optional)</label>
								<textarea
									value={privateKey}
									onChange={(e) => setPrivateKey(e.target.value)}
									className="w-full h-24 bg-black border border-[var(--border-focus)] rounded px-3 py-2 text-[10px] font-mono text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-primary)] resize-none"
									placeholder="-----BEGIN RSA PRIVATE KEY-----"
								/>
							</div>

							{privateKey && (
								<div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
									<label className="text-[10px] font-bold text-[#ffa500] uppercase">Key Passphrase (if any)</label>
									<input
										type="password"
										value={passphrase}
										onChange={(e) => setPassphrase(e.target.value)}
										className="w-full bg-black border border-[#ffa50040] rounded px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[#ffa500]"
									/>
								</div>
							)}
						</div>

						<div className="px-6 py-4 bg-black/40 flex justify-end gap-3">
							<button
								onClick={() => setIsModalOpen(false)}
								className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] uppercase font-bold"
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								className="px-6 py-2 bg-[var(--accent-primary)] text-black text-xs font-bold rounded hover:bg-emerald-600 active:scale-95 transition-all shadow-[var(--accent-glow)] uppercase"
							>
								Save Credential
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
