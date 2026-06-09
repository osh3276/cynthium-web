import { useState } from "react";
import type { SimulationStats, TraversalSubscores } from "../types";
import {
	SCORE_MAX_PATH_EFFICIENCY,
	SCORE_MAX_ENERGY_ECONOMY,
	SCORE_MAX_ILLUMINATION,
	SCORE_MAX_METEOR_SAFETY,
	SCORE_MAX_TRACTION_MATCH,
	SCORE_MAX_POWER_MATCH,
} from "../constants";

interface FieldDef {
	label: string;
	key: string;
	fmt: string;
}

interface Props {
	manualStats: SimulationStats | null;
	autoStats: SimulationStats | null;
	onSimulate: () => void;
	simulating: boolean;
}

const GRADE_COLORS: Record<string, string> = {
	S: "#ffd700",
	A: "#4fc3f7",
	B: "#81c784",
	C: "#ffb74d",
	D: "#e53935",
	F: "#b71c1c",
};

const SUBSCORE_LABELS: Record<keyof TraversalSubscores, string> = {
	path_efficiency: "Path Efficiency",
	energy_economy: "Energy Economy",
	illumination: "Illumination",
	meteor_safety: "Meteor Safety",
	rover_traction_match: "Traction Match",
	rover_power_match: "Power Match",
};

const SUBSCORE_MAX: Record<keyof TraversalSubscores, number> = {
	path_efficiency: SCORE_MAX_PATH_EFFICIENCY,
	energy_economy: SCORE_MAX_ENERGY_ECONOMY,
	illumination: SCORE_MAX_ILLUMINATION,
	meteor_safety: SCORE_MAX_METEOR_SAFETY,
	rover_traction_match: SCORE_MAX_TRACTION_MATCH,
	rover_power_match: SCORE_MAX_POWER_MATCH,
};

const PATH_FIELDS: FieldDef[] = [
	{ label: "Total distance", key: "total_distance_travelled", fmt: "{:.2f} m" },
	{ label: "Total displacement", key: "total_displacement", fmt: "{:.2f} m" },
	{ label: "Total elevation gain", key: "total_elevation_gain", fmt: "{:.2f} m" },
	{ label: "Net elevation change", key: "net_elevation_change", fmt: "{:.2f} m" },
	{ label: "Avg resolution", key: "average_resolution", fmt: "{:.2f} m/px" },
];

const SLOPE_FIELDS: FieldDef[] = [
	{ label: "Traversal avg slope", key: "average_slope", fmt: "{:.2f}°" },
	{ label: "Traversal max slope", key: "max_slope", fmt: "{:.2f}°" },
	{ label: "Traversal min slope", key: "min_slope", fmt: "{:.2f}°" },
	{ label: "Surface avg slope", key: "surface_average_slope", fmt: "{:.2f}°" },
	{ label: "Surface max slope", key: "surface_max_slope", fmt: "{:.2f}°" },
	{ label: "Surface min slope", key: "surface_min_slope", fmt: "{:.2f}°" },
];

const ENV_FIELDS: FieldDef[] = [
	{ label: "Max temperature (avg)", key: "max_temperature", fmt: "{:.2f} K" },
	{ label: "Min temperature (avg)", key: "min_temperature", fmt: "{:.2f} K" },
	{ label: "Avg temperature (avg)", key: "average_temperature", fmt: "{:.2f} K" },
	{ label: "Illumination (yearly avg)", key: "percent_illumination", fmt: "{:.2f}%" },
	{ label: "Avg solar illum (time-weighted)", key: "avg_solar_illumination_w_per_m2", fmt: "{:.2f} W/m²" },
	{ label: "Solar energy (per m²)", key: "solar_energy_per_m2_j", fmt: "{:.2f} J/m²" },
	{ label: "Meteor flux (avg)", key: "average_meteor_flux", fmt: "{:.2f} J/yr·m²" },
	{ label: "Meteor flux (max)", key: "max_meteor_flux", fmt: "{:.2f} J/yr·m²" },
	{ label: "Meteor flux (min)", key: "min_meteor_flux", fmt: "{:.2f} J/yr·m²" },
];

const ROVER_FIELDS: FieldDef[] = [
	{ label: "Average velocity", key: "average_velocity_mps", fmt: "{:.2f} m/s" },
	{ label: "Min velocity", key: "min_velocity_mps", fmt: "{:.2f} m/s" },
	{ label: "Max velocity", key: "max_velocity_mps", fmt: "{:.2f} m/s" },
	{ label: "Traversal time", key: "traversal_time_s", fmt: "{}" },
	{ label: "Max climbable slope", key: "max_climbable_slope_deg", fmt: "{:.2f}°" },
	{ label: "Rover mass", key: "rover_mass_kg", fmt: "{:.2f} kg" },
	{ label: "Rover power", key: "rover_power_hp", fmt: "{:.3f} hp" },
	{ label: "Wheel friction coeff", key: "rover_mu", fmt: "{:.3f}" },
	{ label: "Rolling resistance (Crr)", key: "rover_crr", fmt: "{:.3f}" },
	{ label: "Traverse feasible", key: "traverse_feasible", fmt: "{}" },
	{ label: "Required wheel friction (μ) (dynamic)", key: "required_wheel_friction_coeff", fmt: "{:.3f}" },
	{ label: "Equivalent traction angle", key: "required_climb_slope_deg", fmt: "{:.2f}°" },
];

const INNER_TABS = ["Path", "Slope", "Environment", "Rover"] as const;
const FIELD_GROUPS = [PATH_FIELDS, SLOPE_FIELDS, ENV_FIELDS, ROVER_FIELDS];

function asNum(v: string | number): number {
	return typeof v === "number" ? v : parseFloat(v);
}

function formatValue(val: string | number, fmt: string): string {
	const n = asNum(val);
	if (!isFinite(n)) return "N/A";
	if (n > 1e100) return "N/A";
	if (n < -1e100) return "N/A";
	return n.toFixed(fmt.includes(".3f") ? 3 : 2);
}

function formatTraversalTime(val: string | number): string {
	const n = asNum(val);
	if (!isFinite(n) || n <= 0) return "-";
	if (n > 1e100) return "N/A";
	if (n >= 86400) return (n / 86400).toFixed(2) + " days";
	if (n >= 3600) return (n / 3600).toFixed(2) + " hr";
	if (n >= 60) return (n / 60).toFixed(2) + " min";
	return n.toFixed(2) + " s";
}

function ScoreCard({ stats }: { stats: SimulationStats | null }) {
	const score = stats?.["traversal_score"] as number | undefined;
	const grade = stats?.["traversal_grade"] as string | undefined;
	const subscores = stats?.["traversal_subscores"] as TraversalSubscores | undefined;

	if (score == null || grade == null || !subscores) return null;

	const color = GRADE_COLORS[grade] ?? "#888";
	const barW = (v: number, max: number) => Math.min(100, (v / max) * 100);

	return (
		<div className="score-card">
			<div className="score-main">
				<span className="score-grade" style={{ color }}>
					{grade}
				</span>
				<span className="score-total">
					{Math.round(score)}<span className="score-denom">/1000</span>
				</span>
			</div>
			<div className="score-bar-total">
				<div className="score-bar-fill" style={{ width: `${barW(score, 1000)}%`, background: color }} />
			</div>
			<div className="score-subscores">
				{(Object.keys(SUBSCORE_LABELS) as (keyof TraversalSubscores)[]).map((key) => {
					const v = subscores[key];
					const max = SUBSCORE_MAX[key];
					const label = SUBSCORE_LABELS[key];
					return (
						<div key={key} className="subscore-row">
							<span className="subscore-label">{label}</span>
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

function FieldsTable({ fields, stats }: { fields: FieldDef[]; stats: SimulationStats | null }) {
	return (
		<table className="fields-table">
			<tbody>
				{fields.map((f) => {
					const raw = stats?.[f.key] as string | number | undefined;
					const val = asNum(raw ?? 0);
					let display = "-";
					if (raw != null && isFinite(val)) {
						if (f.key === "traverse_feasible") {
							display = val >= 0.5 ? "Yes" : "No";
						} else if (f.key === "traversal_time_s") {
							display = formatTraversalTime(val);
						} else {
							display = formatValue(val, f.fmt);
						}
					}
					const feasibleClass =
						f.key === "traverse_feasible" && raw != null
							? val >= 0.5 ? " val-ok" : " val-bad"
							: "";
					return (
						<tr key={f.key}>
							<td className="field-label">{f.label}</td>
							<td className={"field-value" + feasibleClass}>{display}</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function StatsTab({ stats }: { stats: SimulationStats | null }) {
	const [activeTab, setActiveTab] = useState(0);
	return (
		<div className="stats-tab-inner">
			<div className="inner-tabs">
				{INNER_TABS.map((name, i) => (
					<button
						key={name}
						className={`inner-tab ${i === activeTab ? "inner-tab-active" : ""}`}
						onClick={() => setActiveTab(i)}
					>
						{name}
					</button>
				))}
			</div>
			<div className="inner-tab-content">
				<FieldsTable fields={FIELD_GROUPS[activeTab]} stats={stats} />
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
	const statusText = simulating
		? "Simulating..."
		: hasAny
			? "Simulation complete"
			: "No simulation run yet";

	return (
		<div className="simulation-results">
			<div className="results-header">
				<span className="results-title">Simulation Results</span>
				<button
					className="panel-button panel-button-sm"
					onClick={onSimulate}
					disabled={simulating}
					style={{ marginLeft: "auto" }}
				>
					{simulating ? "Running..." : "Simulate"}
				</button>
			</div>
			<div className="results-status">{statusText}</div>
			<div className="results-scroll">
				<ScoreCard stats={activeStats} />
				<div className="outer-tabs">
				<button
					className={`outer-tab ${outerTab === 0 ? "outer-tab-active" : ""}`}
					onClick={() => setOuterTab(0)}
				>
					Manual Path
				</button>
				<button
					className={`outer-tab ${outerTab === 1 ? "outer-tab-active" : ""}`}
					onClick={() => setOuterTab(1)}
				>
					Auto Path
				</button>
			</div>
			<div className="outer-tab-content">
				<StatsTab stats={activeStats} />
			</div>
		</div>
	</div>
);
}
