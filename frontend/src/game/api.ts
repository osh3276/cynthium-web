import type { AutodesignResult, GameRound, Waypoint } from "../types";
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
				body: autoBody(
					round.waypoints.map((wp) => [wp.x, wp.y]),
				),
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
