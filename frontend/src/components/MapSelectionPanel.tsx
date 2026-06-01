import { useCallback, useRef, useState } from "react";
import { MAP_TYPES, SITE_PRESETS } from "../constants";
import type { LoadStatus } from "../App";

interface Props {
	onLoadSite: (siteName: string) => void;
	status: LoadStatus;
}

export default function MapSelectionPanel({ onLoadSite, status }: Props) {
	const presetNames = Object.keys(SITE_PRESETS).sort();
	const [selectedSite, setSelectedSite] = useState("");
	const [selectedMapType, setSelectedMapType] = useState("Elevation");
	const dateRef = useRef<HTMLInputElement>(null);
	const timeRef = useRef<HTMLInputElement>(null);

	const handleGenerate = useCallback(() => {
		if (!selectedSite) return;
		onLoadSite(selectedSite);
	}, [selectedSite, onLoadSite]);

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

			<div className="datetime-row">
				<div className="datetime-group">
					<label className="field-label">Date</label>
					<input
						ref={dateRef}
						className="field-input"
						type="text"
						placeholder="yyyy-mm-dd"
						defaultValue="2026-05-13"
					/>
				</div>
				<div className="datetime-group">
					<label className="field-label">Time</label>
					<input
						ref={timeRef}
						className="field-input"
						type="text"
						placeholder="hh:mm:ss"
						defaultValue="16:50:00"
					/>
				</div>
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
