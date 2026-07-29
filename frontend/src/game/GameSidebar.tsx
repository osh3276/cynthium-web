import type { Waypoint, GameState } from "../types";
import { ARTEMIS_SR } from "./roverPresets";
import PlanningPanel from "../components/PlanningPanel";

	interface Props {
	gameState: GameState;
	gameWaypoints: Waypoint[];
	waypoints: Waypoint[];
	onFinishPath: () => void;
	onNextRound: () => void;
	onRemoveWaypoint: (index: number) => void;
	onUpdateWaypoint: (index: number, wp: Waypoint) => void;
	onMoveWaypoint: (fromIndex: number, toIndex: number) => void;
	onClearWaypoints: () => void;
	onAddWaypoint: (wp: Waypoint) => void;
	simulating: boolean;
}

export default function GameSidebar({
	gameState,
	gameWaypoints,
	waypoints,
	onFinishPath,
	onNextRound,
	onRemoveWaypoint,
	onUpdateWaypoint,
	onMoveWaypoint,
	onClearWaypoints,
	onAddWaypoint,
	simulating,
}: Props) {
	return (
		<aside className="sidebar">
			<div className="sidebar-scroll">
				<div className="panel">
					<h3 className="panel-title">
						Game — Round {gameState.currentRound + 1} of{" "}
						{gameState.rounds.length}
					</h3>
					<div
						className="field-row"
						style={{
							fontSize: 11,
							color: "var(--text-dim)",
							flexWrap: "wrap",
						}}
					>
						<span>
							{
								gameState.rounds[gameState.currentRound]
									?.siteName
							}
						</span>
					</div>
					<div
						className="field-row"
						style={{
							fontSize: 11,
							color: "var(--text-dim)",
							flexWrap: "wrap",
						}}
					>
						<span>
							Waypoints: {gameWaypoints.length} markers
						</span>
						<br />
						{gameWaypoints.map((wp, i) => (
							<span key={i} style={{ display: "block", fontSize: 10 }}>
								{i + 1}: ({wp.x.toFixed(1)}, {wp.y.toFixed(1)})
							</span>
						))}
					</div>
				</div>
				<div className="sidebar-divider" />
				<div className="panel">
					<h3 className="panel-title" style={{ fontSize: 11 }}>
						Rover: Artemis SR
					</h3>
					<div
						className="field-row"
						style={{
							fontSize: 11,
							color: "var(--text-dim)",
							flexWrap: "wrap",
							gap: 2,
						}}
					>
						<span>Mass: {ARTEMIS_SR.mass_kg} kg</span>
						<span style={{ marginLeft: 8 }}>
							Power: {ARTEMIS_SR.power_hp} hp
						</span>
					</div>
					<div
						className="field-row"
						style={{
							fontSize: 11,
							color: "var(--text-dim)",
							flexWrap: "wrap",
							gap: 2,
						}}
					>
						<span>μ = {ARTEMIS_SR.wheel_friction_coeff}</span>
						<span style={{ marginLeft: 8 }}>
							CRR = {ARTEMIS_SR.rolling_resistance_coeff}
						</span>
					</div>
				</div>
				<div className="sidebar-divider" />
				<PlanningPanel
					waypoints={waypoints}
					onAddWaypoint={onAddWaypoint}
					onRemoveWaypoint={onRemoveWaypoint}
					onUpdateWaypoint={onUpdateWaypoint}
					onMoveWaypoint={onMoveWaypoint}
					onClearWaypoints={onClearWaypoints}
				/>
				<div className="sidebar-divider" />
				<div className="panel">
					{gameState.rounds[gameState.currentRound]
						?.userStats ? (
						<button
							className="panel-button generate-button"
							onClick={onNextRound}
							style={{ marginTop: 4 }}
						>
							Next Round
						</button>
					) : (
						<button
							className="panel-button generate-button"
							onClick={onFinishPath}
							disabled={
								waypoints.length < 2 || simulating
							}
							style={{ marginTop: 4 }}
						>
							{simulating ? "Scoring..." : "Finish Path"}
						</button>
					)}
				</div>
			</div>
		</aside>
	);
}
