import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import {
	type MapPayload,
	type Waypoint,
	type AutodesignResult,
	type AutodesignConfig,
	type RoverSettings,
	type SimulationStats,
} from "./types";
import { CURIOSITY } from "./game";
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

function App() {
	const navigate = useNavigate();
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
	const resultsAreaRef = useRef<HTMLDivElement>(null);
	const resizeRef = useRef<boolean>(false);
	const loadedSiteRef = useRef("");
	const mapTypeRef = useRef("Elevation");

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
			loadSiteMap(siteName, mapType, date);
		},
		[loadSiteMap],
	);

	const handleChangeMapType = useCallback(
		(mapType: string, date: string) => {
			mapTypeRef.current = mapType;
			if (currentSite) {
				loadSiteMap(currentSite, mapType, date);
			}
		},
		[loadSiteMap, currentSite],
	);

	const handleAddWaypoint = useCallback(
		(wp: Waypoint) => {
			setWaypoints((prev) => [...prev, wp]);
			setAutodesignResult(null);
		},
		[],
	);

	const handleRemoveWaypoint = useCallback((index: number) => {
			setWaypoints((prev) => prev.filter((_, i) => i !== index));
			setAutodesignResult(null);
		}, []);

	const handleUpdateWaypoint = useCallback((index: number, wp: Waypoint) => {
		setWaypoints((prev) => {
			const next = [...prev];
			next[index] = wp;
			return next;
		});
		setAutodesignResult(null);
	}, []);

	const handleMoveWaypoint = useCallback((fromIndex: number, toIndex: number) => {
		setWaypoints((prev) => {
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
		setAutodesignResult(null);
	}, []);

	const handleClearWaypoints = useCallback(() => {
		setWaypoints([]);
		setAutodesignResult(null);
		setManualStats(null);
		setAutoStats(null);
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
							rover_battery_capacity_wh: 500.0,
							rover_idle_drain_w: 10.0,
							rover_target_cruise_speed_mps: 2.0,
							rover_max_brake_decel_mps2: 1.0,
						}),
					},
				);
				if (!res.ok) throw new Error(await res.text());
				const data: AutodesignResult = await res.json();
				setAutodesignResult(data);
				if (data.simulation) {
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
				rover_battery_capacity_wh: rover.battery_capacity_wh,
				rover_idle_drain_w: rover.idle_drain_w,
				rover_target_cruise_speed_mps: rover.target_cruise_speed_mps,
				rover_max_brake_decel_mps2: rover.max_brake_decel_mps2,
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
			const panelEl = resultsAreaRef.current?.querySelector(
				".simulation-results",
			) as HTMLElement | null;
			let minResultsHeight = 100;
			if (panelEl) {
				const headerEl = panelEl.querySelector(
					".results-header",
				) as HTMLElement | null;
				const statusEl = panelEl.querySelector(
					".results-status",
				) as HTMLElement | null;
				const scrollEl = panelEl.querySelector(
					".results-scroll",
				) as HTMLElement | null;
				const panelStyle = window.getComputedStyle(panelEl);
				const panelPaddingY =
					parseFloat(panelStyle.paddingTop) +
					parseFloat(panelStyle.paddingBottom);
				const panelGap =
					parseFloat(panelStyle.rowGap || panelStyle.gap || "0") * 2;
				const scrollContentHeight = scrollEl
					? Array.from(scrollEl.children).reduce((sum, child) => {
							return sum + (child as HTMLElement).scrollHeight;
						}, 0)
					: 0;
				minResultsHeight = Math.ceil(
					panelPaddingY +
						panelGap +
						(headerEl?.offsetHeight ?? 0) +
						(statusEl?.offsetHeight ?? 0) +
						scrollContentHeight,
				);
			}
			const onMove = (me: MouseEvent) => {
				if (!resizeRef.current) return;
				const dy = me.clientY - startY;
				const newH = Math.max(
					minResultsHeight,
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
							gameStartPoint={null}
							gameEndPoint={null}
							manualStats={manualStats}
							autoStats={autoStats}
						/>
					</div>
					<div
						className="resize-handle"
						onMouseDown={handleResultsResize}
					/>
					<div
						className="results-area"
						ref={resultsAreaRef}
						style={{ height: resultsHeight }}
					>
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
						onChangeMapType={handleChangeMapType}
						status={status}
						waypoints={waypoints}
						onAddWaypoint={handleAddWaypoint}
						onRemoveWaypoint={handleRemoveWaypoint}
						onUpdateWaypoint={handleUpdateWaypoint}
						onMoveWaypoint={handleMoveWaypoint}
						onClearWaypoints={handleClearWaypoints}
						onAutodesign={handleAutodesign}
						autodesignRunning={autodesignRunning}
						autodesignResult={autodesignResult}
						roverSettings={roverSettings}
						onRoverChange={handleRoverChange}
						onStartGame={() => navigate("/game")}
						simulating={simulating}
					/>
				</div>
			</div>
		</div>
	);
}

export default App;
