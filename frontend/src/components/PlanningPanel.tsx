import { useCallback, useRef, useState } from "react";
import type { Waypoint } from "../types";

interface ParsedWP {
	x: number;
	y: number;
}

interface Props {
	waypoints: Waypoint[];
	onAddWaypoint: (wp: Waypoint) => void;
	onRemoveWaypoint: (index: number) => void;
	onUpdateWaypoint: (index: number, wp: Waypoint) => void;
	onMoveWaypoint: (fromIndex: number, toIndex: number) => void;
	onClearWaypoints: () => void;
}

export default function PlanningPanel({
	waypoints,
	onAddWaypoint,
	onRemoveWaypoint,
	onUpdateWaypoint,
	onMoveWaypoint,
	onClearWaypoints,
}: Props) {
	const coordRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [editingIdx, setEditingIdx] = useState<number | null>(null);
	const [editX, setEditX] = useState("");
	const [editY, setEditY] = useState("");
	const [importError, setImportError] = useState<string | null>(null);

	const handleAddCoord = useCallback(() => {
		const val = coordRef.current?.value.trim();
		if (!val) return;
		const parts = val.split(",").map((s) => s.trim());
		if (parts.length !== 2) return;
		const x = parseFloat(parts[0]);
		const y = parseFloat(parts[1]);
		if (isNaN(x) || isNaN(y)) return;
		onAddWaypoint({ x, y });
		if (coordRef.current) coordRef.current.value = "";
	}, [onAddWaypoint]);

	const handleAddCoordKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") handleAddCoord();
		},
		[handleAddCoord],
	);

	const startEdit = useCallback(
		(idx: number) => {
			const wp = waypoints[idx];
			if (!wp) return;
			setEditingIdx(idx);
			setEditX(wp.x.toFixed(2));
			setEditY(wp.y.toFixed(2));
		},
		[waypoints],
	);

	const cancelEdit = useCallback(() => {
		setEditingIdx(null);
	}, []);

	const saveEdit = useCallback(() => {
		if (editingIdx == null) return;
		const x = parseFloat(editX);
		const y = parseFloat(editY);
		if (isNaN(x) || isNaN(y)) return;
		onUpdateWaypoint(editingIdx, { x, y });
		setEditingIdx(null);
	}, [editingIdx, editX, editY, onUpdateWaypoint]);

	const handleEditKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") saveEdit();
			if (e.key === "Escape") cancelEdit();
		},
		[saveEdit, cancelEdit],
	);

	const handleExportCSV = useCallback(() => {
		if (waypoints.length === 0) return;
		const rows = [["index", "x", "y"]];
		waypoints.forEach((wp, i) => {
			rows.push([String(i + 1), wp.x.toFixed(4), wp.y.toFixed(4)]);
		});
		const csv = rows.map((r) => r.join(",")).join("\n");
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "waypoints.csv";
		a.click();
		URL.revokeObjectURL(url);
	}, [waypoints]);

	const handleExportJSON = useCallback(() => {
		if (waypoints.length === 0) return;
		const data = {
			type: "waypoints",
			count: waypoints.length,
			waypoints: waypoints.map((wp, i) => ({
				index: i + 1,
				x: wp.x,
				y: wp.y,
			})),
		};
		const json = JSON.stringify(data, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "waypoints.json";
		a.click();
		URL.revokeObjectURL(url);
	}, [waypoints]);

	const parseCSV = useCallback((text: string): ParsedWP[] => {
		const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
		const result: ParsedWP[] = [];
		for (let i = 0; i < lines.length; i++) {
			const parts = lines[i].split(",").map((s) => s.trim());
			// Skip header row if it starts with a non-numeric label
			if (i === 0 && /^[a-z]/i.test(parts[0]) && parts.length >= 2) continue;
			// Try last two numeric values as x,y (handles index,x,y or x,y)
			const vals = parts.filter((p) => /^-?\d+\.?\d*$/.test(p)).map(Number);
			if (vals.length >= 2) {
				result.push({ x: vals[vals.length - 2], y: vals[vals.length - 1] });
			}
		}
		return result;
	}, []);

	const parseJSON = useCallback((text: string): ParsedWP[] => {
		const data = JSON.parse(text);
		// Exported format: { type: "waypoints", waypoints: [{index, x, y}] }
		if (data && Array.isArray(data.waypoints)) {
			const valid: { x: number; y: number }[] = [];
			for (const wp of data.waypoints) {
				if (typeof wp.x === "number" && typeof wp.y === "number") {
					valid.push({ x: wp.x, y: wp.y });
				}
			}
			return valid;
		}
		// Plain array: [{x, y}]
		if (Array.isArray(data)) {
			const valid: { x: number; y: number }[] = [];
			for (const wp of data) {
				if (typeof wp.x === "number" && typeof wp.y === "number") {
					valid.push({ x: wp.x, y: wp.y });
				}
			}
			return valid;
		}
		throw new Error("Unrecognised JSON structure");
	}, []);

	const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setImportError(null);
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			try {
				let parsed: ParsedWP[];
				if (file.name.endsWith(".json")) {
					parsed = parseJSON(text);
				} else {
					parsed = parseCSV(text);
				}
				if (parsed.length === 0) {
					setImportError("No valid waypoints found in file");
					return;
				}
				parsed.forEach((wp) => onAddWaypoint(wp));
			} catch (err) {
				setImportError(err instanceof Error ? err.message : "Failed to parse file");
			}
		};
		reader.readAsText(file);
		// Reset so the same file can be re-imported
		if (fileInputRef.current) fileInputRef.current.value = "";
	}, [onAddWaypoint, parseCSV, parseJSON]);

	const handleImportClick = useCallback(() => {
		setImportError(null);
		fileInputRef.current?.click();
	}, []);

	return (
		<div className="panel">
			<h3 className="panel-title">Planning</h3>

			<label className="field-label">Coordinate:</label>
			<input
				ref={coordRef}
				className="field-input"
				type="text"
				placeholder="x,y"
				onKeyDown={handleAddCoordKeyDown}
			/>

			<button className="panel-button" onClick={handleAddCoord}>
				Add waypoint
			</button>

			<label className="field-label">Waypoints:</label>
			{waypoints.length === 0 ? (
				<div className="field-value-text" style={{ fontStyle: "italic", color: "var(--text-dim)", marginBottom: 6 }}>
					No waypoints yet
				</div>
			) : (
				<div className="waypoint-list">
					{waypoints.map((wp, i) => (
						<div key={i} className="waypoint-row">
							{editingIdx === i ? (
								<div className="waypoint-edit">
									<input
										className="field-input field-input-narrow"
										type="text"
										value={editX}
										onChange={(e) => setEditX(e.target.value)}
										onKeyDown={handleEditKeyDown}
										autoFocus
									/>
									<span className="waypoint-comma">,</span>
									<input
										className="field-input field-input-narrow"
										type="text"
										value={editY}
										onChange={(e) => setEditY(e.target.value)}
										onKeyDown={handleEditKeyDown}
									/>
									<button
										className="panel-button panel-button-xs"
										onClick={saveEdit}
										title="Save"
									>
										&#10003;
									</button>
									<button
										className="panel-button panel-button-xs"
										onClick={cancelEdit}
										title="Cancel"
									>
										&#10005;
									</button>
								</div>
							) : (
								<>
									<span
										className="waypoint-idx"
										onDoubleClick={() => startEdit(i)}
										title="Double-click to edit"
									>
										{i + 1}.
									</span>
									<span className="waypoint-coords">
										({wp.x.toFixed(2)}, {wp.y.toFixed(2)})m
									</span>
								</>
							)}
							{editingIdx !== i && (
								<div className="waypoint-actions">
									<button
										className="panel-button panel-button-icon"
										onClick={() => startEdit(i)}
										title="Edit coordinates"
										disabled={editingIdx != null}
									>
										&#9998;
									</button>
									<button
										className="panel-button panel-button-icon"
										onClick={() => onMoveWaypoint(i, i - 1)}
										disabled={i === 0}
										title="Move up"
									>
										&#9650;
									</button>
									<button
										className="panel-button panel-button-icon"
										onClick={() => onMoveWaypoint(i, i + 1)}
										disabled={i === waypoints.length - 1}
										title="Move down"
									>
										&#9660;
									</button>
									<button
										className="panel-button panel-button-icon"
										onClick={() => onRemoveWaypoint(i)}
										title="Delete waypoint"
									>
										&#10005;
									</button>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			<div className="field-row" style={{ marginTop: 4 }}>
				<button
					className="panel-button panel-button-sm"
					onClick={onClearWaypoints}
					disabled={waypoints.length === 0}
				>
					Clear path
				</button>
			</div>

			<div className="sidebar-divider" />
			<label className="field-label">Import / Export:</label>
			<div className="field-row export-buttons">
				<button
					className="panel-button panel-button-sm"
					onClick={handleImportClick}
				>
					Import
				</button>
				{waypoints.length > 0 && (
					<>
						<button
							className="panel-button panel-button-sm"
							onClick={handleExportCSV}
						>
							CSV
						</button>
						<button
							className="panel-button panel-button-sm"
							onClick={handleExportJSON}
						>
							JSON
						</button>
					</>
				)}
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv,.json"
				onChange={handleImport}
				style={{ display: "none" }}
			/>
			{importError && (
				<div className="field-value-text" style={{ color: "var(--magenta)", fontSize: 10, marginTop: 2 }}>
					{importError}
				</div>
			)}
		</div>
	);
}
