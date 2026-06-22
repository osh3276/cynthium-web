import { useEffect, useRef, useState, useCallback } from "react";

export interface RoverAnimState {
	/** Current rover position in pixel coords, or null when not animating */
	pos: { x: number; y: number } | null;
	/** Current velocity in m/s */
	velocity: number;
	/** Progress along the path (0-1) */
	progress: number;
	/** Whether the animation has completed */
	done: boolean;
	/** Whether the rover failed (stopped at failure point) */
	failed: boolean;
}

interface ProfilePoint {
	x: number;
	y: number;
	v: number; // m/s
}

/**
 * Drives rover animation along a velocity profile using requestAnimationFrame.
 *
 * The profile is an array of `[x, y, velocity_mps]` triples produced by the
 * backend simulation.  The rover advances by v_avg * dt each frame, using the
 * average velocity across the current segment.  This correctly handles the
 * first segment where the rover starts from rest (v=0 at point 0 but
 * accelerates to a positive velocity at point 1).
 *
 * @param profile  Velocity profile from backend, or null to reset.
 * @param worldToPixel  Function mapping world coords -> pixel coords.
 * @param speedMultiplier  Scale factor for animation speed (default 1 = real-time).
 * @param restartKey  When this value changes, the animation restarts even
 *                    if the profile data is the same object.  Pass the
 *                    parent stats object to force restart on re-simulate.
 */
export function useRoverAnimation(
	profile: [number, number, number][] | null | undefined,
	worldToPixel: (x: number, y: number) => { x: number; y: number } | null,
	speedMultiplier = 1,
	restartKey?: unknown,
): RoverAnimState {
	const [state, setState] = useState<RoverAnimState>({
		pos: null,
		velocity: 0,
		progress: 0,
		done: true,
		failed: false,
	});

	// Keep mutable copies for the rAF loop
	const profileRef = useRef<ProfilePoint[]>([]);
	const cumDistRef = useRef<number[]>([]);
	const totalDistRef = useRef(0);
	const progressRef = useRef(0);
	const lastTimeRef = useRef<number | null>(null);
	const rafRef = useRef<number>(0);
	const doneRef = useRef(true);

	// Rebuild internal structures when profile changes
	useEffect(() => {
		if (!profile || profile.length < 2) {
			profileRef.current = [];
			cumDistRef.current = [];
			totalDistRef.current = 0;
			progressRef.current = 0;
			lastTimeRef.current = null;
			doneRef.current = true;
			setState({
				pos: null,
				velocity: 0,
				progress: 0,
				done: true,
				failed: false,
			});
			return;
		}

		const pts: ProfilePoint[] = profile.map((p) => ({
			x: p[0],
			y: p[1],
			v: Math.max(0, p[2]),
		}));
		profileRef.current = pts;

		// Build cumulative distance array from the profile's positions
		const dists: number[] = [0];
		let total = 0;
		for (let i = 1; i < pts.length; i++) {
			const dx = pts[i].x - pts[i - 1].x;
			const dy = pts[i].y - pts[i - 1].y;
			total += Math.sqrt(dx * dx + dy * dy);
			dists.push(total);
		}
		cumDistRef.current = dists;
		totalDistRef.current = total;
		progressRef.current = 0;
		lastTimeRef.current = null;
		doneRef.current = false;

		// Place rover at start
		const px = worldToPixel(pts[0].x, pts[0].y);
		setState({
			pos: px,
			velocity: pts[0].v,
			progress: 0,
			done: false,
			failed: false,
		});

		return () => {
			cancelAnimationFrame(rafRef.current);
		};
	}, [profile, worldToPixel, restartKey]);

	const animate = useCallback(() => {
		const pts = profileRef.current;
		const cumDist = cumDistRef.current;
		const totalDist = totalDistRef.current;
		if (pts.length < 2 || totalDist <= 0) return;

		if (doneRef.current) return;

		const now = performance.now();
		if (lastTimeRef.current === null) {
			lastTimeRef.current = now;
		}

		const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1); // cap dt to avoid jumps
		lastTimeRef.current = now;

		const pct = progressRef.current;
		if (pct >= 1) {
			const last = pts[pts.length - 1];
			const px = worldToPixel(last.x, last.y);
			const failed = last.v <= 0;
			setState({ pos: px, velocity: 0, progress: 1, done: true, failed });
			doneRef.current = true;
			return;
		}

		const curDist = pct * totalDist;

		// Find which segment we're in
		let segIdx = 0;
		for (let i = 1; i < cumDist.length; i++) {
			if (curDist <= cumDist[i]) {
				segIdx = i - 1;
				break;
			}
		}
		segIdx = Math.max(0, Math.min(segIdx, pts.length - 2));

		// Compute instantaneous velocity at current position within the
		// segment using the constant-acceleration formula:
		//   v(t)^2 = v_i^2 + (v_{i+1}^2 - v_i^2) * t
		// where t = segProgress (0..1).
		// This correctly shows deceleration on uphills and acceleration
		// on downhills within each segment.
		const v_i = pts[segIdx].v;
		const v_next = pts[segIdx + 1].v;
		const segLen = cumDist[segIdx + 1] - cumDist[segIdx];
		const segProgress =
			segLen > 0 ? (curDist - cumDist[segIdx]) / segLen : 0;
		const vSq = v_i * v_i + (v_next * v_next - v_i * v_i) * segProgress;
		let v = vSq > 0 ? Math.sqrt(vSq) : 0;

		// Ensure minimum velocity so the rover doesn't get stuck at
		// the start of the path where v_i = 0.
		const minV = ((v_i + v_next) / 2) * 0.05;
		if (v < minV) v = minV;

		// Advance distance by v_inst * dt (scaled)
		const advance = v * dt * speedMultiplier;
		const newDist = Math.min(curDist + advance, totalDist);
		const newPct = totalDist > 0 ? newDist / totalDist : 1;

		progressRef.current = newPct;

		// Find interpolated position at new distance
		let newSegIdx = 0;
		for (let i = 1; i < cumDist.length; i++) {
			if (newDist <= cumDist[i]) {
				newSegIdx = i - 1;
				break;
			}
		}
		newSegIdx = Math.max(0, Math.min(newSegIdx, pts.length - 2));

		const nsLen = cumDist[newSegIdx + 1] - cumDist[newSegIdx];
		const nsProgress =
			nsLen > 0 ? (newDist - cumDist[newSegIdx]) / nsLen : 0;
		const px =
			pts[newSegIdx].x +
			(pts[newSegIdx + 1].x - pts[newSegIdx].x) * nsProgress;
		const py =
			pts[newSegIdx].y +
			(pts[newSegIdx + 1].y - pts[newSegIdx].y) * nsProgress;

		const pixelPos = worldToPixel(px, py);

		const done = newPct >= 1;
		const failed = done && pts[pts.length - 1].v <= 0;

		setState({
			pos: pixelPos,
			velocity: v,
			progress: newPct,
			done,
			failed,
		});

		doneRef.current = done;

		if (!done) {
			rafRef.current = requestAnimationFrame(animate);
		}
	}, [worldToPixel, speedMultiplier]);

	// Start/restart rAF loop when profile changes
	useEffect(() => {
		if (!profile || profile.length < 2) return;

		lastTimeRef.current = null;
		rafRef.current = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(rafRef.current);
		};
	}, [profile, animate, restartKey]);

	return state;
}
