import { useCallback, useRef, useState } from "react";
import type { Waypoint, AutopathResult, AutopathConfig } from "../types";

interface Props {
	waypoints: Waypoint[];
	onAddWaypoint: (wp: Waypoint) => void;
	onRemoveWaypoint: (index: number) => void;
	onAutopath: (config: AutopathConfig) => void;
	autopathRunning: boolean;
	autopathResult: AutopathResult | null;
}

export default function PlanningPanel({
	waypoints, onAddWaypoint, onRemoveWaypoint,
	onAutopath, autopathRunning, autopathResult,
}: Props) {
	const coordRef = useRef<HTMLInputElement>(null);
	const deleteIdxRef = useRef<HTMLInputElement>(null);
	const [minSlope, setMinSlope] = useState("0");
	const [maxSlope, setMaxSlope] = useState("20");
	const [slopeWeight, setSlopeWeight] = useState("1.0");
	const [sunWeight, setSunWeight] = useState("0.5");

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

	const handleAutopath = useCallback(() => {
		const ms = parseFloat(minSlope);
		const xs = parseFloat(maxSlope);
		const sw = parseFloat(slopeWeight);
		const suw = parseFloat(sunWeight);
		if (isNaN(ms) || isNaN(xs) || isNaN(sw) || isNaN(suw)) return;
		onAutopath({ min_slope_deg: ms, max_slope_deg: xs, slope_weight: sw, sun_weight: suw });
	}, [minSlope, maxSlope, slopeWeight, sunWeight, onAutopath]);

	const waypointLines = waypoints
		.map((wp, i) => `(${i + 1}). (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})m`)
		.join("\n");

	const autopathLines = autopathResult
		? autopathResult.path_xy
			.map((p, i) => `(${i + 1}). (${p[0].toFixed(2)}, ${p[1].toFixed(2)})m`)
			.join("\n")
		: "";

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

			<button
				className="panel-button"
				onClick={handleAutopath}
				disabled={autopathRunning || waypoints.length < 2}
			>
				{autopathRunning ? "Running..." : "Autopath"}
			</button>

			<label className="field-label">Autopath waypoints:</label>
			<textarea
				className="field-textarea"
				readOnly
				value={autopathLines}
				placeholder="(autopath output will appear here)"
			/>

			<div className="field-row">
				<label className="field-label">Min slope (deg):</label>
				<input className="field-input field-input-narrow" type="text" value={minSlope} onChange={(e) => setMinSlope(e.target.value)} />
			</div>
			<div className="field-row">
				<label className="field-label">Max slope (deg):</label>
				<input className="field-input field-input-narrow" type="text" value={maxSlope} onChange={(e) => setMaxSlope(e.target.value)} />
			</div>
			<div className="field-row">
				<label className="field-label">Slope weight:</label>
				<input className="field-input field-input-narrow" type="text" value={slopeWeight} onChange={(e) => setSlopeWeight(e.target.value)} />
			</div>
			<div className="field-row">
				<label className="field-label">Sun weight:</label>
				<input className="field-input field-input-narrow" type="text" value={sunWeight} onChange={(e) => setSunWeight(e.target.value)} />
			</div>
		</div>
	);
}
