import type { AutodesignResult, GameRound, GameDefinition, GameData, SimulationStats, Waypoint } from "../types";
import { ARTEMIS_SR } from "./roverPresets";

/** Fetch list of available game definitions from the backend. */
export async function fetchGamesList(): Promise<GameDefinition[]> {
	try {
		const res = await fetch("/api/sites/games");
		if (!res.ok) return [];
		const data = await res.json();
		return data.games || [];
	} catch {
		return [];
	}
}

/** Fetch a specific game data file from the backend. */
export async function fetchGameData(filename: string): Promise<GameData | null> {
	try {
		const res = await fetch(`/api/sites/games/${encodeURIComponent(filename)}`);
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

/** Build request body for the game's autodesign calls */
export function autoBody(waypoints_xy: number[][]): string {
	return JSON.stringify({
		waypoints_xy,
		slope_weight: 0.3,
		sun_weight: 0.3,
		meteor_weight: 0.05,
		path_mode: waypoints_xy.length > 2 ? "segment" : "direct",
		rover_mass_kg: ARTEMIS_SR.mass_kg,
		rover_power_hp: ARTEMIS_SR.power_hp,
		rover_friction_coeff: ARTEMIS_SR.wheel_friction_coeff,
		rover_crr: ARTEMIS_SR.rolling_resistance_coeff,
		rover_battery_capacity_wh: ARTEMIS_SR.battery_capacity_wh,
		rover_idle_drain_w: ARTEMIS_SR.idle_drain_w,
		rover_target_cruise_speed_mps: ARTEMIS_SR.target_cruise_speed_mps,
		rover_max_brake_decel_mps2: ARTEMIS_SR.max_brake_decel_mps2,
	});
}

/** Simulate a path segment and return stats, or null on failure */
export async function simulateSegment(
	siteName: string,
	path_xy: [number, number][],
): Promise<SimulationStats | null> {
	try {
		const res = await fetch(
			`/api/sites/${encodeURIComponent(siteName)}/simulate`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: simBody(path_xy),
			},
		);
		if (!res.ok) return null;
		return await res.json();
	} catch { return null; }
}

/** Build request body for the game's simulate calls */
export function simBody(path_xy: [number, number][]): string {
	return JSON.stringify({
		path_xy,
		rover_mass_kg: ARTEMIS_SR.mass_kg,
		rover_power_hp: ARTEMIS_SR.power_hp,
		rover_friction_coeff: ARTEMIS_SR.wheel_friction_coeff,
		rover_crr: ARTEMIS_SR.rolling_resistance_coeff,
		rover_battery_capacity_wh: ARTEMIS_SR.battery_capacity_wh,
		rover_idle_drain_w: ARTEMIS_SR.idle_drain_w,
		rover_target_cruise_speed_mps: ARTEMIS_SR.target_cruise_speed_mps,
		rover_max_brake_decel_mps2: ARTEMIS_SR.max_brake_decel_mps2,
	});
}

/**
 * Extract auto path sub-segment between two waypoints.
 * Finds the closest indices in path_xy to each waypoint and returns the sub-path.
 */
function extractAutoSegment(
	path_xy: number[][],
	wpA: Waypoint,
	wpB: Waypoint,
): [number, number][] {
	const distSq = (px: number, py: number, wx: number, wy: number) =>
		(px - wx) ** 2 + (py - wy) ** 2;

	let idxA = 0;
	let minA = Infinity;
	for (let i = 0; i < path_xy.length; i++) {
		const d = distSq(path_xy[i][0], path_xy[i][1], wpA.x, wpA.y);
		if (d < minA) { minA = d; idxA = i; }
	}

	let idxB = idxA;
	let minB = Infinity;
	for (let i = idxA; i < path_xy.length; i++) {
		const d = distSq(path_xy[i][0], path_xy[i][1], wpB.x, wpB.y);
		if (d < minB) { minB = d; idxB = i; }
	}

	return path_xy.slice(idxA, idxB + 1) as [number, number][];
}

/**
 * Find the user waypoint nearest to each required waypoint.
 */
export function findNearestUserWps(
	required: Waypoint[],
	userWaypoints: Waypoint[],
): (Waypoint | null)[] {
	return required.map((req) => {
		let best: Waypoint | null = null;
		let bestDist = Infinity;
		for (const uwp of userWaypoints) {
			const d = Math.hypot(uwp.x - req.x, uwp.y - req.y);
			if (d < bestDist) { bestDist = d; best = uwp; }
		}
		return best;
	});
}

/**
 * Pre-calculate autopath for a round (called during round loading,
 * results kept hidden until Finish Path).
 * Simulates each segment between consecutive waypoints separately
 * and stores per-segment scores.
 */
export async function precalcRound(
	round: GameRound,
	siteName: string,
): Promise<void> {
	try {
		const autoRes = await fetch(
			`/api/sites/${encodeURIComponent(siteName)}/autodesign`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: autoBody(
					round.waypoints.map((wp) => [wp.x, wp.y]),
				),
			},
		);
		if (!autoRes.ok) return;
		const autoData: AutodesignResult = await autoRes.json();
		if (autoData.path_xy.length < 2) return;

		// Store the combined path for display
		round.autoPath = autoData.path_xy;

		// Simulate each segment between consecutive waypoints separately
		const wps = round.waypoints;
		const segmentPromises: Promise<SimulationStats | null>[] = [];
		for (let i = 0; i < wps.length - 1; i++) {
			const segPath = extractAutoSegment(autoData.path_xy, wps[i], wps[i + 1]);
			if (segPath.length >= 2) {
				segmentPromises.push(simulateSegment(siteName, segPath));
			}
		}

		if (segmentPromises.length === 0) return;

		const segResults: (SimulationStats | null)[] = await Promise.all(segmentPromises);
		const scores: number[] = segResults
			.map((s: SimulationStats | null) => (s ? (s["traversal_score"] as number) || 0 : 0));
		const totalScore: number =
			scores.length > 0
				? scores.reduce((a: number, b: number) => a + b, 0)
				: 0;

		// Grade from percentage of max possible score
		const maxPossible = scores.length * 1000;
		const pct = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
		const grade =
			pct >= 95 ? "S" : pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 50 ? "D" : "F";

		// Simulate the combined auto path for display (full velocity profile)
		const combinedStats = await simulateSegment(
			siteName,
			autoData.path_xy as [number, number][],
		);
		const displayStats = combinedStats || segResults[0] || {};
		displayStats["traversal_score"] = totalScore;
		displayStats["traversal_grade"] = grade;
		round.autoStats = displayStats as SimulationStats;
	} catch {}
}
