import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionType, Session } from "../types/session";

interface ConnectionForm {
	name: string;
	host: string;
	port: number;
	conn_type: SessionType;
	username: string;
	password: string;
	group_name: string;
}

interface Props {
	onClose: () => void;
	onSaved: (id?: number) => void;
	editSession?: Session;
}

const DEFAULT_PORTS: Record<SessionType, number> = {
	ssh: 22,
	sftp: 22,
	rdp: 3389,
	telnet: 23,
};

const PROTOCOL_OPTIONS: { value: SessionType; label: string; icon: string }[] = [
	{ value: "ssh", label: "SSH", icon: "⌨" },
	{ value: "sftp", label: "SFTP", icon: "📁" },
	{ value: "rdp", label: "RDP", icon: "🖥" },
	{ value: "telnet", label: "Telnet", icon: "📡" },
];

function ThemedSelect({
	value,
	onChange,
	children,
}: {
	value: string;
	onChange: (v: string) => void;
	children: React.ReactNode;
}) {
	return (
		<div className="relative">
			<select
				value={value}
				onChange={e => onChange(e.target.value)}
				className="w-full appearance-none text-xs px-2 py-1.5 rounded outline-none cursor-pointer"
				style={{
					background: "#0f1a0f",
					border: "1px solid #00ff4130",
					color: "#00ff41",
					fontFamily: "inherit",
				}}
			>
				{children}
			</select>
			<span
				className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs"
				style={{ color: "#00ff4180" }}
			>
				▾
			</span>
		</div>
	);
}

export function NewConnectionModal({ onClose, onSaved, editSession }: Props) {
	const [form, setForm] = useState<ConnectionForm>({
		name: editSession?.name ?? "",
		host: editSession?.host ?? "",
		port: editSession?.port ?? 22,
		conn_type: editSession?.type ?? "ssh",
		username: editSession?.username ?? "root",
		password: "", // Passwords are not fetched for security; re-enter if changing
		group_name: editSession?.group ?? "Default",
	});
	const [groups, setGroups] = useState<string[]>(["Default"]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		invoke<string[]>("get_groups")
			.then(data => {
				const merged = Array.from(new Set(["Default", ...data]));
				setGroups(merged);
			})
			.catch(() => setGroups(["Default"]));
	}, []);

	const handleChange = (field: keyof ConnectionForm, value: string | number) => {
		setForm(prev => {
			const updated = { ...prev, [field]: value };
			if (field === "conn_type") {
				updated.port = DEFAULT_PORTS[value as SessionType];
			}
			return updated;
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.name || !form.host || !form.username) {
			setError("Name, Host and Username are required.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const payload = {
				config: {
					id: editSession?.id ?? null,
					name: form.name,
					host: form.host,
					port: form.port,
					conn_type: form.conn_type,
					username: form.username,
					password: form.password || null,
					group_name: form.group_name,
				},
			};

			if (editSession) {
				await invoke("update_connection", payload);
				onSaved(editSession.id);
			} else {
				const newId = await invoke<number>("add_connection", payload);
				onSaved(newId);
			}

			onClose();
		} catch (err) {
			setError(String(err));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
			onClick={e => e.target === e.currentTarget && onClose()}
		>
			<div
				className="w-full max-w-md rounded-lg shadow-2xl"
				style={{ background: "#0d0d0d", border: "1px solid #00ff4130" }}
			>
				<div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#00ff4120" }}>
					<span className="text-sm font-semibold crt-glow" style={{ color: "#00ff41" }}>
						⌨ {editSession ? "Edit Connection" : "New Connection"}
					</span>
					<button
						onClick={onClose}
						className="text-xs hover:text-red-400 transition-colors"
						style={{ color: "#4a6e4a" }}
					>
						✕ Close
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
					<Field label="Protocol">
						<div className="flex gap-1.5">
							{PROTOCOL_OPTIONS.map(opt => (
								<button
									type="button"
									key={opt.value}
									onClick={() => handleChange("conn_type", opt.value)}
									className="flex-1 py-1.5 text-xs rounded transition-all duration-150 font-medium"
									style={
										form.conn_type === opt.value
											? { background: "#0f2a0f", border: "1px solid #00ff4150", color: "#00ff41" }
											: { background: "#0a0a0a", border: "1px solid #00ff4115", color: "#2a4a2a" }
									}
								>
									{opt.icon} {opt.label}
								</button>
							))}
						</div>
					</Field>

					<Field label="Connection Name" required>
						<Input
							placeholder="e.g. prod-web-01"
							value={form.name}
							onChange={v => handleChange("name", v)}
						/>
					</Field>

					<div className="flex gap-2">
						<div className="flex-1">
							<Field label="Host / IP" required>
								<Input
									placeholder="10.0.1.10"
									value={form.host}
									onChange={v => handleChange("host", v)}
								/>
							</Field>
						</div>
						<div style={{ width: "80px" }}>
							<Field label="Port">
								<Input
									placeholder="22"
									value={String(form.port)}
									onChange={v => handleChange("port", Number(v))}
									type="number"
								/>
							</Field>
						</div>
					</div>

					<Field label="Username" required>
						<Input
							placeholder="root"
							value={form.username}
							onChange={v => handleChange("username", v)}
						/>
					</Field>

					<Field label="Password">
						<Input
							placeholder={editSession ? "leave blank to keep unchanged" : "leave blank to prompt in terminal"}
							value={form.password}
							onChange={v => handleChange("password", v)}
							type="password"
						/>
					</Field>

					<Field label="Group">
						<ThemedSelect
							value={form.group_name}
							onChange={v => handleChange("group_name", v)}
						>
							{groups.map(g => (
								<option key={g} value={g}>{g}</option>
							))}
						</ThemedSelect>
					</Field>

					{error && (
						<div className="text-xs px-2 py-1.5 rounded" style={{ background: "#2a0a0a", border: "1px solid #ff2d5530", color: "#ff6b6b" }}>
							⚠ {error}
						</div>
					)}

					<div className="flex gap-2 mt-1">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 py-2 text-xs rounded transition-all hover:brightness-125"
							style={{ background: "#1a1a1a", border: "1px solid #ffffff15", color: "#6a6a6a" }}
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={saving}
							className="flex-1 py-2 text-xs rounded font-semibold transition-all hover:brightness-125 disabled:opacity-50"
							style={{ background: "linear-gradient(135deg, #0f2a0f, #1a5a1a)", border: "1px solid #00ff4140", color: "#00ff41" }}
						>
							{saving ? "Saving..." : editSession ? "✓ Update Connection" : "✓ Save Connection"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs" style={{ color: "#4a8a4a" }}>
				{label}{required && <span style={{ color: "#ff6b6b" }}> *</span>}
			</label>
			{children}
		</div>
	);
}

function Input({
	placeholder, value, onChange, type = "text",
}: {
	placeholder?: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
}) {
	return (
		<input
			type={type}
			placeholder={placeholder}
			value={value}
			onChange={e => onChange(e.target.value)}
			className="w-full text-xs px-2 py-1.5 rounded outline-none placeholder-emerald-900"
			style={{ background: "#0f1a0f", border: "1px solid #00ff4130", color: "#00ff41" }}
		/>
	);
}
