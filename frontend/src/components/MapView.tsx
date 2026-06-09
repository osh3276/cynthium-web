import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import type { MapPayload, Waypoint, AutodesignResult } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	mapData: MapPayload | null;
	status: LoadStatus;
	waypoints: Waypoint[];
	autodesignResult: AutodesignResult | null;
	onAddWaypoint: (wp: Waypoint) => void;
}

export default function MapView({ mapData, status, waypoints, autodesignResult, onAddWaypoint }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const imgSrc = useRef("");
	const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
	const [imgLoaded, setImgLoaded] = useState(false);

	// Pan / zoom state — refs avoid re-renders during interaction
	const pos = useRef({ x: 0, y: 0 });
	const scale = useRef(1);

	// Apply transform to DOM directly — no rAF, no React state
	const applyTransform = useCallback(() => {
		const el = contentRef.current;
		if (!el) return;
		const { x, y } = pos.current;
		const s = scale.current;
		el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
	}, []);

	// Load image
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
			imgSrc.current = "";
			setImgLoaded(false);
		}
	}, [mapData, status]);

	// Reset & center transform when image loads
	useLayoutEffect(() => {
		if (!imgLoaded || !imgRef.current || !mapData || !containerRef.current) return;
		const cw = containerRef.current.clientWidth;
		const ch = containerRef.current.clientHeight;
		const iw = imgNatural.w;
		const ih = imgNatural.h;
		const s = Math.min(cw / iw, ch / ih, 1);
		scale.current = s;
		pos.current = { x: (cw - iw * s) / 2, y: (ch - ih * s) / 2 };
		applyTransform();
	}, [mapData, status, imgLoaded, imgNatural.w, imgNatural.h, applyTransform]);

	// Pointer interaction
	const pointerActive = useRef(false);
	const panning = useRef(false);
	const panStart = useRef({ x: 0, y: 0 });
	const pointerDownPos = useRef({ x: 0, y: 0 });
	const pointerDownTime = useRef(0);

	// Attach wheel listener as non-passive so preventDefault works
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = el.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			const oldScale = scale.current;
			const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
			const newScale = Math.max(0.05, Math.min(50, oldScale * factor));

			const { x, y } = pos.current;
			pos.current = {
				x: mx - (mx - x) * (newScale / oldScale),
				y: my - (my - y) * (newScale / oldScale),
			};
			scale.current = newScale;
			applyTransform();
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [applyTransform]);

	const screenToWorld = useCallback((clientX: number, clientY: number) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect || !mapData) return null;
		const wx = clientX - rect.left;
		const wy = clientY - rect.top;
		const { x, y } = pos.current;
		const s = scale.current;
		const imgX = (wx - x) / s;
		const imgY = (wy - y) / s;
		if (imgX < 0 || imgX > imgNatural.w || imgY < 0 || imgY > imgNatural.h) return null;
		const b = mapData.bounds;
		const worldX = b.left + (imgX / imgNatural.w) * (b.right - b.left);
		const worldY = b.bottom + ((imgNatural.h - imgY) / imgNatural.h) * (b.top - b.bottom);
		return { x: worldX, y: worldY };
	}, [mapData, imgNatural]);

	const onPointerDown = useCallback((e: React.PointerEvent) => {
		pointerActive.current = true;
		panning.current = false;
		panStart.current = { x: e.clientX, y: e.clientY };
		pointerDownPos.current = { x: e.clientX, y: e.clientY };
		pointerDownTime.current = Date.now();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}, []);

	const onPointerMove = useCallback((e: React.PointerEvent) => {
		if (!pointerActive.current) return;
		const dx = e.clientX - panStart.current.x;
		const dy = e.clientY - panStart.current.y;
		if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
			panning.current = true;
		}
		if (!panning.current) return;
		pos.current.x += dx;
		pos.current.y += dy;
		panStart.current = { x: e.clientX, y: e.clientY };
		applyTransform();
	}, [applyTransform]);

	const onPointerUp = useCallback((e: React.PointerEvent) => {
		pointerActive.current = false;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);

		if (!panning.current) {
			const dx = Math.abs(e.clientX - pointerDownPos.current.x);
			const dy = Math.abs(e.clientY - pointerDownPos.current.y);
			const dt = Date.now() - pointerDownTime.current;
			if (dx < 5 && dy < 5 && dt < 300) {
				const wp = screenToWorld(e.clientX, e.clientY);
				if (wp) onAddWaypoint(wp);
			}
		}
	}, [screenToWorld, onAddWaypoint]);

	// Throttled overlay display
	const [displayScale, setDisplayScale] = useState(1);
	const [displayWpCount, setDisplayWpCount] = useState(0);
	useEffect(() => {
		const id = setInterval(() => {
			setDisplayScale(scale.current);
			setDisplayWpCount(waypoints.length);
		}, 100);
		return () => clearInterval(id);
	}, [waypoints.length]);

	return (
		<div
			className="map-view"
			ref={containerRef}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			style={{ touchAction: "none", cursor: "grab" }}
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
				<>
					<div
						ref={contentRef}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							transformOrigin: "0 0",
						}}
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
							{autodesignResult && autodesignResult.path_xy.length > 1 && (
								<polyline
									fill="none"
									stroke="#4fc3f7"
									strokeWidth={2}
									points={autodesignResult.path_xy.map((p) => {
										const b = mapData!.bounds;
										const ix = ((p[0] - b.left) / (b.right - b.left)) * imgNatural.w;
										const iy = imgNatural.h - ((p[1] - b.bottom) / (b.top - b.bottom)) * imgNatural.h;
										return `${ix},${iy}`;
									}).join(" ")}
								/>
							)}
						</svg>
					</div>
					{mapData && (
						<div className="view-overlay top-left" style={{ zIndex: 20 }}>
							{mapData.label} ({mapData.value_range[0].toFixed(1)} – {mapData.value_range[1].toFixed(1)}) · {displayScale.toFixed(1)}x · {displayWpCount} pts
						</div>
					)}
				</>
			)}
		</div>
	);
}
