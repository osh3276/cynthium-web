import { useState } from "react";

interface FieldDef {
	label: string;
	key: string;
	fmt: string;
}

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

function FieldsTable({ fields }: { fields: FieldDef[] }) {
	return (
		<table className="fields-table">
			<tbody>
				{fields.map((f) => (
					<tr key={f.key}>
						<td className="field-label">{f.label}</td>
						<td className="field-value">-</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function StatsTab() {
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
				<FieldsTable fields={FIELD_GROUPS[activeTab]} />
			</div>
		</div>
	);
}

export default function SimulationResultsPanel() {
	const [outerTab, setOuterTab] = useState(0);

	return (
		<div className="simulation-results">
			<div className="results-header">
				<span className="results-title">Simulation Results</span>
			</div>
			<div className="results-status">No simulation run yet</div>
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
				<StatsTab />
			</div>
		</div>
	);
}
