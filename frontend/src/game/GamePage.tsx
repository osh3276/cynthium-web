import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ViewContainer from "../components/ViewContainer";
import GameSidebar from "./GameSidebar";
import Game from "./Game";
import { useGame } from "./useGame";
import { fetchGamesList } from "./api";
import type { MapPayload, Waypoint, AutodesignResult, SimulationStats, GameDefinition, GameData } from "../types";
import type { LoadStatus } from "../App";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "../config";

export default function GamePage() {
	const navigate = useNavigate();
	const [mapData, setMapData] = useState<MapPayload | null>(null);
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [currentSite, setCurrentSite] = useState("");
	const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
	const [autodesignResult, setAutodesignResult] =
			useState<AutodesignResult | null>(null);
	const [, setRoverSettings] = useState({ mass_kg: 530, power_hp: 0.72, wheel_friction_coeff: 0.7, rolling_resistance_coeff: 0.15, battery_capacity_wh: 500, idle_drain_w: 10, target_cruise_speed_mps: 2, max_brake_decel_mps2: 1 });
	const [manualStats, setManualStats] = useState<SimulationStats | null>(null);
	const [autoStats, setAutoStats] = useState<SimulationStats | null>(null);
	const [simulating, setSimulating] = useState(false);
	const loadedSiteRef = useRef("");
	const mapTypeRef = useRef("Elevation");
	const [availableGames, setAvailableGames] = useState<GameDefinition[]>([]);

	// Fetch available games on mount
	useEffect(() => {
		fetchGamesList().then((games) => setAvailableGames(games));
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
		gameWaypoints,
		showGameResult,
		showGameFinish,
		gameLoading,
		showHowToPlay,
		showGamePicker,
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

	const handleChangeMapType = useCallback(
		(mapType: string, date: string) => {
			mapTypeRef.current = mapType;
			if (currentSite) {
				loadSiteMap(currentSite, mapType, date);
			}
		},
		[currentSite, loadSiteMap],
	);

	return (
		<div className="app-layout">
			<header className="app-header">
				<div className="header-brand">
					<span className="header-title">{APP_NAME}</span>
					<span className="header-version">v{APP_VERSION}</span>
				</div>
				<div className="header-tagline">{APP_TAGLINE}</div>
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
							gameWaypoints={gameWaypoints}
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
								gameWaypoints={gameWaypoints}
								waypoints={waypoints}
								onFinishPath={handleFinishPath}
								onNextRound={advanceRound}
								onRemoveWaypoint={handleRemoveWaypoint}
								onUpdateWaypoint={handleUpdateWaypoint}
								onMoveWaypoint={handleMoveWaypoint}
								onClearWaypoints={handleClearWaypoints}
								onAddWaypoint={handleAddWaypoint}
								onChangeMapType={handleChangeMapType}
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
				showGamePicker={showGamePicker}
				availableGames={availableGames}
				onCloseGameResult={handleCloseGameResult}
				onAdvanceRound={advanceRound}
				onGameFinish={handleGameFinish}
				onDismissHowToPlay={() => setShowHowToPlay(false)}
				onPickGame={(gameData: GameData) => handleStartGame(gameData)}
			/>
		</div>
	);
}
