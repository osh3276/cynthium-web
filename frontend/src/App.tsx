import MenuBar from "./components/MenuBar";
import ViewContainer from "./components/ViewContainer";
import SimulationResultsPanel from "./components/SimulationResultsPanel";
import Sidebar from "./components/Sidebar";
import "./App.css";

function App() {
	return (
		<div className="app-layout">
			<MenuBar />
			<div className="main-content">
				<div className="left-pane">
					<div className="view-area">
						<ViewContainer />
					</div>
					<div className="results-area">
						<SimulationResultsPanel />
					</div>
				</div>
				<div className="sidebar-pane">
					<Sidebar />
				</div>
			</div>
		</div>
	);
}

export default App;
