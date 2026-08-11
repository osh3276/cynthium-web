import type { ReactNode } from "react";

/** Top-level docs section with a sidebar anchor. */
export function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section id={id} className="docs-section">
			<h2 className="docs-h2">{title}</h2>
			{children}
		</section>
	);
}

/** Subsection inside a section. */
export function SubSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="docs-subsection">
			<h3 className="docs-h3">{title}</h3>
			{children}
		</section>
	);
}

export function P({ children }: { children: ReactNode }) {
	return <p className="docs-p">{children}</p>;
}

export function InlineCode({ children }: { children: ReactNode }) {
	return <code className="docs-code">{children}</code>;
}

export function CodeBlock({ title, code }: { title?: string; code: string }) {
	return (
		<div className="docs-codeblock">
			{title && <div className="docs-codeblock-title">{title}</div>}
			<pre className="docs-codeblock-pre">
				<code>{code}</code>
			</pre>
		</div>
	);
}

export function Note({ children }: { children: ReactNode }) {
	return <div className="docs-note">{children}</div>;
}

export function Table({
	headers,
	rows,
}: {
	headers: string[];
	rows: ReactNode[][];
}) {
	return (
		<table className="docs-table">
			<thead>
				<tr>
					{headers.map((h, i) => (
						<th key={i}>{h}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, i) => (
					<tr key={i}>
						{row.map((cell, j) => (
							<td key={j}>{cell}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export function List({
	items,
	ordered,
}: {
	items: ReactNode[];
	ordered?: boolean;
}) {
	const cls = ordered ? "docs-list docs-list-ol" : "docs-list";
	const Tag = ordered ? "ol" : "ul";
	return (
		<Tag className={cls}>
			{items.map((it, i) => (
				<li key={i}>{it}</li>
			))}
		</Tag>
	);
}
