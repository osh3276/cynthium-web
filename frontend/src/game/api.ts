import type { AutodesignResult, GameRound, Waypoint } from "../types";
import { ARTEMIS_SR } from "./roverPresets";
import { randInRange, sampleElevation } from "./utils";

/**
 * Generate start/end points for a game round by fetching the site map and
 * searching for a viable pair via autodesign.
 */
export async function generateRoundPoints(
	round: GameRound,
): Promise<{ start: Waypoint; end: Waypoint } | null> {
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

		// Try candidate pairs until we find one with a viable path
		for (;;) {
			const s = {
				x: randInRange(cx - halfSpan, cx + halfSpan),
				y: randInRange(cy - halfSpan, cy + halfSpan),
			};
			const e = {
				x: randInRange(cx - halfSpan, cx + halfSpan),
				y: randInRange(cy - halfSpan, cy + halfSpan),
			};
			const dist = Math.hypot(e.x - s.x, e.y - s.y);
			if (dist < 2000 || dist > 10000) continue;

			// Reject steep straight-line slope
			if (hdata) {
				const zS = sampleElevation(s.x, s.y, hdata, b);
				const zE = sampleElevation(e.x, e.y, hdata, b);
				if (zS != null && zE != null) {
					const dz = Math.abs(zE - zS);
					const avgSlopeDeg =
						Math.atan2(dz, dist) * (180 / Math.PI);
					const mu = ARTEMIS_SR.wheel_friction_coeff;
					const crr = ARTEMIS_SR.rolling_resistance_coeff;
					const maxClimb =
						Math.atan(Math.max(0.001, mu - crr)) *
						(180 / Math.PI);
					if (avgSlopeDeg > maxClimb * 0.75) continue;
				}
			}

			// Test if autodesign can find a viable path
			try {
				const testRes = await fetch(
					`/api/sites/${encodeURIComponent(round.siteName)}/autodesign`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							waypoints_xy: [[s.x, s.y], [e.x, e.y]],
							slope_weight: 0.3,
							sun_weight: 0.3,
							meteor_weight: 0.05,
							path_mode: "direct",
							rover_mass_kg:
								ARTEMIS_SR.mass_kg,
							rover_power_hp:
								ARTEMIS_SR.power_hp,
							rover_friction_coeff:
								ARTEMIS_SR.wheel_friction_coeff,
							rover_crr:
								ARTEMIS_SR.rolling_resistance_coeff,
							max_attempts: 1,
						}),
					},
				);
				if (testRes.ok) {
					const testData: AutodesignResult =
						await testRes.json();
					// Reject if path exists but simulation says infeasible
					const feasible =
						!testData.simulation ||
						Number(
							testData.simulation[
								"traverse_feasible"
							],
						) >= 0.5;
					if (feasible) {
						return { start: s, end: e };
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
		path_mode: "direct",
		rover_mass_kg: ARTEMIS_SR.mass_kg,
		rover_power_hp: ARTEMIS_SR.power_hp,
		rover_friction_coeff: ARTEMIS_SR.wheel_friction_coeff,
		rover_crr: ARTEMIS_SR.rolling_resistance_coeff,
	});
}

/** Build request body for the game's simulate calls */
export function simBody(path_xy: [number, number][]): string {
	return JSON.stringify({
		path_xy,
		rover_mass_kg: ARTEMIS_SR.mass_kg,
		rover_power_hp: ARTEMIS_SR.power_hp,
		rover_friction_coeff: ARTEMIS_SR.wheel_friction_coeff,
		rover_crr: ARTEMIS_SR.rolling_resistance_coeff,
	});
}

/**
 * Pre-calculate autopath for a round (called during round loading,
 * results kept hidden until Finish Path).
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
				body: autoBody([
					[round.startPoint.x, round.startPoint.y],
					[round.endPoint.x, round.endPoint.y],
				]),
			},
		);
		if (!autoRes.ok) return;
		const autoData: AutodesignResult = await autoRes.json();
		if (autoData.path_xy.length >= 2) {
			round.autoPath = autoData.path_xy;
			if (autoData.simulation) {
				round.autoStats = autoData.simulation;
			} else {
				const autoSimRes = await fetch(
					`/api/sites/${encodeURIComponent(siteName)}/simulate`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: simBody(
							autoData.path_xy as [number, number][],
						),
					},
				);
				if (autoSimRes.ok) {
					round.autoStats = await autoSimRes.json();
				}
			}
		}
	} catch {}
}
