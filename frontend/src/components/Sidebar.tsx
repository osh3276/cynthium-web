import MapSelectionPanel from "./MapSelectionPanel";
import PlanningPanel from "./PlanningPanel";
import RoverSettingsPanel from "./RoverSettingsPanel";

export default function Sidebar() {
	return (
		<aside className="sidebar">
			<div className="sidebar-scroll">
				<MapSelectionPanel />
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
