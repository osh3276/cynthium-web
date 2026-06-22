import { useState } from "react";
import type { SimulationStats } from "../types";
import { SCORE_MAX_PATH_EFFICIENCY, SCORE_MAX_ENERGY_ECONOMY, SCORE_MAX_ILLUMINATION, SCORE_MAX_METEOR_SAFETY, SCORE_MAX_TRACTION_MATCH, SCORE_MAX_POWER_MATCH } from "../constants";

interface Props {
	manualStats: SimulationStats | null;
	autoStats: SimulationStats | null;
	onSimulate: () => void;
	simulating: boolean;
}

const GRADE_COLORS: Record<string, string> = {
	S: "#ffd700", A: "#4fc3f7", B: "#81c784", C: "#ffb74d", D: "#e53935", F: "#b71c1c",
};

const SUBSCORE_MAX: Record<string, number> = {
	path_efficiency: SCORE_MAX_PATH_EFFICIENCY, energy_economy: SCORE_MAX_ENERGY_ECONOMY,
	illumination: SCORE_MAX_ILLUMINATION, meteor_safety: SCORE_MAX_METEOR_SAFETY,
	rover_traction_match: SCORE_MAX_TRACTION_MATCH, rover_power_match: SCORE_MAX_POWER_MATCH,
};

const SUBSCORE_LABELS: Record<string, string> = {
	path_efficiency: "Path Efficiency", energy_economy: "Energy Economy",
	illumination: "Illumination", meteor_safety: "Meteor Safety",
	rover_traction_match: "Traction Match", rover_power_match: "Power Match",
};

function ScoreCard({ stats }: { stats: SimulationStats | null }) {
	const score = stats?.["traversal_score"] as number | undefined;
	const grade = stats?.["traversal_grade"] as string | undefined;
	const subscores = stats?.["traversal_subscores"] as Record<string, number> | undefined;
	if (score == null || grade == null || !subscores) return null;
	const color = GRADE_COLORS[grade] ?? "#888";
	const barW = (v: number, max: number) => Math.min(100, (v / max) * 100);
	return (
		<div className="score-card">
			<div className="score-main">
				<span className="score-grade" style={{ color }}>{grade}</span>
				<span className="score-total">{Math.round(score)}<span className="score-denom">/1000</span></span>
			</div>
			<div className="score-bar-total">
				<div className="score-bar-fill" style={{ width: `${barW(score, 1000)}%`, background: color }} />
			</div>
			<div className="score-subscores">
				{(Object.keys(SUBSCORE_LABELS) as (keyof typeof SUBSCORE_LABELS)[]).map((key) => {
					const v = subscores[key] ?? 0;
					const max = SUBSCORE_MAX[key];
					return (
						<div key={key} className="subscore-row">
							<span className="subscore-label">{SUBSCORE_LABELS[key]}</span>
							<div className="subscore-bar">
								<div className="subscore-fill" style={{ width: `${barW(v, max)}%` }} />
							</div>
							<span className="subscore-val">{Math.round(v)}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export default function SimulationResultsPanel({
	manualStats, autoStats, onSimulate, simulating,
}: Props) {
	const [outerTab, setOuterTab] = useState(0);
	const activeStats = outerTab === 0 ? manualStats : autoStats;
	const hasAny = manualStats != null || autoStats != null;
	const statusText = simulating ? "Simulating..." : hasAny ? "Simulation complete" : "No simulation run yet";

	return (
		<div className="simulation-results">
			<div className="results-header">
				<span className="results-title">Score</span>
				<button className="panel-button panel-button-sm" onClick={onSimulate} disabled={simulating} style={{ marginLeft: "auto" }}>
					{simulating ? "Running..." : "Simulate"}
				</button>
			</div>
			<div className="results-status">{statusText}</div>
			<div className="results-scroll">
				{(manualStats != null || autoStats != null) && (
					<div className="outer-tabs">
						<button className={`outer-tab ${outerTab === 0 ? "outer-tab-active" : ""}`} onClick={() => setOuterTab(0)}>Manual</button>
						<button className={`outer-tab ${outerTab === 1 ? "outer-tab-active" : ""}`} onClick={() => setOuterTab(1)}>Auto</button>
					</div>
				)}
				<ScoreCard stats={activeStats} />
			</div>
		</div>
	);
}
