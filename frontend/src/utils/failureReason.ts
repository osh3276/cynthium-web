import type { SimulationStats } from "../types";

function toFiniteNumber(v: unknown): number | null {
	if (typeof v !== "number" || !isFinite(v)) return null;
	return v;
}

export function getFailureReason(stats: SimulationStats | null): string | null {
	if (!stats) return null;
	const feasible = toFiniteNumber(stats["traverse_feasible"]);
	if (feasible != null && feasible >= 0.5) return null;

	if (typeof stats.failure_reason === "string" && stats.failure_reason.trim()) {
		return stats.failure_reason;
	}

	const requiredMu = toFiniteNumber(stats["required_wheel_friction_coeff"]);
	const roverMu = toFiniteNumber(stats["rover_mu"]);
	if (requiredMu != null && roverMu != null && requiredMu > roverMu + 1e-3) {
		return `Insufficient traction for slope: requires wheel friction μ >= ${requiredMu.toFixed(2)}, current μ = ${roverMu.toFixed(2)}.`;
	}

	const requiredClimb = toFiniteNumber(stats["required_climb_slope_deg"]);
	const maxClimb = toFiniteNumber(stats["max_climbable_slope_deg"]);
	if (
		requiredClimb != null &&
		maxClimb != null &&
		requiredClimb > maxClimb + 0.1
	) {
		return `Slope too steep for current traction: needs ${requiredClimb.toFixed(1)}°, rover supports up to ${maxClimb.toFixed(1)}°.`;
	}

	return "Route is dynamically infeasible for the current rover settings.";
}
