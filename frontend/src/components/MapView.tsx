import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { MapPayload, Waypoint, AutopathResult } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	mapData: MapPayload | null;
	status: LoadStatus;
	waypoints: Waypoint[];
	autopathResult: AutopathResult | null;
	onAddWaypoint: (wp: Waypoint) => void;
}

export default function MapView({ mapData, status, waypoints, autopathResult, onAddWaypoint }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const [imgLoaded, setImgLoaded] = useState(false);
	const imgSrc = useRef("");
	const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
	const clickStart = useRef({ x: 0, y: 0, time: 0 });
	const transformState = useRef<{ positionX: number; positionY: number; scale: number } | null>(null);

	useEffect(() => {
		if (status === "loaded" && mapData) {
			const src = `data:image/png;base64,${mapData.image_data}`;
			if (src === imgSrc.current) return;
			imgSrc.current = src;
			setImgLoaded(false);
			const img = new Image();
			img.onload = () => {
				imgRef.current = img;
				setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
				setImgLoaded(true);
			};
			img.src = src;
		} else if (status === "loading") {
			imgRef.current = null;
			setImgLoaded(false);
		}
	}, [mapData, status]);

	// Convert screen coords to world coords using the outer container's
	// untransformed rect plus the transform state from react-zoom-pan-pinch.
	const screenToWorld = (clientX: number, clientY: number) => {
		const rect = containerRef.current?.getBoundingClientRect();
		const st = transformState.current;
		if (!rect || !st || !mapData) return null;
		const wx = clientX - rect.left;
		const wy = clientY - rect.top;
		const imgX = (wx - st.positionX) / st.scale;
		const imgY = (wy - st.positionY) / st.scale;
		if (imgX < 0 || imgX > imgNatural.w || imgY < 0 || imgY > imgNatural.h) return null;
		const b = mapData.bounds;
		const worldX = b.left + (imgX / imgNatural.w) * (b.right - b.left);
		const worldY = b.bottom + ((imgNatural.h - imgY) / imgNatural.h) * (b.top - b.bottom);
		return { x: worldX, y: worldY };
	};

	// Capture-phase handlers so they fire before react-zoom-pan-pinch
	// consumes the event for panning (in case it calls stopPropagation).
	const handlePointerDown = (e: React.MouseEvent) => {
		clickStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
	};

	const handlePointerUp = (e: React.MouseEvent) => {
		const dx = Math.abs(e.clientX - clickStart.current.x);
		const dy = Math.abs(e.clientY - clickStart.current.y);
		const dt = Date.now() - clickStart.current.time;
		if (dx < 5 && dy < 5 && dt < 300) {
			const wp = screenToWorld(e.clientX, e.clientY);
			if (wp) onAddWaypoint(wp);
		}
	};

	return (
		<div
			className="map-view"
			ref={containerRef}
			onMouseDownCapture={handlePointerDown}
			onMouseUpCapture={handlePointerUp}
		>
			{status === "idle" && (
				<div className="map-placeholder" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
					</svg>
					<span>Select a site and generate map</span>
				</div>
			)}
			{status === "loading" && (
				<div className="map-placeholder" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
					<span>Loading...</span>
				</div>
			)}
			{status === "loaded" && imgLoaded && imgRef.current && (
				<TransformWrapper
					initialScale={1}
					minScale={0.1}
					maxScale={20}
					centerOnInit
					wheel={{ step: 0.015 }}
				>
					{({ state }) => {
						transformState.current = state;
						return (
							<>
								<TransformComponent
									wrapperStyle={{ width: "100%", height: "100%" }}
									contentStyle={{ width: "auto", height: "auto", position: "relative" }}
								>
									<img
										src={imgSrc.current}
										alt={mapData!.label}
										style={{ display: "block", maxWidth: "none", userSelect: "none" }}
										draggable={false}
									/>
									<svg
										style={{
											position: "absolute", top: 0, left: 0,
											width: imgNatural.w, height: imgNatural.h,
											pointerEvents: "none",
										}}
									>
										{waypoints.map((wp, i) => {
											const b = mapData!.bounds;
											const ix = ((wp.x - b.left) / (b.right - b.left)) * imgNatural.w;
											const iy = imgNatural.h - ((wp.y - b.bottom) / (b.top - b.bottom)) * imgNatural.h;
											return (
												<g key={i}>
													<circle cx={ix} cy={iy} r={6} fill="white" stroke="black" strokeWidth={1.5} />
													<text x={ix + 8} y={iy + 3} fill="white" fontSize={11} stroke="black" strokeWidth={0.4}>
														{i + 1}
													</text>
												</g>
											);
										})}
										{waypoints.length > 1 && (
											<polyline
												fill="none"
												stroke="white"
												strokeWidth={2}
												strokeDasharray="6,3"
												points={waypoints.map((wp) => {
													const b = mapData!.bounds;
													const ix = ((wp.x - b.left) / (b.right - b.left)) * imgNatural.w;
													const iy = imgNatural.h - ((wp.y - b.bottom) / (b.top - b.bottom)) * imgNatural.h;
													return `${ix},${iy}`;
												}).join(" ")}
											/>
										)}
										{autopathResult && autopathResult.path_xy.length > 1 && (
											<polyline
												fill="none"
												stroke="#4fc3f7"
												strokeWidth={2}
												points={autopathResult.path_xy.map((p) => {
													const b = mapData!.bounds;
													const ix = ((p[0] - b.left) / (b.right - b.left)) * imgNatural.w;
													const iy = imgNatural.h - ((p[1] - b.bottom) / (b.top - b.bottom)) * imgNatural.h;
													return `${ix},${iy}`;
												}).join(" ")}
											/>
										)}
									</svg>
								</TransformComponent>
								{mapData && (
									<div className="view-overlay top-left" style={{ zIndex: 20 }}>
										{mapData.label} ({mapData.value_range[0].toFixed(1)} – {mapData.value_range[1].toFixed(1)}) · {state.scale.toFixed(1)}x · {waypoints.length} pts
									</div>
								)}
							</>
						);
					}}
				</TransformWrapper>
			)}
		</div>
	);
}
