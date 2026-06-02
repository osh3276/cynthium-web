import { useState, useCallback } from "react";
import MenuBar from "./components/MenuBar";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import { type MapPayload, type Waypoint, type AutopathResult, type AutopathConfig } from "./types";
import "./App.css";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

function App() {
	const [mapData, setMapData] = useState<MapPayload | null>(null);
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [errorMsg, setErrorMsg] = useState("");
	const [currentSite, setCurrentSite] = useState("");
	const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
	const [autopathResult, setAutopathResult] = useState<AutopathResult | null>(null);
	const [autopathRunning, setAutopathRunning] = useState(false);

	const handleLoadSite = useCallback(async (siteName: string, mapType: string) => {
		setCurrentSite(siteName);
		setStatus("loading");
		setErrorMsg("");
		setWaypoints([]);
		setAutopathResult(null);
		try {
			const params = new URLSearchParams({ map_type: mapType });
			const res = await fetch(`/api/sites/${encodeURIComponent(siteName)}/map?${params}`);
			if (!res.ok) throw new Error(await res.text());
			const data: MapPayload = await res.json();
			setMapData(data);
			setStatus("loaded");
		} catch (err) {
			setStatus("error");
			setErrorMsg(String(err));
		}
	}, []);

	const handleAddWaypoint = useCallback((wp: Waypoint) => {
		setWaypoints((prev) => [...prev, wp]);
		setAutopathResult(null);
	}, []);

	const handleRemoveWaypoint = useCallback((index: number) => {
		setWaypoints((prev) => prev.filter((_, i) => i !== index));
		setAutopathResult(null);
	}, []);

	const handleAutopath = useCallback(async (config: AutopathConfig) => {
		if (waypoints.length < 2 || !currentSite) return;
		setAutopathRunning(true);
		setAutopathResult(null);
		try {
			const res = await fetch(`/api/sites/${encodeURIComponent(currentSite)}/autopath`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					waypoints_xy: waypoints.map((w) => [w.x, w.y]),
					...config,
				}),
			});
			if (!res.ok) throw new Error(await res.text());
			const data: AutopathResult = await res.json();
			setAutopathResult(data);
		} catch (err) {
			setErrorMsg(String(err));
		} finally {
			setAutopathRunning(false);
		}
	}, [waypoints, currentSite]);

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
							autopathResult={autopathResult}
							onAddWaypoint={handleAddWaypoint}
						/>
						{status === "error" && <div className="view-error">{errorMsg}</div>}
					</div>
					<div className="results-area">
						<SimulationResultsPanel />
					</div>
				</div>
				<div className="sidebar-pane">
					<Sidebar
						onLoadSite={handleLoadSite}
						status={status}
						waypoints={waypoints}
						onAddWaypoint={handleAddWaypoint}
						onRemoveWaypoint={handleRemoveWaypoint}
						onAutopath={handleAutopath}
						autopathRunning={autopathRunning}
						autopathResult={autopathResult}
					/>
				</div>
			</div>
		</div>
	);
}

export default App;
