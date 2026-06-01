import { useEffect, useRef } from "react";
import type { ElevationPayload } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	elevation: ElevationPayload | null;
	status: LoadStatus;
}

export default function MapView({ elevation, status }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		if (status === "loading") {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.fillStyle = "#555";
				ctx.font = "14px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("Loading...", canvas.width / 2, canvas.height / 2);
			}
			return;
		}

		if (status === "loaded" && elevation) {
			const img = new Image();
			img.onload = () => {
				const ctx = canvas.getContext("2d");
				if (!ctx) return;
				canvas.width = img.width;
				canvas.height = img.height;
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0);
			};
			img.src = `data:image/png;base64,${elevation.image_data}`;
		}
	}, [elevation, status]);

	return (
		<div className="map-view">
			<canvas ref={canvasRef} className="map-canvas" />
			{status === "idle" && (
				<div className="map-placeholder">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
					</svg>
					<span>Select a site and generate map</span>
				</div>
			)}
			{status === "loaded" && elevation && (
				<div className="view-overlay top-left">
					Elevation ({elevation.min_elev.toFixed(0)} – {elevation.max_elev.toFixed(0)} m)
				</div>
			)}
		</div>
	);
}
