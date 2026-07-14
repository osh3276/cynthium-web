import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ViewContainer from "../components/ViewContainer";
import GameSidebar from "./GameSidebar";
import Game from "./Game";
import { useGame } from "./useGame";
import type { MapPayload, Waypoint, AutodesignResult, SimulationStats } from "../types";
import type { LoadStatus } from "../App";

export default function GamePage() {
	const navigate = useNavigate();
	const [mapData, setMapData] = useState<MapPayload | null>(null);
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [currentSite, setCurrentSite] = useState("");
	const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
	const [autodesignResult, setAutodesignResult] =
		useState<AutodesignResult | null>(null);
	const [, setRoverSettings] = useState({ mass_kg: 530, power_hp: 0.72, wheel_friction_coeff: 0.7, rolling_resistance_coeff: 0.15 });
	const [manualStats, setManualStats] = useState<SimulationStats | null>(null);
	const [autoStats, setAutoStats] = useState<SimulationStats | null>(null);
	const [simulating, setSimulating] = useState(false);
	const loadedSiteRef = useRef("");
	const mapTypeRef = useRef("Elevation");

	const loadSiteMap = useCallback(
		async (siteName: string, mapType: string, date: string) => {
			loadedSiteRef.current = siteName;
			setCurrentSite(siteName);
			setStatus("loading");
			setWaypoints([]);
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
				const msg = err instanceof Error ? err.message : String(err);
				try {
					const parsed = JSON.parse(msg);
					if (parsed.detail) alert(parsed.detail);
					else alert(msg);
				} catch { alert(msg); }
			}
		},
		[],
	);

	const {
		gameState,
		gameStartPoint,
		gameEndPoint,
		showGameResult,
		showGameFinish,
		gameLoading,
		showHowToPlay,
		setShowHowToPlay,
		handleCloseGameResult,
		handleStartGame,
		advanceRound,
		handleFinishPath,
		handleGameFinish,
		handleAnimationsComplete,
		currentRound,
	} = useGame({
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
		onFinish: () => navigate("/"),
	});

	const handleAddWaypoint = useCallback(
				(wp: Waypoint) => {
					if (showGameResult || showGameFinish) return;
					setWaypoints((prev) => [...prev, wp]);
					setAutodesignResult(null);
				},
				[showGameResult, showGameFinish],
			);

	const handleUpdateWaypoint = useCallback((index: number, wp: Waypoint) => {
		if (showGameResult || showGameFinish) return;
		setWaypoints((prev) => {
			const next = [...prev];
			next[index] = wp;
			return next;
		});
		setAutodesignResult(null);
	}, [showGameResult, showGameFinish]);

	const handleMoveWaypoint = useCallback((fromIndex: number, toIndex: number) => {
		if (showGameResult || showGameFinish) return;
		setWaypoints((prev) => {
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
		setAutodesignResult(null);
	}, [showGameResult, showGameFinish]);

	const handleRemoveWaypoint = useCallback((index: number) => {
		if (showGameResult || showGameFinish) return;
		setWaypoints((prev) => prev.filter((_, i) => i !== index));
		setAutodesignResult(null);
	}, [showGameResult, showGameFinish]);

	const handleClearWaypoints = useCallback(() => {
		if (showGameResult || showGameFinish) return;
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
	}, [showGameResult, showGameFinish]);

	// Auto-start game on mount
	useEffect(() => {
		handleStartGame();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

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
							onUpdateWaypoint={handleUpdateWaypoint}
							gameStartPoint={gameStartPoint}
							gameEndPoint={gameEndPoint}
							manualStats={manualStats}
							autoStats={autoStats}
							onAnimationsComplete={handleAnimationsComplete}
						/>
					</div>
				</div>
				{gameState && (
					<div className="sidebar-pane">
						<GameSidebar
								gameState={gameState}
								gameStartPoint={gameStartPoint}
								gameEndPoint={gameEndPoint}
								waypoints={waypoints}
								onFinishPath={handleFinishPath}
								onNextRound={advanceRound}
								onRemoveWaypoint={handleRemoveWaypoint}
								onUpdateWaypoint={handleUpdateWaypoint}
								onMoveWaypoint={handleMoveWaypoint}
								onClearWaypoints={handleClearWaypoints}
								onAddWaypoint={handleAddWaypoint}
								simulating={simulating}
							/>
					</div>
				)}
			</div>
			<Game
				gameState={gameState}
				currentRound={currentRound}
				showGameResult={showGameResult}
				showGameFinish={showGameFinish}
				gameLoading={gameLoading}
				showHowToPlay={showHowToPlay}
				onCloseGameResult={handleCloseGameResult}
				onAdvanceRound={advanceRound}
				onGameFinish={handleGameFinish}
				onDismissHowToPlay={() => setShowHowToPlay(false)}
			/>
		</div>
	);
}
