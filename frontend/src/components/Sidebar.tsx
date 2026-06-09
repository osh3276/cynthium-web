import { useState, useCallback } from "react";
import MapSelectionPanel from "./MapSelectionPanel";
import PlanningPanel from "./PlanningPanel";
import RoverSettingsPanel from "./RoverSettingsPanel";
import type { LoadStatus } from "../App";
import type { Waypoint, AutodesignResult, AutodesignConfig, RoverSettings } from "../types";

interface Props {
	onLoadSite: (siteName: string, mapType: string, date: string) => void;
	status: LoadStatus;
	waypoints: Waypoint[];
	onAddWaypoint: (wp: Waypoint) => void;
	onRemoveWaypoint: (index: number) => void;
	onAutodesign: (config: AutodesignConfig) => void;
	autodesignRunning: boolean;
	autodesignResult: AutodesignResult | null;
	roverSettings: RoverSettings;
	onRoverChange: (settings: RoverSettings) => void;
}

export default function Sidebar({
	onLoadSite, status, waypoints, onAddWaypoint,
	onRemoveWaypoint, onAutodesign, autodesignRunning, autodesignResult,
	roverSettings, onRoverChange,
}: Props) {
	const [slopeWeight, setSlopeWeight] = useState("1.0");
	const [sunWeight, setSunWeight] = useState("0.5");
	const [meteorWeight, setMeteorWeight] = useState("0.5");
	const [pathMode, setPathMode] = useState<"segment" | "direct">("direct");

	const handleRun = useCallback(() => {
		const sw = parseFloat(slopeWeight);
		const suw = parseFloat(sunWeight);
		const mw = parseFloat(meteorWeight);
		if (isNaN(sw) || isNaN(suw) || isNaN(mw)) return;
		onAutodesign({ slope_weight: sw, sun_weight: suw, meteor_weight: mw, path_mode: pathMode, rover_friction_coeff: roverSettings.wheel_friction_coeff });
	}, [slopeWeight, sunWeight, meteorWeight, pathMode, roverSettings, onAutodesign]);

	const autodesignLines = autodesignResult
		? autodesignResult.path_xy
			.map((p, i) => `(${i + 1}). (${p[0].toFixed(2)}, ${p[1].toFixed(2)})m`)
			.join("\n")
		: "";

	return (
		<aside className="sidebar">
			<div className="sidebar-scroll">
				<MapSelectionPanel onLoadSite={onLoadSite} status={status} defaultDate="2026-05-13" />
				<div className="sidebar-divider" />
				<PlanningPanel
					waypoints={waypoints}
					onAddWaypoint={onAddWaypoint}
					onRemoveWaypoint={onRemoveWaypoint}
				/>
				<div className="sidebar-divider" />
				<RoverSettingsPanel
					settings={roverSettings}
					onChange={onRoverChange}
				/>
				<div className="sidebar-divider" />
				<div className="panel">
					<h3 className="panel-title">Autodesign</h3>
					<div className="field-row" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
						Path optimized for current rover (μ={roverSettings.wheel_friction_coeff} → max climb {Math.round(Math.atan(roverSettings.wheel_friction_coeff) * 180 / Math.PI)}°)
					</div>
					<div className="field-row">
						<label className="field-label">Slope weight:</label>
						<input className="field-input field-input-narrow" type="text" value={slopeWeight} onChange={(e) => setSlopeWeight(e.target.value)} />
					</div>
					<div className="field-row">
						<label className="field-label">Sun weight:</label>
						<input className="field-input field-input-narrow" type="text" value={sunWeight} onChange={(e) => setSunWeight(e.target.value)} />
					</div>
					<div className="field-row">
						<label className="field-label">Meteor weight:</label>
						<input className="field-input field-input-narrow" type="text" value={meteorWeight} onChange={(e) => setMeteorWeight(e.target.value)} />
					</div>

					<div className="field-row">
						<button
							className={`panel-button panel-button-sm ${pathMode === "segment" ? "btn-active" : ""}`}
							onClick={() => setPathMode("segment")}
						>
							Per-segment
						</button>
						<button
							className={`panel-button panel-button-sm ${pathMode === "direct" ? "btn-active" : ""}`}
							onClick={() => setPathMode("direct")}
						>
							Direct
						</button>
						<button
							className="panel-button panel-button-sm"
							onClick={handleRun}
							disabled={autodesignRunning || waypoints.length < 2}
						>
							{autodesignRunning ? "Running..." : "Run"}
						</button>
					</div>

					<label className="field-label">Autodesign path:</label>
					<textarea
						className="field-textarea"
						readOnly
						value={autodesignLines}
						placeholder="(autodesign output will appear here)"
					/>
				</div>
			</div>
		</aside>
	);
}
