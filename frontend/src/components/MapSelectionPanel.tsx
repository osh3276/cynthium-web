import { useCallback, useState } from "react";
import { MAP_TYPES, SITE_PRESETS } from "../constants";
import type { LoadStatus } from "../App";

interface Props {
	onLoadSite: (siteName: string, mapType: string, date: string) => void;
	status: LoadStatus;
	defaultDate: string;
}

export default function MapSelectionPanel({ onLoadSite, status, defaultDate }: Props) {
	const presetNames = Object.keys(SITE_PRESETS).sort();
	const [selectedSite, setSelectedSite] = useState("");
	const [selectedMapType, setSelectedMapType] = useState("Elevation");
	const [date, setDate] = useState(defaultDate);

	const handleGenerate = useCallback(() => {
		if (!selectedSite) return;
		onLoadSite(selectedSite, selectedMapType, date);
	}, [selectedSite, selectedMapType, date, onLoadSite]);

	return (
		<div className="panel">
			<h3 className="panel-title">Map Selection</h3>

			<div className="field-row">
				<label className="field-label">Map type:</label>
				<select
					className="field-input"
					value={selectedMapType}
					onChange={(e) => setSelectedMapType(e.target.value)}
				>
					{MAP_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
			</div>

			<div className="field-row">
				<label className="field-label">Preset maps:</label>
				<select
					className="field-input"
					value={selectedSite}
					onChange={(e) => setSelectedSite(e.target.value)}
				>
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

			<div className="field-row">
				<label className="field-label">Date:</label>
				<input
					className="field-input"
					type="date"
					value={date}
					onChange={(e) => setDate(e.target.value)}
				/>
			</div>

			<button
				className="generate-button"
				disabled={!selectedSite || status === "loading"}
				onClick={handleGenerate}
			>
				{status === "loading" ? "Loading..." : "Generate Map"}
			</button>
		</div>
	);
}
