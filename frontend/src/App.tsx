import { useState, useCallback, useRef } from "react";
import MenuBar from "./components/MenuBar";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import { type MapPayload, type Waypoint, type AutodesignResult, type AutodesignConfig, type RoverSettings, type SimulationStats } from "./types";
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

	const handleLoadSite = useCallback(async (siteName: string, mapType: string, date: string) => {
		const sameSite = siteName === currentSite;
		setCurrentSite(siteName);
		setStatus("loading");
		if (!sameSite) {
			setWaypoints([]);
			setAutodesignResult(null);
			setManualStats(null);
			setAutoStats(null);
		}
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
	}, [currentSite]);

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
						rover_friction_coeff: config.rover_friction_coeff,
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

		const body = (path_xy: [number, number][]) => JSON.stringify({
			path_xy,
			rover_mass_kg: roverSettings.mass_kg,
			rover_power_hp: roverSettings.power_hp,
			rover_friction_coeff: roverSettings.wheel_friction_coeff,
			rover_crr: roverSettings.rolling_resistance_coeff,
		});

		const run = async (label: string, path_xy: [number, number][]) => {
			const res = await fetch(`/api/sites/${encodeURIComponent(currentSite)}/simulate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: body(path_xy),
			});
			if (!res.ok) throw new Error(`${label}: ${await res.text()}`);
			return await res.json() as SimulationStats;
		};

		const promises: Promise<void>[] = [];

		if (manualPath.length >= 2) {
			promises.push(
				run("Manual", manualPath).then((s) => setManualStats(s))
			);
		}
		if (autoPath && autoPath.length >= 2) {
			promises.push(
				run("Auto", autoPath).then((s) => setAutoStats(s))
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

	return (
		<div className="app-layout">
			<MenuBar />
			<div className="main-content">
				<div className="left-pane">
					<div className="view-area">
						<ViewContainer
							mapData={mapData}
							status={status}
							waypoints={waypoints}
							autodesignResult={autodesignResult}
							onAddWaypoint={handleAddWaypoint}
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
					/>
				</div>
			</div>
		</div>
	);
}

export default App;
