import MapSelectionPanel from "./MapSelectionPanel";
import PlanningPanel from "./PlanningPanel";
import RoverSettingsPanel from "./RoverSettingsPanel";
import type { LoadStatus } from "../App";

interface Props {
	onLoadSite: (siteName: string) => void;
	status: LoadStatus;
}

export default function Sidebar({ onLoadSite, status }: Props) {
	return (
		<aside className="sidebar">
			<div className="sidebar-scroll">
				<MapSelectionPanel onLoadSite={onLoadSite} status={status} />
				<div className="sidebar-divider" />
				<PlanningPanel />
				<div className="sidebar-divider" />
				<RoverSettingsPanel />
				<button className="simulation-button" onClick={() => {}}>
					Start simulation
				</button>
			</div>
		</aside>
	);
}
