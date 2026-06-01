const ROVER_DEFAULTS = {
	mass: "150.0",
	power: "0.2",
	friction: "0.6",
	crr: "0.1",
};

export default function RoverSettingsPanel() {
	return (
		<div className="panel">
			<h3 className="panel-title">Rover Settings</h3>

			<div className="field-row">
				<label className="field-label">Rover mass (kg):</label>
				<input
					className="field-input"
					type="text"
					placeholder="kg"
					defaultValue={ROVER_DEFAULTS.mass}
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Rover power (hp):</label>
				<input
					className="field-input"
					type="text"
					placeholder="hp"
					defaultValue={ROVER_DEFAULTS.power}
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Wheel friction coeff (μ):</label>
				<input
					className="field-input"
					type="text"
					placeholder="mu"
					defaultValue={ROVER_DEFAULTS.friction}
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Rolling resistance (Crr):</label>
				<input
					className="field-input"
					type="text"
					placeholder="crr"
					defaultValue={ROVER_DEFAULTS.crr}
				/>
			</div>
		</div>
	);
}
