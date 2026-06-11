import { useState, useCallback } from "react";
import MapSelectionPanel from "./MapSelectionPanel";
import PlanningPanel from "./PlanningPanel";
import RoverSettingsPanel from "./RoverSettingsPanel";
import type { LoadStatus } from "../App";
import type { Waypoint, AutodesignResult, AutodesignConfig, RoverSettings, GameState } from "../types";

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
	gameState?: GameState | null;
	gameStartPoint?: Waypoint | null;
	gameEndPoint?: Waypoint | null;
	onFinishPath?: () => void;
	simulating?: boolean;
}

export default function Sidebar({
	onLoadSite, status, waypoints, onAddWaypoint,
	onRemoveWaypoint, onAutodesign, autodesignRunning, autodesignResult,
	roverSettings, onRoverChange,
	gameState, gameStartPoint, gameEndPoint, onFinishPath, simulating,
}: Props) {
	const [slopeWeight, setSlopeWeight] = useState("0.3");
	const [sunWeight, setSunWeight] = useState("0.3");
	const [meteorWeight, setMeteorWeight] = useState("0.05");
	const [pathMode, setPathMode] = useState<"segment" | "direct">("direct");

	const handleRun = useCallback(() => {
		const sw = parseFloat(slopeWeight);
		const suw = parseFloat(sunWeight);
		const mw = parseFloat(meteorWeight);
		if (isNaN(sw) || isNaN(suw) || isNaN(mw)) return;
		onAutodesign({ slope_weight: sw, sun_weight: suw, meteor_weight: mw, path_mode: pathMode, rover_mass_kg: roverSettings.mass_kg, rover_power_hp: roverSettings.power_hp, rover_friction_coeff: roverSettings.wheel_friction_coeff, rover_crr: roverSettings.rolling_resistance_coeff });
	}, [slopeWeight, sunWeight, meteorWeight, pathMode, roverSettings, onAutodesign]);

	const autodesignLines = autodesignResult
		? autodesignResult.path_xy
			.map((p, i) => `(${i + 1}). (${p[0].toFixed(2)}, ${p[1].toFixed(2)})m`)
			.join("\n")
		: "";

	return (
		<aside className="sidebar">
			<div className="sidebar-scroll">
				<MapSelectionPanel onLoadSite={onLoadSite} status={status} defaultDate="2026-05-13" readOnly={!!gameState?.active} />
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
					readOnly={!!gameState?.active}
				/>
				{gameState?.active ? (
					<>
						<div className="sidebar-divider" />
						<div className="panel">
							<h3 className="panel-title">Game — Round {gameState.currentRound + 1} of {gameState.rounds.length}</h3>
							<div className="field-row" style={{ fontSize: 11, color: "var(--text-dim)", flexWrap: "wrap" }}>
								<span>{gameState.rounds[gameState.currentRound]?.siteName}</span>
							</div>
							<div className="field-row" style={{ fontSize: 11, color: "var(--text-dim)", flexWrap: "wrap" }}>
								<span>Start: ({gameStartPoint?.x.toFixed(1)}, {gameStartPoint?.y.toFixed(1)})</span>
								<br />
								<span>End: ({gameEndPoint?.x.toFixed(1)}, {gameEndPoint?.y.toFixed(1)})</span>
							</div>
							<div className="field-row" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
								<span>Waypoints placed: {waypoints.length}</span>
							</div>
							<button
								className="panel-button generate-button"
								onClick={onFinishPath}
								disabled={waypoints.length < 2 || simulating}
								style={{ marginTop: 4 }}
							>
								{simulating ? "Scoring..." : "Finish Path"}
							</button>
						</div>
					</>
				) : (
					<>
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
					</>
				)}
			</div>
		</aside>
	);
}
