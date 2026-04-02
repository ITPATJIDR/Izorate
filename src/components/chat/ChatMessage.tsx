import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import copy from "copy-to-clipboard";
import type { Message } from "../../types/ai";

const CopyButton = ({ code }: { code: string }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		copy(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			onClick={handleCopy}
			className={`text-[9px] px-2 py-1 rounded border transition-all uppercase font-bold backdrop-blur-sm ${copied
				? "bg-[var(--border-focus)] text-[var(--accent-primary)] border-[var(--accent-primary)]"
				: "bg-[var(--bg-hover)] hover:bg-[var(--border-focus)] text-text-emerald-500/80 hover:text-[var(--accent-primary)] border-[var(--border-focus)]"
				}`}
		>
			{copied ? "Copied!" : "Copy"}
		</button>
	);
};

const MarkdownRenderer = memo(({ content }: { content: string }) => {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				code({ node, inline, className, children, ...props }: any) {
					const match = /language-(\w+)/.exec(className || "");
					const codeString = String(children).replace(/\n$/, "");

					if (!inline && match) {
						return (
							<div className="relative group/code my-2">
								<div className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
									<CopyButton code={codeString} />
								</div>
								<SyntaxHighlighter
									style={vscDarkPlus as any}
									language={match[1]}
									PreTag="div"
									customStyle={{
										margin: 0,
										padding: "1rem",
										fontSize: "11px",
										background: "var(--bg-card)",
										border: "1px solid var(--accent-primary)15",
										borderRadius: "4px"
									}}
									{...props}
								>
									{codeString}
								</SyntaxHighlighter>
							</div>
						);
					}
					return (
						<code className={className} {...props}>
							{children}
						</code>
					);
				}
			}}
		>
			{content}
		</ReactMarkdown>
	);
});

interface ChatMessageProps {
	msg: Message;
}

export const ChatMessage = memo(({ msg }: ChatMessageProps) => {
	return (
		<div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
			<div className="max-w-[90%] text-xs p-2 rounded leading-relaxed border"
				style={{ background: "var(--bg-surface)", borderColor: "var(--border-focus)", color: "var(--text-main)" }}>
				<div className="flex justify-between items-center mb-1 opacity-40">
					<span className="text-[9px] uppercase font-bold tracking-widest">
						{msg.role === "ai" ? "Assistant" : "User"}
					</span>
				</div>
				<div className="markdown-content">
					<MarkdownRenderer content={msg.content} />
				</div>
			</div>
		</div>
	);
});
