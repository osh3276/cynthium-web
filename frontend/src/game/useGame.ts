import { useState, useCallback, useRef } from "react";
import type {
	Waypoint,
	AutodesignResult,
	RoverSettings,
	SimulationStats,
	GameState,
	GameRound,
	MapPayload,
	GameData,
} from "../types";
import type { LoadStatus } from "../App";
import { CURIOSITY, ARTEMIS_SR } from "./roverPresets";
import { precalcRound, simulateSegment, findNearestUserWps } from "./api";

interface UseGameDeps {
	loadSiteMap: (siteName: string, mapType: string, date: string) => Promise<void>;
	currentSite: string;
	waypoints: Waypoint[];
	mapData: MapPayload | null;
	mapTypeRef: React.MutableRefObject<string>;
	setCurrentSite: React.Dispatch<React.SetStateAction<string>>;
	setWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
	setAutodesignResult: React.Dispatch<React.SetStateAction<AutodesignResult | null>>;
	setRoverSettings: React.Dispatch<React.SetStateAction<RoverSettings>>;
	setManualStats: React.Dispatch<React.SetStateAction<SimulationStats | null>>;
	setAutoStats: React.Dispatch<React.SetStateAction<SimulationStats | null>>;
	setMapData: React.Dispatch<React.SetStateAction<MapPayload | null>>;
	setStatus: React.Dispatch<React.SetStateAction<LoadStatus>>;
	setSimulating: React.Dispatch<React.SetStateAction<boolean>>;
	onFinish?: () => void;
}

export function useGame(deps: UseGameDeps) {
	const {
		loadSiteMap,
		currentSite,
		waypoints,
		mapData,
		mapTypeRef,
		setCurrentSite,
		setWaypoints,
		setAutodesignResult,
		setRoverSettings,
		setManualStats,
		setAutoStats,
		setMapData,
		setStatus,
		setSimulating,
	} = deps;

	const [gameState, setGameState] = useState<GameState | null>(null);
	const [gameWaypoints, setGameWaypoints] = useState<Waypoint[]>([]);
	const [showGameResult, setShowGameResult] = useState(false);
	const [pendingGameResult, setPendingGameResult] = useState(false);
	const [showGameFinish, setShowGameFinish] = useState(false);
	const [gameLoading, setGameLoading] = useState(false);
	const [showHowToPlay, setShowHowToPlay] = useState(false);
	// Game picker state
	const [showGamePicker, setShowGamePicker] = useState(true);
	const [, setGameName] = useState("");
	const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCloseGameResult = useCallback(() => {
		setShowGameResult(false);
	}, []);

	/**
	 * Start a game from a loaded GameData definition.
	 * Creates rounds and pre-calculates auto paths.
	 */
	const handleStartGame = useCallback(async (gameData: GameData) => {
		setGameLoading(true);
		setGameName(gameData.name);
		try {
			const rounds: GameRound[] = gameData.rounds.map((r) => ({
				siteName: r.siteName,
				mapType: r.mapType,
				waypoints: r.waypoints,
				userPath: [],
				autoPath: null,
				userStats: null,
				autoStats: null,
				userScore: 0,
				autoScore: 0,
			}));

			setRoverSettings(ARTEMIS_SR);
			setGameState({
				active: true,
				rounds,
				currentRound: 0,
				finished: false,
			});
			setShowGameResult(false);
			setShowGameFinish(false);
			setShowGamePicker(false);
			setWaypoints([]);
			setAutodesignResult(null);
			setManualStats(null);
			setAutoStats(null);
			setGameWaypoints(rounds[0].waypoints);
			await loadSiteMap(
				rounds[0].siteName,
				rounds[0].mapType,
				"2026-05-13",
			);

			await precalcRound(rounds[0], rounds[0].siteName);
		} finally {
			setGameLoading(false);
			setShowHowToPlay(true);
		}
	}, [loadSiteMap, setRoverSettings, setWaypoints,
		setAutodesignResult, setManualStats, setAutoStats]);

	const advanceRound = useCallback(async () => {
		if (!gameState) return;

		// If result exists but dialog isn't showing yet, show it immediately
		const roundResultsExist = gameState.rounds[gameState.currentRound]?.userStats != null;
		if (pendingGameResult || (roundResultsExist && !showGameResult)) {
			if (resultTimeoutRef.current) {
				clearTimeout(resultTimeoutRef.current);
				resultTimeoutRef.current = null;
			}
			setPendingGameResult(false);
			setShowGameResult(true);
			return;
		}

		const next = gameState.currentRound + 1;
		if (next >= gameState.rounds.length) {
			setShowGameFinish(true);
			return;
		}
		const nextRound = gameState.rounds[next];
		const mt = mapTypeRef.current;
		nextRound.mapType = mt;
		setGameState((prev) => (prev ? { ...prev, currentRound: next } : prev));
		setGameWaypoints(nextRound.waypoints);
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

		if (!nextRound.autoPath) {
			await precalcRound(nextRound, nextRound.siteName);
		}
	}, [gameState, loadSiteMap, mapTypeRef, setWaypoints,
		setAutodesignResult, setManualStats, setAutoStats,
		pendingGameResult, showGameResult]);

	const handleFinishPath = useCallback(async () => {
		if (!gameState || !currentSite || !mapData) return;
		const round = gameState.rounds[gameState.currentRound];
		const manualPath = waypoints.map((w) => [w.x, w.y] as [number, number]);
		if (manualPath.length < 2) return;

		// Validate that user's path visits each required waypoint in order
		const b = mapData.bounds;
		const radius = Math.max(b.right - b.left, b.top - b.bottom) * 0.05;
		const required = round.waypoints;
		if (required.length < 2) return;

		// Check first user waypoint is near first required waypoint
		const first = waypoints[0];
		const dFirst = Math.hypot(
			first.x - required[0].x,
			first.y - required[0].y,
		);
		if (dFirst > radius) {
			alert(
				`First waypoint is too far from waypoint 1 (${dFirst.toFixed(0)}m, max ${radius.toFixed(0)}m). Place a waypoint near marker 1.`,
			);
			return;
		}

		// Check last user waypoint is near last required waypoint
		const last = waypoints[waypoints.length - 1];
		const dLast = Math.hypot(
			last.x - required[required.length - 1].x,
			last.y - required[required.length - 1].y,
		);
		if (dLast > radius) {
			alert(
				`Last waypoint is too far from waypoint ${required.length} (${dLast.toFixed(0)}m, max ${radius.toFixed(0)}m). Place a waypoint near marker ${required.length}.`,
			);
			return;
		}

		// Check intermediate required waypoints have a user waypoint nearby
		for (let i = 1; i < required.length - 1; i++) {
			const req = required[i];
			let found = false;
			for (const uwp of waypoints) {
				const d = Math.hypot(uwp.x - req.x, uwp.y - req.y);
				if (d <= radius) { found = true; break; }
			}
			if (!found) {
				alert(
					`No waypoint near required waypoint ${i + 1} (within ${radius.toFixed(0)}m). Place a waypoint near marker ${i + 1}.`,
				);
				return;
			}
		}

		setSimulating(true);
		setManualStats(null);

		try {
			const required = round.waypoints;
			const nearestWps = findNearestUserWps(required, waypoints);

			// Simulate each segment between consecutive required waypoints
			// using the nearest user waypoints as endpoints
			const segmentPromises: Promise<SimulationStats | null>[] = [];
			const segmentPaths: [number, number][][] = [];

			for (let i = 0; i < required.length - 1; i++) {
				const a = nearestWps[i];
				const b = nearestWps[i + 1];
				if (!a || !b) continue;

				// Find user waypoints between these two endpoints
				const idxA = waypoints.indexOf(a);
				const idxB = waypoints.indexOf(b);
				const startIdx = Math.min(idxA, idxB);
				const endIdx = Math.max(idxA, idxB);
				const segPath = waypoints
					.slice(startIdx, endIdx + 1)
					.map((wp) => [wp.x, wp.y] as [number, number]);

				if (segPath.length >= 2) {
					segmentPaths.push(segPath);
					segmentPromises.push(simulateSegment(currentSite, segPath));
				}
			}

			const segResults = await Promise.all(segmentPromises);

			// Score each segment
			const userScores: number[] = [];
			const userFeasibles: boolean[] = [];
			let firstStats: SimulationStats | null = null;

			for (let i = 0; i < segResults.length; i++) {
				const stats = segResults[i];
				if (!stats) continue;
				if (!firstStats) firstStats = stats;
				const feasible = (stats["traverse_feasible"] as number) >= 0.5;
				userFeasibles.push(feasible);
				userScores.push(
					feasible ? (stats["traversal_score"] as number) || 0 : 0,
				);
			}

			// Auto scores (already per-segment from precalcRound)
			const autoStats: SimulationStats = round.autoStats || {};
			const autoFeasible =
				(autoStats["traverse_feasible"] as number) >= 0.5;
			const autoScore = autoFeasible
				? (autoStats["traversal_score"] as number) || 0
				: 0;

			// Average user segment scores
			const userAvgScore =
				userScores.length > 0
					? userScores.reduce((a, b) => a + b, 0) / userScores.length
					: 0;

			const anyUserFeasible = userFeasibles.some(Boolean);
			const bothFailed = !anyUserFeasible && !autoFeasible;

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
				// Average fail distance across segments
				let totalUserFailScore = 0;
				let failCount = 0;
				for (let i = 0; i < segResults.length; i++) {
					const reqA = required[i];
					const reqB = required[i + 1];
					if (reqA && reqB) {
						totalUserFailScore += failDistScore(segResults[i], reqA, reqB);
						failCount++;
					}
				}
				round.userScore = failCount > 0 ? Math.round(totalUserFailScore / failCount) : 0;

				// For auto, use the score from autoStats (already averaged in precalcRound)
				round.autoScore = autoFeasible
					? (autoStats["traversal_score"] as number) || 0
					: 0;
			} else {
				round.userScore = anyUserFeasible
					? Math.round(userAvgScore)
					: 0;
				round.autoScore = autoFeasible
					? Math.round(autoScore)
					: 0;
			}

			round.userPath = waypoints;
			round.userStats = firstStats || {};
			setManualStats(firstStats);

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
			const msg = err instanceof Error ? err.message : String(err);
			try {
				const parsed = JSON.parse(msg);
				if (parsed.detail) {
					alert(parsed.detail);
				} else {
					alert(msg);
				}
			} catch {
				alert(msg);
			}
		} finally {
			setSimulating(false);
		}
	}, [gameState, currentSite, waypoints, mapData, setSimulating,
		setManualStats, setAutoStats, setAutodesignResult]);

	const handleGameFinish = useCallback(() => {
		setGameState(null);
		setGameWaypoints([]);
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
		setShowGamePicker(true);
		deps.onFinish?.();
	}, [setRoverSettings, setWaypoints, setAutodesignResult,
		setManualStats, setAutoStats, setCurrentSite, setMapData, setStatus,
		deps.onFinish]);

	const handleAnimationsComplete = useCallback(() => {
		if (pendingGameResult) {
			setPendingGameResult(false);
			resultTimeoutRef.current = setTimeout(() => {
				setShowGameResult(true);
				resultTimeoutRef.current = null;
			}, 1000);
		}
	}, [pendingGameResult]);

	const currentRound = gameState
		? gameState.rounds[gameState.currentRound]
		: null;

	return {
		gameState,
		gameWaypoints,
		showGameResult,
		showGameFinish,
		gameLoading,
		showHowToPlay,
		showGamePicker,
		setShowHowToPlay,
		setShowGamePicker,
		pendingGameResult,
		handleCloseGameResult,
		handleStartGame,
		advanceRound,
		handleFinishPath,
		handleGameFinish,
		handleAnimationsComplete,
		currentRound,
	};
}
