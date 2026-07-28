import { useCallback, useEffect, useState } from "react";
import type { RoverSettings } from "../types";

interface Props {
	settings: RoverSettings;
	onChange: (settings: RoverSettings) => void;
	readOnly?: boolean;
}

const PRESETS: Record<string, RoverSettings> = {
		Custom: { mass_kg: 150, power_hp: 0.2, wheel_friction_coeff: 0.6, rolling_resistance_coeff: 0.1, battery_capacity_wh: 500, idle_drain_w: 10 },
		"Apollo LRV": { mass_kg: 210, power_hp: 1.0, wheel_friction_coeff: 0.6, rolling_resistance_coeff: 0.021, battery_capacity_wh: 500, idle_drain_w: 10 },
		"Artemis SR": { mass_kg: 530, power_hp: 0.72, wheel_friction_coeff: 0.7, rolling_resistance_coeff: 0.15, battery_capacity_wh: 500, idle_drain_w: 10 },
	};

type Field = keyof RoverSettings;

export default function RoverSettingsPanel({ settings, onChange, readOnly }: Props) {
	const [fieldStrings, setFieldStrings] = useState<Record<Field, string>>(() => ({
		mass_kg: String(settings.mass_kg),
		power_hp: String(settings.power_hp),
		wheel_friction_coeff: String(settings.wheel_friction_coeff),
		rolling_resistance_coeff: String(settings.rolling_resistance_coeff),
		battery_capacity_wh: String(settings.battery_capacity_wh),
		idle_drain_w: String(settings.idle_drain_w),
	}));

	// Sync local strings when settings change externally (preset, game init, etc.)
	useEffect(() => {
		setFieldStrings((prev) => {
			const next: Record<Field, string> = {
				mass_kg: String(settings.mass_kg),
				power_hp: String(settings.power_hp),
				wheel_friction_coeff: String(settings.wheel_friction_coeff),
				rolling_resistance_coeff: String(settings.rolling_resistance_coeff),
				battery_capacity_wh: String(settings.battery_capacity_wh),
				idle_drain_w: String(settings.idle_drain_w),
			};
			// Only update if different — don't clobber in-progress typing
			if (
				prev.mass_kg === next.mass_kg &&
				prev.power_hp === next.power_hp &&
				prev.wheel_friction_coeff === next.wheel_friction_coeff &&
				prev.rolling_resistance_coeff === next.rolling_resistance_coeff &&
				prev.battery_capacity_wh === next.battery_capacity_wh &&
				prev.idle_drain_w === next.idle_drain_w
			) {
				return prev;
			}
			return next;
		});
	}, [settings]);

	const handleChange = useCallback(
		(field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
			if (readOnly) return;
			setFieldStrings((prev) => ({ ...prev, [field]: e.target.value }));
		},
		[readOnly],
	);

	const commitField = useCallback(
		(field: Field) => {
			if (readOnly) return;
			const raw = fieldStrings[field];
			if (raw === "") return;
			const val = parseFloat(raw);
			if (!isNaN(val) && val >= 0) {
				onChange({ ...settings, [field]: val });
			} else {
				// Revert to current setting value
				setFieldStrings((prev) => ({ ...prev, [field]: String(settings[field]) }));
			}
		},
		[settings, fieldStrings, onChange, readOnly],
	);

	const handlePreset = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
		if (readOnly) return;
		const preset = PRESETS[e.target.value];
		if (preset) onChange(preset);
	}, [onChange, readOnly]);

	const currentPreset = Object.entries(PRESETS).find(
		([_, p]) => p.mass_kg === settings.mass_kg && p.power_hp === settings.power_hp
			&& p.wheel_friction_coeff === settings.wheel_friction_coeff
			&& p.rolling_resistance_coeff === settings.rolling_resistance_coeff
			&& p.battery_capacity_wh === settings.battery_capacity_wh
			&& p.idle_drain_w === settings.idle_drain_w
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
				{readOnly ? (
					<span className="field-value-text">{settings.mass_kg}</span>
				) : (
					<input
						className="field-input"
						type="text"
						value={fieldStrings.mass_kg}
						onChange={handleChange("mass_kg")}
						onBlur={() => commitField("mass_kg")}
					/>
				)}
			</div>

			<div className="field-row">
				<label className="field-label">Rover power (hp):</label>
				{readOnly ? (
					<span className="field-value-text">{settings.power_hp}</span>
				) : (
					<input
						className="field-input"
						type="text"
						value={fieldStrings.power_hp}
						onChange={handleChange("power_hp")}
						onBlur={() => commitField("power_hp")}
					/>
				)}
			</div>

			<div className="field-row">
				<label className="field-label">Wheel friction coeff (μ):</label>
				{readOnly ? (
					<span className="field-value-text">{settings.wheel_friction_coeff}</span>
				) : (
					<input
						className="field-input"
						type="text"
						value={fieldStrings.wheel_friction_coeff}
						onChange={handleChange("wheel_friction_coeff")}
						onBlur={() => commitField("wheel_friction_coeff")}
					/>
				)}
			</div>

			<div className="field-row">
				<label className="field-label">Rolling resistance (Crr):</label>
				{readOnly ? (
					<span className="field-value-text">{settings.rolling_resistance_coeff}</span>
				) : (
					<input
						className="field-input"
						type="text"
						value={fieldStrings.rolling_resistance_coeff}
						onChange={handleChange("rolling_resistance_coeff")}
						onBlur={() => commitField("rolling_resistance_coeff")}
					/>
				)}
			</div>

			<div className="field-row">
				<label className="field-label">Battery capacity (Wh):</label>
				{readOnly ? (
					<span className="field-value-text">{settings.battery_capacity_wh}</span>
				) : (
					<input
						className="field-input"
						type="text"
						value={fieldStrings.battery_capacity_wh}
						onChange={handleChange("battery_capacity_wh")}
						onBlur={() => commitField("battery_capacity_wh")}
					/>
				)}
			</div>

			<div className="field-row">
				<label className="field-label">Idle drain (W):</label>
				{readOnly ? (
					<span className="field-value-text">{settings.idle_drain_w}</span>
				) : (
					<input
						className="field-input"
						type="text"
						value={fieldStrings.idle_drain_w}
						onChange={handleChange("idle_drain_w")}
						onBlur={() => commitField("idle_drain_w")}
					/>
				)}
			</div>
		</div>
	);
}
