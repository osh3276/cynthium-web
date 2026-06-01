import { useCallback, useEffect, useRef, useState } from "react";
import type { ElevationPayload } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	elevation: ElevationPayload | null;
	status: LoadStatus;
}

export default function MapView({ elevation, status }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const [zoom, setZoom] = useState(1);
	const panRef = useRef({ x: 0, y: 0 });
	const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

	// Load image when elevation arrives
	useEffect(() => {
		if (status === "loaded" && elevation) {
			const img = new Image();
			img.onload = () => {
				imgRef.current = img;
				panRef.current = { x: 0, y: 0 };
				setZoom(1);
				render();
			};
			img.src = `data:image/png;base64,${elevation.image_data}`;
		} else if (status === "loading") {
			imgRef.current = null;
		}
	}, [elevation, status]);

	// Render the canvas
	const render = useCallback(() => {
		const canvas = canvasRef.current;
		const img = imgRef.current;
		if (!canvas || !img) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const parent = canvas.parentElement;
		const cw = parent?.clientWidth || 400;
		const ch = parent?.clientHeight || 400;
		canvas.width = cw;
		canvas.height = ch;

		ctx.clearRect(0, 0, cw, ch);
		ctx.fillStyle = "#1a1a1a";
		ctx.fillRect(0, 0, cw, ch);

		ctx.save();
		const px = panRef.current.x;
		const py = panRef.current.y;

		ctx.translate(px, py);
		ctx.scale(zoom, zoom);
		ctx.drawImage(img, 0, 0);
		ctx.restore();
	}, [zoom]);

	useEffect(() => {
		render();
	}, [render, zoom]);

	// Zoom with mouse wheel
	const handleWheel = useCallback((e: React.WheelEvent) => {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		setZoom((z) => Math.max(0.1, Math.min(20, z * delta)));
	}, []);

	// Pan with drag
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		dragRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			panX: panRef.current.x,
			panY: panRef.current.y,
		};
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!dragRef.current) return;
			const dx = e.clientX - dragRef.current.startX;
			const dy = e.clientY - dragRef.current.startY;
			panRef.current.x = dragRef.current.panX + dx;
			panRef.current.y = dragRef.current.panY + dy;
			render();
		};
		const handleMouseUp = () => {
			dragRef.current = null;
		};
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [render]);

	return (
		<div ref={containerRef} className="map-view">
			<canvas
				ref={canvasRef}
				className="map-canvas"
				onWheel={handleWheel}
				onMouseDown={handleMouseDown}
				style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
			/>
			{status === "idle" && (
				<div className="map-placeholder" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
					</svg>
					<span>Select a site and generate map</span>
				</div>
			)}
			{status === "loaded" && elevation && (
				<div className="view-overlay top-left">
					Elevation ({elevation.min_elev.toFixed(0)} – {elevation.max_elev.toFixed(0)} m) · {zoom.toFixed(1)}x
				</div>
			)}
		</div>
	);
}
