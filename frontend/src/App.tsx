import { useState, useCallback } from "react";
import MenuBar from "./components/MenuBar";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import { type MapPayload } from "./types";
import "./App.css";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

function App() {
	const [mapData, setMapData] = useState<MapPayload | null>(null);
	const [status, setStatus] = useState<LoadStatus>("idle");
	const [errorMsg, setErrorMsg] = useState("");

	const handleLoadSite = useCallback(async (siteName: string, mapType: string) => {
		setStatus("loading");
		setErrorMsg("");
		try {
			const params = new URLSearchParams({ map_type: mapType });
			const res = await fetch(`/api/sites/${encodeURIComponent(siteName)}/map?${params}`);
			if (!res.ok) {
				throw new Error(await res.text());
			}
			const data: MapPayload = await res.json();
			setMapData(data);
			setStatus("loaded");
		} catch (err) {
			setStatus("error");
			setErrorMsg(String(err));
		}
	}, []);

	return (
		<div className="app-layout">
			<MenuBar />
			<div className="main-content">
				<div className="left-pane">
					<div className="view-area">
						<ViewContainer mapData={mapData} status={status} />
						{status === "error" && <div className="view-error">{errorMsg}</div>}
					</div>
					<div className="results-area">
						<SimulationResultsPanel />
					</div>
				</div>
				<div className="sidebar-pane">
					<Sidebar onLoadSite={handleLoadSite} status={status} />
				</div>
			</div>
		</div>
	);
}

export default App;
