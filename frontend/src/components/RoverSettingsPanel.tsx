import { useCallback } from "react";
import type { RoverSettings } from "../types";

interface Props {
	settings: RoverSettings;
	onChange: (settings: RoverSettings) => void;
}

export default function RoverSettingsPanel({ settings, onChange }: Props) {
	const handleChange = useCallback(
		(field: keyof RoverSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
			const val = parseFloat(e.target.value);
			if (!isNaN(val) && val > 0) {
				onChange({ ...settings, [field]: val });
			}
		},
		[settings, onChange],
	);

	return (
		<div className="panel">
			<h3 className="panel-title">Rover Settings</h3>

			<div className="field-row">
				<label className="field-label">Rover mass (kg):</label>
				<input
					className="field-input"
					type="text"
					value={settings.mass_kg}
					onChange={handleChange("mass_kg")}
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Rover power (hp):</label>
				<input
					className="field-input"
					type="text"
					value={settings.power_hp}
					onChange={handleChange("power_hp")}
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Wheel friction coeff (μ):</label>
				<input
					className="field-input"
					type="text"
					value={settings.wheel_friction_coeff}
					onChange={handleChange("wheel_friction_coeff")}
				/>
			</div>

			<div className="field-row">
				<label className="field-label">Rolling resistance (Crr):</label>
				<input
					className="field-input"
					type="text"
					value={settings.rolling_resistance_coeff}
					onChange={handleChange("rolling_resistance_coeff")}
				/>
			</div>
		</div>
	);
}
