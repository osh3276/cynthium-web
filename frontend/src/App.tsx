import { useState, useCallback, useRef } from "react";
import MenuBar from "./components/MenuBar";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import GameResultDialog from "./components/GameResultDialog";
import GameFinishDialog from "./components/GameFinishDialog";
import { type MapPayload, type Waypoint, type AutodesignResult, type AutodesignConfig, type RoverSettings, type SimulationStats, type GameState, type GameRound } from "./types";
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

const DEFAULT_ROVER: RoverSettings = {
	mass_kg: 150.0,
	power_hp: 0.2,
	wheel_friction_coeff: 0.6,
	rolling_resistance_coeff: 0.1,
};

const LRV_ROVER: RoverSettings = {
	mass_kg: 210,
	power_hp: 1.0,
	wheel_friction_coeff: 0.6,
	rolling_resistance_coeff: 0.021,
};

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

function App() {
	const [mapData, setMapData] = useState<MapPayload | null>(null);
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [currentSite, setCurrentSite] = useState("");
	const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
	const [autodesignResult, setAutodesignResult] = useState<AutodesignResult | null>(null);
	const [autodesignRunning, setAutodesignRunning] = useState(false);
	const [roverSettings, setRoverSettings] = useState<RoverSettings>(DEFAULT_ROVER);
	const [manualStats, setManualStats] = useState<SimulationStats | null>(null);
	const [autoStats, setAutoStats] = useState<SimulationStats | null>(null);
	const [simulating, setSimulating] = useState(false);
	const [resultsHeight, setResultsHeight] = useState(200);
	const resizeRef = useRef<boolean>(false);
	const loadedSiteRef = useRef("");

	// Game state
	const [gameState, setGameState] = useState<GameState | null>(null);
	const [gameStartPoint, setGameStartPoint] = useState<Waypoint | null>(null);
	const [gameEndPoint, setGameEndPoint] = useState<Waypoint | null>(null);
	const [showGameResult, setShowGameResult] = useState(false);
	const [showGameFinish, setShowGameFinish] = useState(false);

	const loadSiteMap = useCallback(async (siteName: string, mapType: string, date: string) => {
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
			const res = await fetch(`/api/sites/${encodeURIComponent(siteName)}/map?${params}`);
			if (!res.ok) throw new Error(await res.text());
			const data: MapPayload = await res.json();
			setMapData(data);
			setStatus("loaded");
		} catch (err) {
			setStatus("error");
			showError(err);
		}
	}, []);

	const handleLoadSite = useCallback((siteName: string, mapType: string, date: string) => {
		if (gameState?.active) return;
		loadSiteMap(siteName, mapType, date);
	}, [loadSiteMap, gameState]);

	const handleAddWaypoint = useCallback((wp: Waypoint) => {
		setWaypoints((prev) => [...prev, wp]);
		setAutodesignResult(null);
	}, []);

	const handleRemoveWaypoint = useCallback((index: number) => {
		setWaypoints((prev) => prev.filter((_, i) => i !== index));
		setAutodesignResult(null);
	}, []);

	const handleAutodesign = useCallback(async (config: AutodesignConfig) => {
		if (waypoints.length < 2 || !currentSite) return;
		console.log("Autodesign: sending", currentSite, waypoints.length, "wps");
		setAutodesignRunning(true);
		setAutodesignResult(null);
		try {
			const res = await fetch(`/api/sites/${encodeURIComponent(currentSite)}/autodesign`, {
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
			});
			if (!res.ok) throw new Error(await res.text());
			const data: AutodesignResult = await res.json();
			setAutodesignResult(data);
		} catch (err) {
			showError(err);
		} finally {
			setAutodesignRunning(false);
		}
	}, [waypoints, currentSite]);

	const handleSimulate = useCallback(async () => {
		if (!currentSite) return;
		const manualPath = waypoints.map((w) => [w.x, w.y] as [number, number]);
		const autoPath = autodesignResult?.path_xy as [number, number][] | undefined;
		if (manualPath.length < 2 && !autoPath) return;

		setSimulating(true);
		setManualStats(null);
		setAutoStats(null);

		const body = (path_xy: [number, number][], rover: RoverSettings) => JSON.stringify({
			path_xy,
			rover_mass_kg: rover.mass_kg,
			rover_power_hp: rover.power_hp,
			rover_friction_coeff: rover.wheel_friction_coeff,
			rover_crr: rover.rolling_resistance_coeff,
		});

		const run = async (label: string, path_xy: [number, number][], rover: RoverSettings) => {
			const res = await fetch(`/api/sites/${encodeURIComponent(currentSite)}/simulate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: body(path_xy, rover),
			});
			if (!res.ok) throw new Error(`${label}: ${await res.text()}`);
			return await res.json() as SimulationStats;
		};

		const promises: Promise<void>[] = [];
		if (manualPath.length >= 2) {
			promises.push(
				run("Manual", manualPath, roverSettings).then((s) => setManualStats(s))
			);
		}
		if (autoPath && autoPath.length >= 2) {
			promises.push(
				run("Auto", autoPath, roverSettings).then((s) => setAutoStats(s))
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

	const handleResultsResize = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		resizeRef.current = true;
		const startY = e.clientY;
		const startH = resultsHeight;
		const onMove = (me: MouseEvent) => {
			if (!resizeRef.current) return;
			const dy = me.clientY - startY;
			const newH = Math.max(100, Math.min(window.innerHeight * 0.8, startH - dy));
			setResultsHeight(newH);
		};
		const onUp = () => {
			resizeRef.current = false;
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	}, [resultsHeight]);

	// Generate start/end for a round by fetching its map
	const generateRoundPoints = useCallback(async (round: GameRound): Promise<{ start: Waypoint; end: Waypoint } | null> => {
		try {
			const params = new URLSearchParams({ map_type: round.mapType });
			const res = await fetch(`/api/sites/${encodeURIComponent(round.siteName)}/map?${params}`);
			if (!res.ok) throw new Error(await res.text());
			const data: MapPayload = await res.json();
			const b = data.bounds;
			const margin = (b.right - b.left) * 0.15;
			const marginV = (b.top - b.bottom) * 0.15;
			const start = { x: randInRange(b.left + margin, b.left + margin * 2), y: randInRange(b.bottom + marginV, b.top - marginV) };
			const end = { x: randInRange(b.right - margin * 2, b.right - margin), y: randInRange(b.bottom + marginV, b.top - marginV) };
			return { start, end };
		} catch {
			return null;
		}
	}, []);

	// ---- Game handlers ----
	const handleStartGame = useCallback(async () => {
		const siteNames = Object.keys(SITE_PRESETS);
		const picked = shufflePick(siteNames, Math.min(5, siteNames.length));

		// Create rounds and pre-generate all start/end points
		const roundPromises = picked.map(async (name) => {
			const round: GameRound = {
				siteName: name,
				mapType: "Elevation",
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

		setRoverSettings(LRV_ROVER);
		setGameState({ active: true, rounds, currentRound: 0, finished: false });
		setShowGameResult(false);
		setShowGameFinish(false);
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
		setGameStartPoint(rounds[0].startPoint);
		setGameEndPoint(rounds[0].endPoint);
		await loadSiteMap(rounds[0].siteName, rounds[0].mapType, "2026-05-13");
	}, [loadSiteMap, generateRoundPoints]);

	const advanceRound = useCallback(async () => {
		if (!gameState) return;
		const next = gameState.currentRound + 1;
		if (next >= gameState.rounds.length) {
			setShowGameFinish(true);
			return;
		}
		setGameState((prev) => prev ? { ...prev, currentRound: next } : prev);
		setGameStartPoint(gameState.rounds[next].startPoint);
		setGameEndPoint(gameState.rounds[next].endPoint);
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
		setShowGameResult(false);
		await loadSiteMap(gameState.rounds[next].siteName, gameState.rounds[next].mapType, "2026-05-13");
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
		const dStart = Math.hypot(first.x - round.startPoint.x, first.y - round.startPoint.y);
		const dEnd = Math.hypot(last.x - round.endPoint.x, last.y - round.endPoint.y);
		if (dStart > radius) {
			alert(`First waypoint is too far from the start marker (${dStart.toFixed(0)}m, max ${radius.toFixed(0)}m). Place a waypoint near the blue S.`);
			return;
		}
		if (dEnd > radius) {
			alert(`Last waypoint is too far from the end marker (${dEnd.toFixed(0)}m, max ${radius.toFixed(0)}m). Place a waypoint near the red E.`);
			return;
		}

		setSimulating(true);
		setManualStats(null);
		setAutoStats(null);

		const simBody = (path_xy: [number, number][]) => JSON.stringify({
			path_xy,
			rover_mass_kg: LRV_ROVER.mass_kg,
			rover_power_hp: LRV_ROVER.power_hp,
			rover_friction_coeff: LRV_ROVER.wheel_friction_coeff,
			rover_crr: LRV_ROVER.rolling_resistance_coeff,
		});

		try {
			// 1. Simulate user path
			const userRes = await fetch(`/api/sites/${encodeURIComponent(currentSite)}/simulate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: simBody(manualPath),
			});
			if (!userRes.ok) throw new Error(await userRes.text());
			const userStats: SimulationStats = await userRes.json();

			// 2. Run autodesign with game weights
			const autoRes = await fetch(`/api/sites/${encodeURIComponent(currentSite)}/autodesign`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					waypoints_xy: [[round.startPoint.x, round.startPoint.y], [round.endPoint.x, round.endPoint.y]],
					slope_weight: 0.3,
					sun_weight: 0.3,
					meteor_weight: 0.05,
					path_mode: "direct",
					rover_mass_kg: LRV_ROVER.mass_kg,
					rover_power_hp: LRV_ROVER.power_hp,
					rover_friction_coeff: LRV_ROVER.wheel_friction_coeff,
					rover_crr: LRV_ROVER.rolling_resistance_coeff,
				}),
			});
			if (!autoRes.ok) throw new Error(await autoRes.text());
			const autoData: AutodesignResult = await autoRes.json();

			// 3. Simulate auto path
			const autoStats: SimulationStats = autoData.path_xy.length >= 2
				? await (await fetch(`/api/sites/${encodeURIComponent(currentSite)}/simulate`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: simBody(autoData.path_xy as [number, number][]),
				})).json()
				: {};

			round.userPath = waypoints;
			round.autoPath = autoData.path_xy;
			round.userStats = userStats;
			round.autoStats = autoStats;
			round.userScore = (userStats["traversal_score"] as number) || 0;
			round.autoScore = (autoStats["traversal_score"] as number) || 0;

			setManualStats(userStats);
			setAutoStats(autoStats);
			setAutodesignResult(autoData);
			setGameState((prev) => prev ? { ...prev, rounds: [...prev.rounds] } : prev);
			setShowGameResult(true);
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
		setRoverSettings(DEFAULT_ROVER);
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
		setCurrentSite("");
		setMapData(null);
		setStatus("idle");
	}, []);

	const currentRound = gameState ? gameState.rounds[gameState.currentRound] : null;

	return (
		<div className="app-layout">
			<MenuBar onStartGame={handleStartGame} />
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
						/>
					</div>
					<div className="resize-handle" onMouseDown={handleResultsResize} />
					<div className="results-area" style={{ height: resultsHeight }}>
						<SimulationResultsPanel
							manualStats={manualStats}
							autoStats={autoStats}
							onSimulate={handleSimulate}
							simulating={simulating}
						/>
					</div>
				</div>
				<div className="sidebar-pane">
					<Sidebar
						onLoadSite={handleLoadSite}
						status={status}
						waypoints={waypoints}
						onAddWaypoint={handleAddWaypoint}
						onRemoveWaypoint={handleRemoveWaypoint}
						onAutodesign={handleAutodesign}
						autodesignRunning={autodesignRunning}
						autodesignResult={autodesignResult}
						roverSettings={roverSettings}
						onRoverChange={handleRoverChange}
						gameState={gameState}
						gameStartPoint={gameStartPoint}
						gameEndPoint={gameEndPoint}
						onFinishPath={handleFinishPath}
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
					userGrade={(currentRound.userStats?.["traversal_grade"] as string) || "F"}
					autoGrade={(currentRound.autoStats?.["traversal_grade"] as string) || "F"}
					onNext={advanceRound}
					isLast={gameState.currentRound >= gameState.rounds.length - 1}
				/>
			)}
			{showGameFinish && gameState && (
				<GameFinishDialog
					rounds={gameState.rounds}
					onFinish={handleGameFinish}
				/>
			)}
		</div>
	);
}

export default App;
