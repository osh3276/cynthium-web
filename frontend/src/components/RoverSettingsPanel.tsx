import { useCallback } from "react";
import type { RoverSettings } from "../types";

interface Props {
	settings: RoverSettings;
	onChange: (settings: RoverSettings) => void;
}

const PRESETS: Record<string, RoverSettings> = {
	Custom: { mass_kg: 150, power_hp: 0.2, wheel_friction_coeff: 0.6, rolling_resistance_coeff: 0.1 },
	"Apollo LRV": { mass_kg: 210, power_hp: 1.0, wheel_friction_coeff: 0.6, rolling_resistance_coeff: 0.021 },
};

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

	const handlePreset = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
		const preset = PRESETS[e.target.value];
		if (preset) onChange(preset);
	}, [onChange]);

	const currentPreset = Object.entries(PRESETS).find(
		([_, p]) => p.mass_kg === settings.mass_kg && p.power_hp === settings.power_hp
			&& p.wheel_friction_coeff === settings.wheel_friction_coeff
			&& p.rolling_resistance_coeff === settings.rolling_resistance_coeff
	)?.[0] ?? "Custom";

	return (
		<div className="panel">
			<h3 className="panel-title">Rover Settings</h3>

			<div className="field-row">
				<label className="field-label">Preset:</label>
				<select className="field-input" value={currentPreset} onChange={handlePreset}>
					{Object.keys(PRESETS).map((name) => (
						<option key={name} value={name}>{name}</option>
					))}
				</select>
			</div>

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
