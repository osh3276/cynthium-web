import { useCallback, useRef, useState } from "react";

export default function MenuBar() {
	return (
		<div className="menubar">
			<MenuDropdown label="File">
				<MenuItemComp label="Open" shortcut="Ctrl+O" />
				<MenuItemComp label="Export Simulation Data" shortcut="Ctrl+E" />
				<MenuSeparator />
				<MenuItemComp label="Exit" shortcut="Ctrl+Q" />
			</MenuDropdown>
			<MenuDropdown label="Edit" />
			<MenuDropdown label="View" />
			<MenuDropdown label="Help" />
		</div>
	);
}

function MenuDropdown({
	label,
	children,
}: {
	label: string;
	children?: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	const handleBlur = useCallback((e: React.FocusEvent) => {
		if (!ref.current?.contains(e.relatedTarget as Node)) {
			setOpen(false);
		}
	}, []);

	return (
		<div
			ref={ref}
			className={`menu-dropdown ${open ? "menu-open" : ""}`}
			tabIndex={0}
			onFocus={() => setOpen(true)}
			onBlur={handleBlur}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<span className="menu-label">{label}</span>
			{open && children && (
				<div className="menu-popup" onMouseDown={(e) => e.preventDefault()}>
					{children}
				</div>
			)}
		</div>
	);
}

function MenuItemComp({ label, shortcut }: { label: string; shortcut?: string }) {
	return (
		<button
			className="menu-item"
			onClick={() => {
				/* placeholder */
			}}
		>
			<span>{label}</span>
			{shortcut && <span className="menu-shortcut">{shortcut}</span>}
		</button>
	);
}

function MenuSeparator() {
	return <div className="menu-separator" />;
}
