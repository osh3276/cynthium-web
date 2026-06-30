import { useState, useCallback, useRef } from "react";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import GameResultDialog from "./components/GameResultDialog";
import GameFinishDialog from "./components/GameFinishDialog";
import {
	type MapPayload,
	type Waypoint,
	type AutodesignResult,
	type AutodesignConfig,
	type RoverSettings,
	type SimulationStats,
	type GameState,
	type GameRound,
} from "./types";
import { SITE_PRESETS } from "./constants";
import "./App.css";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

function showError(err: unknown) {
	const msg = err instanceof Error ? err.message : String(err);
	try {
		const parsed = JSON.parse(msg);
		if (parsed.detail) {
			alert(parsed.detail);
			return;
		}
	} catch {}
	alert(msg);
}

const CURIOSITY: RoverSettings = {
	mass_kg: 899.0,
	power_hp: 0.13,
	wheel_friction_coeff: 0.5,
	rolling_resistance_coeff: 0.02,
};

const ARTEMIS_SR: RoverSettings = {
	mass_kg: 530,
	power_hp: 0.72,
	wheel_friction_coeff: 0.7,
	rolling_resistance_coeff: 0.15,
};

// const LRV_ROVER: RoverSettings = {
// 	mass_kg: 210,
// 	power_hp: 1.0,
// 	wheel_friction_coeff: 0.6,
// 	rolling_resistance_coeff: 0.021,
// };

function shufflePick<T>(arr: T[], n: number): T[] {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, n);
}

function randInRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

/** Bilinear sample from the height_data grid */
function sampleElevation(
	x: number,
	y: number,
	hdata: number[][],
	bounds: { left: number; right: number; bottom: number; top: number },
): number | null {
	const rows = hdata.length;
	const cols = hdata[0].length;
	if (!rows || !cols) return null;
	const tx = (x - bounds.left) / (bounds.right - bounds.left);
	const ty = (y - bounds.bottom) / (bounds.top - bounds.bottom);
	const fc = tx * (cols - 1);
	const fr = (1 - ty) * (rows - 1);
	const c0 = Math.floor(fc);
	const c1 = Math.min(c0 + 1, cols - 1);
	const r0 = Math.floor(fr);
	const r1 = Math.min(r0 + 1, rows - 1);
	if (r0 < 0 || r0 >= rows || c0 < 0 || c0 >= cols) return null;
	const fracC = fc - c0;
	const fracR = fr - r0;
	const h00 = hdata[r0][c0];
	const h10 = hdata[r0][c1];
	const h01 = hdata[r1][c0];
	const h11 = hdata[r1][c1];
	const top = h00 + (h10 - h00) * fracC;
	const bottom = h01 + (h11 - h01) * fracC;
	return top + (bottom - top) * fracR;
}

/** Estimate terrain roughness at a point by checking height variation ±3 cells away */
function terrainRoughness(
	x: number,
	y: number,
	hdata: number[][],
	bounds: { left: number; right: number; bottom: number; top: number },
): number {
	const rows = hdata.length;
	const cols = hdata[0].length;
	const resX = (bounds.right - bounds.left) / (cols - 1);
	const resY = (bounds.top - bounds.bottom) / (rows - 1);
	const step = Math.max(resX, resY) * 3;
	const z0 = sampleElevation(x, y, hdata, bounds);
	if (z0 == null) return Infinity;
	const offsets = [
		[step, 0],
		[-step, 0],
		[0, step],
		[0, -step],
	];
	let total = 0;
	let n = 0;
	for (const [dx, dy] of offsets) {
		const z = sampleElevation(x + dx, y + dy, hdata, bounds);
		if (z != null) {
			total += Math.abs(z - z0);
			n++;
		}
	}
	return n > 0 ? total / n : Infinity;
}

function App() {
	const [mapData, setMapData] = useState<MapPayload | null>(null);
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [currentSite, setCurrentSite] = useState("");
	const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
	const [autodesignResult, setAutodesignResult] =
		useState<AutodesignResult | null>(null);
	const [autodesignRunning, setAutodesignRunning] = useState(false);
	const [roverSettings, setRoverSettings] =
		useState<RoverSettings>(CURIOSITY);
	const [manualStats, setManualStats] = useState<SimulationStats | null>(
		null,
	);
	const [autoStats, setAutoStats] = useState<SimulationStats | null>(null);
	const [simulating, setSimulating] = useState(false);
	const [resultsHeight, setResultsHeight] = useState(200);
	const resizeRef = useRef<boolean>(false);
	const loadedSiteRef = useRef("");
	const mapTypeRef = useRef("Elevation");

	// Game state
	const [gameState, setGameState] = useState<GameState | null>(null);
	const [gameStartPoint, setGameStartPoint] = useState<Waypoint | null>(null);
	const [gameEndPoint, setGameEndPoint] = useState<Waypoint | null>(null);
	const [showGameResult, setShowGameResult] = useState(false);
	const [pendingGameResult, setPendingGameResult] = useState(false);
	const [showGameFinish, setShowGameFinish] = useState(false);
	const [gameLoading, setGameLoading] = useState(false);

	const handleCloseGameResult = useCallback(() => {
		setShowGameResult(false);
	}, []);

	const loadSiteMap = useCallback(
		async (siteName: string, mapType: string, date: string) => {
			const siteChanged = siteName !== loadedSiteRef.current;
			loadedSiteRef.current = siteName;
			setCurrentSite(siteName);
			setStatus("loading");
			if (siteChanged) {
				setWaypoints([]);
			}
			setAutodesignResult(null);
			setManualStats(null);
			setAutoStats(null);
			try {
				const params = new URLSearchParams({ map_type: mapType, date });
				const res = await fetch(
					`/api/sites/${encodeURIComponent(siteName)}/map?${params}`,
				);
				if (!res.ok) throw new Error(await res.text());
				const data: MapPayload = await res.json();
				setMapData(data);
				setStatus("loaded");
			} catch (err) {
				setStatus("error");
				showError(err);
			}
		},
		[],
	);

	const handleLoadSite = useCallback(
		(siteName: string, mapType: string, date: string) => {
			if (gameState?.active) return;
			loadSiteMap(siteName, mapType, date);
		},
		[loadSiteMap, gameState],
	);

	const handleChangeMapType = useCallback(
		(mapType: string, date: string) => {
			mapTypeRef.current = mapType;
			if (currentSite && !pendingGameResult) {
				loadSiteMap(currentSite, mapType, date);
			}
		},
		[loadSiteMap, currentSite, pendingGameResult],
	);

	const handleAddWaypoint = useCallback(
		(wp: Waypoint) => {
			// Don't add waypoints during game result animation or dialog
			if (pendingGameResult || showGameResult) return;
			setWaypoints((prev) => [...prev, wp]);
			setAutodesignResult(null);
		},
		[pendingGameResult, showGameResult],
	);

	const handleRemoveWaypoint = useCallback((index: number) => {
		setWaypoints((prev) => prev.filter((_, i) => i !== index));
		setAutodesignResult(null);
	}, []);

	const handleClearWaypoints = useCallback(() => {
		setWaypoints([]);
		setAutodesignResult(null);
	}, []);

	const handleAutodesign = useCallback(
		async (config: AutodesignConfig) => {
			if (waypoints.length < 2 || !currentSite) return;
			console.log(
				"Autodesign: sending",
				currentSite,
				waypoints.length,
				"wps",
			);
			setAutodesignRunning(true);
			setAutodesignResult(null);
			try {
				const res = await fetch(
					`/api/sites/${encodeURIComponent(currentSite)}/autodesign`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							waypoints_xy: waypoints.map((w) => [w.x, w.y]),
							slope_weight: config.slope_weight,
							sun_weight: config.sun_weight,
							meteor_weight: config.meteor_weight,
							path_mode: config.path_mode,
							rover_mass_kg: config.rover_mass_kg,
							rover_power_hp: config.rover_power_hp,
							rover_friction_coeff: config.rover_friction_coeff,
							rover_crr: config.rover_crr,
						}),
					},
				);
				if (!res.ok) throw new Error(await res.text());
				const data: AutodesignResult = await res.json();
				setAutodesignResult(data);
				// If autodesign returned simulation failure info, show it on the map
				if (data.simulation?.failure_xy) {
					setAutoStats(data.simulation);
				}
			} catch (err) {
				showError(err);
			} finally {
				setAutodesignRunning(false);
			}
		},
		[waypoints, currentSite],
	);

	const handleSimulate = useCallback(async () => {
		if (!currentSite) return;
		const manualPath = waypoints.map((w) => [w.x, w.y] as [number, number]);
		const autoPath = autodesignResult?.path_xy as
			| [number, number][]
			| undefined;
		if (manualPath.length < 2 && !autoPath) return;

		setSimulating(true);
		setManualStats(null);
		setAutoStats(null);

		const body = (path_xy: [number, number][], rover: RoverSettings) =>
			JSON.stringify({
				path_xy,
				rover_mass_kg: rover.mass_kg,
				rover_power_hp: rover.power_hp,
				rover_friction_coeff: rover.wheel_friction_coeff,
				rover_crr: rover.rolling_resistance_coeff,
			});

		const run = async (
			label: string,
			path_xy: [number, number][],
			rover: RoverSettings,
		) => {
			const res = await fetch(
				`/api/sites/${encodeURIComponent(currentSite)}/simulate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: body(path_xy, rover),
				},
			);
			if (!res.ok) throw new Error(`${label}: ${await res.text()}`);
			return (await res.json()) as SimulationStats;
		};

		const promises: Promise<void>[] = [];
		if (manualPath.length >= 2) {
			promises.push(
				run("Manual", manualPath, roverSettings).then((s) =>
					setManualStats(s),
				),
			);
		}
		if (autoPath && autoPath.length >= 2) {
			promises.push(
				run("Auto", autoPath, roverSettings).then((s) =>
					setAutoStats(s),
				),
			);
		}
		try {
			await Promise.all(promises);
		} catch (err) {
			showError(err);
		} finally {
			setSimulating(false);
		}
	}, [currentSite, waypoints, autodesignResult, roverSettings]);

	const handleRoverChange = useCallback((settings: RoverSettings) => {
		setRoverSettings(settings);
	}, []);

	const handleResultsResize = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			resizeRef.current = true;
			const startY = e.clientY;
			const startH = resultsHeight;
			const onMove = (me: MouseEvent) => {
				if (!resizeRef.current) return;
				const dy = me.clientY - startY;
				const newH = Math.max(
					100,
					Math.min(window.innerHeight * 0.8, startH - dy),
				);
				setResultsHeight(newH);
			};
			const onUp = () => {
				resizeRef.current = false;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[resultsHeight],
	);

	// Generate start/end for a round by fetching its map
	const generateRoundPoints = useCallback(
		async (
			round: GameRound,
		): Promise<{ start: Waypoint; end: Waypoint } | null> => {
			try {
				const params = new URLSearchParams({ map_type: round.mapType });
				const res = await fetch(
					`/api/sites/${encodeURIComponent(round.siteName)}/map?${params}`,
				);
				if (!res.ok) throw new Error(await res.text());
				const data: MapPayload = await res.json();
				const b = data.bounds;
				const hdata = data.height_data;
				const cx = (b.left + b.right) / 2;
				const cy = (b.bottom + b.top) / 2;
				const halfSpan = Math.min(
					b.right - b.left,
					b.top - b.bottom,
					7000,
				);

				// Generate candidates and pick the flattest pair
				let best: { start: Waypoint; end: Waypoint } | null = null;
				let bestScore = Infinity;
				for (let i = 0; i < 25; i++) {
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
					let score = 0;
					if (hdata) {
						score += terrainRoughness(s.x, s.y, hdata, b);
						score += terrainRoughness(e.x, e.y, hdata, b);
						// Penalize steep straight-line slope between start and end
						const zS = sampleElevation(s.x, s.y, hdata, b);
						const zE = sampleElevation(e.x, e.y, hdata, b);
						if (zS != null && zE != null) {
							const dz = Math.abs(zE - zS);
							const avgSlopeDeg =
								Math.atan2(dz, dist) * (180 / Math.PI);
							// 75 % of rover max climbable slope
							const mu = ARTEMIS_SR.wheel_friction_coeff;
							const crr =
								ARTEMIS_SR.rolling_resistance_coeff;
							const maxClimb =
								Math.atan(Math.max(0.001, mu - crr)) *
								(180 / Math.PI);
							const slopeLimit = maxClimb * 0.75;
							if (avgSlopeDeg > slopeLimit) {
								score +=
									(avgSlopeDeg - slopeLimit) * 20;
							}
						}
					}
					if (score < bestScore) {
						bestScore = score;
						best = { start: s, end: e };
					}
				}
				if (best) return best;
				// Fallback: just return any valid pair
				const start = {
					x: randInRange(cx - halfSpan, cx + halfSpan),
					y: randInRange(cy - halfSpan, cy + halfSpan),
				};
				const end = {
					x: randInRange(cx - halfSpan, cx + halfSpan),
					y: randInRange(cy - halfSpan, cy + halfSpan),
				};
				return { start, end };
			} catch {
				return null;
			}
		},
		[],
	);

	const autoBody = (waypoints_xy: number[][]) =>
		JSON.stringify({
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

	const simBody = (path_xy: [number, number][]) =>
		JSON.stringify({
			path_xy,
			rover_mass_kg: ARTEMIS_SR.mass_kg,
			rover_power_hp: ARTEMIS_SR.power_hp,
			rover_friction_coeff: ARTEMIS_SR.wheel_friction_coeff,
			rover_crr: ARTEMIS_SR.rolling_resistance_coeff,
		});

	async function precalcRound(
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
				// Use inline simulation result if available (even for failed paths)
				if (autoData.simulation) {
					round.autoStats = autoData.simulation;
				} else {
					// Fallback: run separate simulate for feasible paths
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

	// ---- Game handlers ----
	const handleStartGame = useCallback(async () => {
		setGameLoading(true);
		try {
			const siteNames = Object.keys(SITE_PRESETS);
			const picked = shufflePick(
				siteNames,
				Math.min(5, siteNames.length),
			);

			// Create rounds and pre-generate all start/end points
			const roundPromises = picked.map(async (name) => {
				const round: GameRound = {
					siteName: name,
					mapType: mapTypeRef.current,
					startPoint: { x: 0, y: 0 },
					endPoint: { x: 0, y: 0 },
					userPath: [],
					autoPath: null,
					userStats: null,
					autoStats: null,
					userScore: 0,
					autoScore: 0,
				};
				const pts = await generateRoundPoints(round);
				if (pts) {
					round.startPoint = pts.start;
					round.endPoint = pts.end;
				}
				return round;
			});
			const rounds = await Promise.all(roundPromises);

			setRoverSettings(ARTEMIS_SR);
			setGameState({
				active: true,
				rounds,
				currentRound: 0,
				finished: false,
			});
			setShowGameResult(false);
			setShowGameFinish(false);
			setWaypoints([]);
			setAutodesignResult(null);
			setManualStats(null);
			setAutoStats(null);
			setGameStartPoint(rounds[0].startPoint);
			setGameEndPoint(rounds[0].endPoint);
			await loadSiteMap(
				rounds[0].siteName,
				rounds[0].mapType,
				"2026-05-13",
			);

			// Pre-calculate autopath for first round (hidden, only used on Finish Path)
			await precalcRound(rounds[0], rounds[0].siteName);
			// Don't setAutodesignResult/setAutoStats here — keep them null until Finish Path
		} finally {
			setGameLoading(false);
		}
	}, [loadSiteMap, generateRoundPoints]);

	const advanceRound = useCallback(async () => {
		if (!gameState) return;
		const next = gameState.currentRound + 1;
		if (next >= gameState.rounds.length) {
			setShowGameFinish(true);
			return;
		}
		const nextRound = gameState.rounds[next];
		const mt = mapTypeRef.current;
		nextRound.mapType = mt;
		setGameState((prev) => (prev ? { ...prev, currentRound: next } : prev));
		setGameStartPoint(nextRound.startPoint);
		setGameEndPoint(nextRound.endPoint);
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
		setShowGameResult(false);
		await loadSiteMap(
			nextRound.siteName,
			nextRound.mapType,
			"2026-05-13",
		);

		// Pre-calculate autopath for this round (hidden, only used on Finish Path)
		if (!nextRound.autoPath) {
			await precalcRound(nextRound, nextRound.siteName);
		}
		// Don't setAutodesignResult/setAutoStats here — keep them null until Finish Path
	}, [gameState, loadSiteMap]);

	const handleFinishPath = useCallback(async () => {
		if (!gameState || !currentSite || !mapData) return;
		const round = gameState.rounds[gameState.currentRound];
		const manualPath = waypoints.map((w) => [w.x, w.y] as [number, number]);
		if (manualPath.length < 2) return;

		// Validate first/last waypoints are near S/E markers
		const b = mapData.bounds;
		const radius = Math.max(b.right - b.left, b.top - b.bottom) * 0.05;
		const first = waypoints[0];
		const last = waypoints[waypoints.length - 1];
		const dStart = Math.hypot(
			first.x - round.startPoint.x,
			first.y - round.startPoint.y,
		);
		const dEnd = Math.hypot(
			last.x - round.endPoint.x,
			last.y - round.endPoint.y,
		);
		if (dStart > radius) {
			alert(
				`First waypoint is too far from the start marker (${dStart.toFixed(0)}m, max ${radius.toFixed(0)}m). Place a waypoint near the blue S.`,
			);
			return;
		}
		if (dEnd > radius) {
			alert(
				`Last waypoint is too far from the end marker (${dEnd.toFixed(0)}m, max ${radius.toFixed(0)}m). Place a waypoint near the red E.`,
			);
			return;
		}

		setSimulating(true);
		setManualStats(null);

		try {
			// 1. Simulate user path
			const userRes = await fetch(
				`/api/sites/${encodeURIComponent(currentSite)}/simulate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: simBody(manualPath),
				},
			);
			if (!userRes.ok) throw new Error(await userRes.text());
			const userStats: SimulationStats = await userRes.json();

			round.userPath = waypoints;
			round.userStats = userStats;
			const userFeasible =
				(userStats["traverse_feasible"] as number) >= 0.5;
			const autoStats: SimulationStats = round.autoStats || {};
			const autoFeasible =
				(autoStats["traverse_feasible"] as number) >= 0.5;

			// When both paths fail, grade by distance from endzone
			const bothFailed = !userFeasible && !autoFeasible;
			if (bothFailed) {
				const failDistScore = (
					stats: SimulationStats | null,
					start: Waypoint,
					end: Waypoint,
				): number => {
					const fxy = stats?.failure_xy;
					if (!fxy) return 0;
					const totalDist = Math.hypot(end.x - start.x, end.y - start.y);
					if (totalDist <= 0) return 0;
					const distToEnd = Math.hypot(fxy[0] - end.x, fxy[1] - end.y);
					const progress = 1 - Math.min(distToEnd / totalDist, 1);
					return Math.round(progress * 1000);
				};
				round.userScore = failDistScore(userStats, round.startPoint, round.endPoint);
				round.autoScore = failDistScore(autoStats, round.startPoint, round.endPoint);
			} else {
				round.userScore = userFeasible
					? (userStats["traversal_score"] as number) || 0
					: 0;
				round.autoScore = autoFeasible
					? (autoStats["traversal_score"] as number) || 0
					: 0;
			}
			setManualStats(userStats);

			// 2. Use pre-calculated autopath (computed during round loading)
			setAutoStats(Object.keys(autoStats).length > 0 ? autoStats : null);
			if (round.autoPath) {
				setAutodesignResult({
					path_xy: round.autoPath,
					total_cost: 0,
					expanded: 0,
				});
			}

			setGameState((prev) =>
				prev ? { ...prev, rounds: [...prev.rounds] } : prev,
			);
			setPendingGameResult(true);
		} catch (err) {
			showError(err);
		} finally {
			setSimulating(false);
		}
	}, [gameState, currentSite, waypoints, mapData]);

	const handleGameFinish = useCallback(() => {
		setGameState(null);
		setGameStartPoint(null);
		setGameEndPoint(null);
		setShowGameFinish(false);
		setShowGameResult(false);
		setRoverSettings(CURIOSITY);
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
		setCurrentSite("");
		setMapData(null);
		setStatus("idle");
	}, []);

	// Show game result dialog after rover animations finish
	const handleAnimationsComplete = useCallback(() => {
			if (pendingGameResult) {
				setPendingGameResult(false);
				setTimeout(() => setShowGameResult(true), 1000);
			}
		}, [pendingGameResult]);

	const currentRound = gameState
		? gameState.rounds[gameState.currentRound]
		: null;

	return (
		<div className="app-layout">
			<header className="app-header">
				<div className="header-brand">
					<span className="header-title">CYNTHIUM</span>
					<span className="header-version">v1.0.0</span>
				</div>
				<div className="header-tagline">Lunar Route Planning System</div>
				<div className="header-glow" />
			</header>
			<div className="main-content">
				<div className="left-pane">
					<div className="view-area">
						<ViewContainer
							mapData={mapData}
							status={status}
							waypoints={waypoints}
							autodesignResult={autodesignResult}
							onAddWaypoint={handleAddWaypoint}
							gameStartPoint={gameStartPoint}
							gameEndPoint={gameEndPoint}
							manualStats={manualStats}
							autoStats={autoStats}
							onAnimationsComplete={handleAnimationsComplete}
						/>
					</div>
					<div
						className="resize-handle"
						onMouseDown={handleResultsResize}
					/>
					{!gameState?.active && (
						<div
							className="results-area"
							style={{ height: resultsHeight }}
						>
							<SimulationResultsPanel
								manualStats={manualStats}
								autoStats={autoStats}
								onSimulate={handleSimulate}
								simulating={simulating}
							/>
						</div>
					)}
				</div>
				<div className="sidebar-pane">
					<Sidebar
						onLoadSite={handleLoadSite}
						onChangeMapType={handleChangeMapType}
						onNextRound={advanceRound}
						status={status}
						waypoints={waypoints}
						onAddWaypoint={handleAddWaypoint}
						onRemoveWaypoint={handleRemoveWaypoint}
						onClearWaypoints={handleClearWaypoints}
						onAutodesign={handleAutodesign}
						autodesignRunning={autodesignRunning}
						autodesignResult={autodesignResult}
						roverSettings={roverSettings}
						onRoverChange={handleRoverChange}
						gameState={gameState}
						gameStartPoint={gameStartPoint}
						gameEndPoint={gameEndPoint}
						onFinishPath={handleFinishPath}
						onStartGame={handleStartGame}
						simulating={simulating}
					/>
				</div>
			</div>
			{showGameResult && currentRound && gameState && (
				<GameResultDialog
					round={gameState.currentRound + 1}
					totalRounds={gameState.rounds.length}
					siteName={currentRound.siteName}
					userScore={currentRound.userScore}
					autoScore={currentRound.autoScore}
					userStats={currentRound.userStats}
					autoStats={currentRound.autoStats}
					userGrade={
						(currentRound.userStats?.[
							"traversal_grade"
						] as string) || "F"
					}
					autoGrade={
						(currentRound.autoStats?.[
							"traversal_grade"
						] as string) || "F"
					}
					onNext={advanceRound}
					onClose={handleCloseGameResult}
					isLast={
						gameState.currentRound >= gameState.rounds.length - 1
					}
				/>
			)}
			{showGameFinish && gameState && (
				<GameFinishDialog
					rounds={gameState.rounds}
					onFinish={handleGameFinish}
				/>
			)}
			{gameLoading && (
				<div className="dialog-overlay">
					<div className="dialog" style={{ alignItems: "center" }}>
						<div className="dialog-title">Loading game...</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
