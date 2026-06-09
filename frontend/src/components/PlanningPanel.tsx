import { useCallback, useRef } from "react";
import type { Waypoint } from "../types";

interface Props {
	waypoints: Waypoint[];
	onAddWaypoint: (wp: Waypoint) => void;
	onRemoveWaypoint: (index: number) => void;
}

export default function PlanningPanel({ waypoints, onAddWaypoint, onRemoveWaypoint }: Props) {
	const coordRef = useRef<HTMLInputElement>(null);
	const deleteIdxRef = useRef<HTMLInputElement>(null);

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

	const handleDelete = useCallback(() => {
		const val = deleteIdxRef.current?.value.trim();
		if (!val) return;
		const idx = parseInt(val, 10) - 1;
		if (isNaN(idx) || idx < 0 || idx >= waypoints.length) return;
		onRemoveWaypoint(idx);
		if (deleteIdxRef.current) deleteIdxRef.current.value = "";
	}, [waypoints.length, onRemoveWaypoint]);

	const waypointLines = waypoints
		.map((wp, i) => `(${i + 1}). (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})m`)
		.join("\n");

	return (
		<div className="panel">
			<h3 className="panel-title">Planning</h3>

			<label className="field-label">Coordinate:</label>
			<input ref={coordRef} className="field-input" type="text" placeholder="x,y" />

			<button className="panel-button" onClick={handleAddCoord}>
				Add waypoint
			</button>

			<label className="field-label">Waypoints:</label>
			<textarea className="field-textarea" readOnly value={waypointLines} placeholder="" />

			<div className="field-row">
				<label className="field-label">Delete waypoint:</label>
				<input ref={deleteIdxRef} className="field-input field-input-narrow" type="text" placeholder="Num" />
				<button className="panel-button panel-button-sm" onClick={handleDelete}>Delete</button>
			</div>
		</div>
	);
}
