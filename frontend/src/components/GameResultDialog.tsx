import type { SimulationStats } from "../types";

interface ScoreRow {
		label: string;
		userVal: number | string;
		autoVal: number | string;
	}

interface SubscoreDef {
		key: string;
		label: string;
		max: number;
	}

const SUBSCORES: SubscoreDef[] = [
		{ key: "path_efficiency", label: "Path Efficiency", max: 150 },
		{ key: "energy_economy", label: "Energy Economy", max: 300 },
		{ key: "illumination", label: "Illumination", max: 350 },
		{ key: "meteor_safety", label: "Meteor Safety", max: 50 },
		{ key: "rover_traction_match", label: "Traction Match", max: 100 },
		{ key: "rover_power_match", label: "Power Match", max: 50 },
	];

interface Props {
		round: number;
		totalRounds: number;
		siteName: string;
		userScore: number;
		autoScore: number;
		userStats: SimulationStats | null;
		autoStats: SimulationStats | null;
		userGrade: string;
		autoGrade: string;
		onNext: () => void;
		onClose: () => void;
		isLast: boolean;
	}

export default function GameResultDialog({
		round, totalRounds, siteName,
		userScore, autoScore, userStats, autoStats,
		userGrade, autoGrade,
		onNext, onClose, isLast,
	}: Props) {
	const userWon = userScore > autoScore;
	const isTie = userScore === autoScore;

	const rows: ScoreRow[] = [
		{ label: "Score", userVal: `${Math.round(userScore)} (${userGrade})`, autoVal: `${Math.round(autoScore)} (${autoGrade})` },
		{ label: "Distance", userVal: formatStat(userStats, "total_distance_travelled"), autoVal: formatStat(autoStats, "total_distance_travelled") },
		{ label: "Time", userVal: formatTime(userStats), autoVal: formatTime(autoStats) },
		{ label: "Feasible", userVal: formatFeasible(userStats), autoVal: formatFeasible(autoStats) },
	];

	return (
		<div className="dialog-overlay">
			<div className="dialog">
				<h2 className="dialog-title">Round {round} of {totalRounds} — {siteName}</h2>
				<div className={`dialog-result ${isTie ? "tie" : userWon ? "user-win" : "auto-win"}`}>
					{isTie ? "Tie!" : userWon ? "You win!" : "Autodesigner wins!"}
				</div>
				<table className="dialog-score-table">
					<thead>
						<tr>
							<th></th>
							<th>Your Path</th>
							<th>Autodesigner</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.label}>
								<td className="dialog-label">{r.label}</td>
								<td className="dialog-val">{r.userVal}</td>
								<td className="dialog-val">{r.autoVal}</td>
							</tr>
						))}
					</tbody>
				</table>

				<table className="dialog-score-table">
					<thead>
						<tr>
							<th>Subscore</th>
							<th>Your Path</th>
							<th>Autodesigner</th>
						</tr>
					</thead>
					<tbody>
						{SUBSCORES.map((s) => (
							<tr key={s.key}>
								<td className="dialog-label">{s.label}</td>
								<td className="dialog-val">{formatSubscore(userStats, s)}</td>
								<td className="dialog-val">{formatSubscore(autoStats, s)}</td>
							</tr>
						))}
					</tbody>
				</table>
				<div className="dialog-buttons">
					<button className="dialog-button" onClick={onClose}>
						View Map
					</button>
					<button className="dialog-button" onClick={onNext}>
						{isLast ? "Finish Game" : "Next Round"}
					</button>
				</div>
			</div>
		</div>
	);
}

function formatStat(stats: SimulationStats | null, key: string): string {
	const v = stats?.[key];
	if (v == null || typeof v !== "number" || !isFinite(v)) return "-";
	return v.toFixed(1) + " m";
}

function formatTime(stats: SimulationStats | null): string {
	const v = stats?.["traversal_time_s"];
	if (v == null || typeof v !== "number" || !isFinite(v) || v <= 0) return "-";
	if (v >= 86400) return (v / 86400).toFixed(1) + " days";
	if (v >= 3600) return (v / 3600).toFixed(1) + " hr";
	if (v >= 60) return (v / 60).toFixed(1) + " min";
	return v.toFixed(1) + " s";
}

function formatFeasible(stats: SimulationStats | null): string {
		const v = stats?.["traverse_feasible"];
		if (v == null || typeof v !== "number") return "-";
		return v >= 0.5 ? "Yes" : "No";
	}

function formatSubscore(stats: SimulationStats | null, def: SubscoreDef): string {
		const subs = stats?.["traversal_subscores"];
		if (!subs || typeof subs !== "object") return "-";
		const val = (subs as Record<string, number>)[def.key];
		if (val == null || typeof val !== "number") return "-";
		return `${Math.round(val)}/${def.max}`;
	}
