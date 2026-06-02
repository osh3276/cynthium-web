import MapSelectionPanel from "./MapSelectionPanel";
import PlanningPanel from "./PlanningPanel";
import RoverSettingsPanel from "./RoverSettingsPanel";
import type { LoadStatus } from "../App";
import type { Waypoint, AutopathResult, AutopathConfig } from "../types";

interface Props {
	onLoadSite: (siteName: string, mapType: string) => void;
	status: LoadStatus;
	waypoints: Waypoint[];
	onAddWaypoint: (wp: Waypoint) => void;
	onRemoveWaypoint: (index: number) => void;
	onAutopath: (config: AutopathConfig) => void;
	autopathRunning: boolean;
	autopathResult: AutopathResult | null;
}

export default function Sidebar({
	onLoadSite, status, waypoints, onAddWaypoint,
	onRemoveWaypoint, onAutopath, autopathRunning, autopathResult,
}: Props) {
	return (
		<aside className="sidebar">
			<div className="sidebar-scroll">
				<MapSelectionPanel onLoadSite={onLoadSite} status={status} />
				<div className="sidebar-divider" />
				<PlanningPanel
					waypoints={waypoints}
					onAddWaypoint={onAddWaypoint}
					onRemoveWaypoint={onRemoveWaypoint}
					onAutopath={onAutopath}
					autopathRunning={autopathRunning}
					autopathResult={autopathResult}
				/>
				<div className="sidebar-divider" />
				<RoverSettingsPanel />
				<button className="simulation-button" onClick={() => {}}>
					Start simulation
				</button>
			</div>
		</aside>
	);
}
