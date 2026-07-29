import type { AutodesignResult, GameRound, SimulationStats, Waypoint } from "../types";
import { ARTEMIS_SR } from "./roverPresets";
import { randInRange, sampleElevation } from "./utils";

/**
 * Generate an ordered chain of required waypoints (3-5) for a game round.
 * Tests that the full chain is traverseable via autodesign in segment mode.
 */
export async function generateRoundPoints(
	round: GameRound,
): Promise<Waypoint[] | null> {
	try {
		const params = new URLSearchParams({ map_type: round.mapType });
		const res = await fetch(
			`/api/sites/${encodeURIComponent(round.siteName)}/map?${params}`,
		);
		if (!res.ok) throw new Error(await res.text());
		const data = await res.json();
		const b = data.bounds;
		const hdata = data.height_data;
		const cx = (b.left + b.right) / 2;
		const cy = (b.bottom + b.top) / 2;
		const halfSpan = Math.min(
			b.right - b.left,
			b.top - b.bottom,
			7000,
		);

		const mu = ARTEMIS_SR.wheel_friction_coeff;
		const crr = ARTEMIS_SR.rolling_resistance_coeff;
		const maxClimbDeg =
			Math.atan(Math.max(0.001, mu - crr)) * (180 / Math.PI);
		const slopeLimit = maxClimbDeg * 0.75;

		// Try candidate chains until we find one with a viable path
		for (;;) {
			const count = 3 + Math.floor(Math.random() * 3); // 3-5 waypoints
			const wps: Waypoint[] = [];

			// Generate each waypoint in sequence
			for (let i = 0; i < count; i++) {
				const wp: Waypoint = {
					x: randInRange(cx - halfSpan, cx + halfSpan),
					y: randInRange(cy - halfSpan, cy + halfSpan),
				};
				wps.push(wp);
			}

			// Reject if any consecutive pair is too close or too far
			let distOk = true;
			for (let i = 0; i < wps.length - 1; i++) {
				const dist = Math.hypot(wps[i + 1].x - wps[i].x, wps[i + 1].y - wps[i].y);
				if (dist < 1000 || dist > 10000) { distOk = false; break; }
			}
			if (!distOk) continue;

			// Reject steep straight-line slopes between consecutive points
			if (hdata) {
				let slopeOk = true;
				for (let i = 0; i < wps.length - 1; i++) {
					const zA = sampleElevation(wps[i].x, wps[i].y, hdata, b);
					const zB = sampleElevation(wps[i + 1].x, wps[i + 1].y, hdata, b);
					if (zA != null && zB != null) {
						const dist = Math.hypot(wps[i + 1].x - wps[i].x, wps[i + 1].y - wps[i].y);
						const avgSlopeDeg = Math.atan2(Math.abs(zB - zA), dist) * (180 / Math.PI);
						if (avgSlopeDeg > slopeLimit) { slopeOk = false; break; }
					}
				}
				if (!slopeOk) continue;
			}

			// Test if autodesign can find a viable path through all waypoints
			try {
				const testRes = await fetch(
					`/api/sites/${encodeURIComponent(round.siteName)}/autodesign`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							waypoints_xy: wps.map((wp) => [wp.x, wp.y]),
							slope_weight: 0.3,
							sun_weight: 0.3,
							meteor_weight: 0.05,
							path_mode: "segment",
							rover_mass_kg:
								ARTEMIS_SR.mass_kg,
							rover_power_hp:
								ARTEMIS_SR.power_hp,
							rover_friction_coeff:
								ARTEMIS_SR.wheel_friction_coeff,
							rover_crr:
								ARTEMIS_SR.rolling_resistance_coeff,
							rover_battery_capacity_wh:
								ARTEMIS_SR.battery_capacity_wh,
							rover_idle_drain_w:
								ARTEMIS_SR.idle_drain_w,
							rover_target_cruise_speed_mps:
								ARTEMIS_SR.target_cruise_speed_mps,
							rover_max_brake_decel_mps2:
								ARTEMIS_SR.max_brake_decel_mps2,
							max_attempts: 1,
						}),
					},
				);
				if (testRes.ok) {
					const testData: AutodesignResult =
						await testRes.json();
					const feasible =
						!testData.simulation ||
						Number(
							testData.simulation[
								"traverse_feasible"
							],
						) >= 0.5;
					if (feasible) {
						return wps;
					}
				}
			} catch {}
		}
	} catch {}
	return null;
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
		const avgScore: number =
			scores.length > 0
				? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
				: 0;

		// Use the FIRST segment's stats for display (velocity profile, etc.)
		// and store the averaged score
		const displayStats = segResults[0] || {};
		displayStats["traversal_score"] = avgScore;
		round.autoStats = displayStats as SimulationStats;
	} catch {}
}
