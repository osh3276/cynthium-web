import { MAP_TYPES, SITE_PRESETS } from "../constants";

export default function MapSelectionPanel() {
	const presetNames = Object.keys(SITE_PRESETS).sort();

	return (
		<div className="panel">
			<h3 className="panel-title">Map Selection</h3>

			<div className="field-row">
				<label className="field-label">Map type:</label>
				<select className="field-input" defaultValue="Elevation">
					{MAP_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
			</div>

			<div className="field-row">
				<label className="field-label">Preset maps:</label>
				<select className="field-input" defaultValue="">
					<option value="" disabled>
						Select a map
					</option>
					{presetNames.map((name) => (
						<option key={name} value={name}>
							{name}
						</option>
					))}
				</select>
			</div>

			<div className="datetime-row">
				<div className="datetime-group">
					<label className="field-label">Date</label>
					<input
						className="field-input"
						type="text"
						placeholder="yyyy-mm-dd"
						defaultValue="2026-05-13"
					/>
				</div>
				<div className="datetime-group">
					<label className="field-label">Time</label>
					<input
						className="field-input"
						type="text"
						placeholder="hh:mm:ss"
						defaultValue="16:50:00"
					/>
				</div>
			</div>

			<button className="generate-button" onClick={() => {}}>
				Generate Map
			</button>
		</div>
	);
}
