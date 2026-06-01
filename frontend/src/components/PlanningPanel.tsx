export default function PlanningPanel() {
	return (
		<div className="panel">
			<h3 className="panel-title">Planning</h3>

			<label className="field-label">Coordinate:</label>
			<input
				className="field-input"
				type="text"
				placeholder="x,y"
			/>

			<button className="panel-button" onClick={() => {}}>
				Add waypoint
			</button>

			<label className="field-label">Waypoints:</label>
			<textarea
				className="field-textarea"
				readOnly
				value=""
				placeholder=""
			/>

			<div className="field-row">
				<label className="field-label">Delete waypoint:</label>
				<input
					className="field-input field-input-narrow"
					type="text"
					placeholder="Num"
				/>
				<button className="panel-button panel-button-sm" onClick={() => {}}>
					Delete
				</button>
			</div>

			<button className="panel-button" onClick={() => {}}>
				Autopath
			</button>

			<label className="field-label">Autopath waypoints:</label>
			<textarea
				className="field-textarea"
				readOnly
				value=""
				placeholder="(autopath output will appear here)"
			/>

			<div className="field-row">
				<label className="field-label">Min slope (deg):</label>
				<input
					className="field-input field-input-narrow"
					type="text"
					defaultValue="0"
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Max slope (deg):</label>
				<input
					className="field-input field-input-narrow"
					type="text"
					defaultValue="20"
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Slope weight:</label>
				<input
					className="field-input field-input-narrow"
					type="text"
					defaultValue="1.0"
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Sun weight:</label>
				<input
					className="field-input field-input-narrow"
					type="text"
					defaultValue="0.5"
				/>
			</div>
		</div>
	);
}
