import {
	useEffect,
	useRef,
	useState,
	useCallback,
	useLayoutEffect,
} from "react";
import { type ReactElement } from "react";
import type {
	MapPayload,
	Waypoint,
	AutodesignResult,
	SimulationStats,
} from "../types";
import type { LoadStatus } from "../App";
import { useRoverAnimation } from "./useRoverAnimation";

/** Scale factor for animation speed (30x real-time so it's visible in a few seconds). */
const ROVER_ANIMATION_SPEED = 30;

interface Props {
		mapData: MapPayload | null;
		status: LoadStatus;
		waypoints: Waypoint[];
		autodesignResult: AutodesignResult | null;
		onAddWaypoint: (wp: Waypoint) => void;
		onUpdateWaypoint?: (index: number, wp: Waypoint) => void;
		gameStartPoint?: Waypoint | null;
		gameEndPoint?: Waypoint | null;
		manualStats: SimulationStats | null;
		autoStats: SimulationStats | null;
		onAnimationsComplete?: () => void;
	}

export default function MapView({
		mapData,
		status,
		waypoints,
		autodesignResult,
		onAddWaypoint,
		onUpdateWaypoint,
		gameStartPoint,
		gameEndPoint,
		manualStats,
		autoStats,
		onAnimationsComplete,
	}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const imgSrc = useRef("");
	const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
	const [imgLoaded, setImgLoaded] = useState(false);

	// Hidden canvas for pixel-value reading
	const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const [hoverValue, setHoverValue] = useState<{ val: number; label: string } | null>(null);
	const hoverTimerRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

	// Pan / zoom state - refs avoid re-renders during interaction
	const pos = useRef({ x: 0, y: 0 });
	const scale = useRef(1);

	// Apply transform to DOM directly - no rAF, no React state
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
				// Draw to hidden canvas for pixel reading
				const cvs = document.createElement("canvas");
				cvs.width = img.naturalWidth;
				cvs.height = img.naturalHeight;
				const ctx = cvs.getContext("2d");
				if (ctx) {
					ctx.drawImage(img, 0, 0);
					pixelCanvasRef.current = cvs;
				}
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
		if (!imgLoaded || !imgRef.current || !mapData || !containerRef.current)
			return;
		const cw = containerRef.current.clientWidth;
		const ch = containerRef.current.clientHeight;
		const iw = imgNatural.w;
		const ih = imgNatural.h;
		const s = Math.min(cw / iw, ch / ih, 1);
		scale.current = s;
		pos.current = { x: (cw - iw * s) / 2, y: (ch - ih * s) / 2 };
		applyTransform();
	}, [
		mapData,
		status,
		imgLoaded,
		imgNatural.w,
		imgNatural.h,
		applyTransform,
	]);

	// Pointer interaction
	const pointerActive = useRef(false);
	const panning = useRef(false);
	const panStart = useRef({ x: 0, y: 0 });
	const pointerDownPos = useRef({ x: 0, y: 0 });
	const pointerDownTime = useRef(0);

	// Waypoint drag state
	const dragWpIndex = useRef<number | null>(null);
	const [dragWpPos, setDragWpPos] = useState<{ x: number; y: number } | null>(null);

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

	const screenToWorld = useCallback(
			(clientX: number, clientY: number) => {
				const rect = containerRef.current?.getBoundingClientRect();
				if (!rect || !mapData) return null;
				const wx = clientX - rect.left;
				const wy = clientY - rect.top;
				const { x, y } = pos.current;
				const s = scale.current;
				const imgX = (wx - x) / s;
				const imgY = (wy - y) / s;
				if (
					imgX < 0 ||
					imgX > imgNatural.w ||
					imgY < 0 ||
					imgY > imgNatural.h
				)
					return null;
				const b = mapData.bounds;
				const worldX = b.left + (imgX / imgNatural.w) * (b.right - b.left);
				const worldY =
					b.bottom +
					((imgNatural.h - imgY) / imgNatural.h) * (b.top - b.bottom);
				return { x: worldX, y: worldY, imgX, imgY };
			},
			[mapData, imgNatural],
		);

	const worldToPixel = useCallback(
		(worldX: number, worldY: number) => {
			if (!mapData) return null;
			const b = mapData.bounds;
			const ix = ((worldX - b.left) / (b.right - b.left)) * imgNatural.w;
			const iy =
				imgNatural.h -
				((worldY - b.bottom) / (b.top - b.bottom)) * imgNatural.h;
			return { x: ix, y: iy };
		},
		[mapData, imgNatural],
	);

	const onPointerDown = useCallback((e: React.PointerEvent) => {
		pointerActive.current = true;
		panning.current = false;
		dragWpIndex.current = null;
		panStart.current = { x: e.clientX, y: e.clientY };
		pointerDownPos.current = { x: e.clientX, y: e.clientY };
		pointerDownTime.current = Date.now();

		// Check if clicking near an existing waypoint to start a drag
		const wp = screenToWorld(e.clientX, e.clientY);
		if (wp && mapData && onUpdateWaypoint) {
			const threshold = (mapData.bounds.right - mapData.bounds.left) * 0.01;
			for (let i = 0; i < waypoints.length; i++) {
				const dx = wp.x - waypoints[i].x;
				const dy = wp.y - waypoints[i].y;
				if (Math.hypot(dx, dy) < threshold) {
					dragWpIndex.current = i;
					break;
				}
			}
		}

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}, [screenToWorld, mapData, waypoints, onUpdateWaypoint]);

	const readPixelValue = useCallback(
		(imgX: number, imgY: number) => {
			if (!mapData) return;
			const cvs = pixelCanvasRef.current;
			const ctx = cvs?.getContext("2d");
			if (!cvs || !ctx) return;
			const px = Math.round(imgX);
			const py = Math.round(imgY);
			if (px < 0 || px >= cvs.width || py < 0 || py >= cvs.height) return;
			const [dmin, dmax] = mapData.value_range;
			const drange = dmax - dmin || 1;

			// For elevation, use exact height_data
			if (mapData.height_data && mapData.label === "Elevation") {
				const shape = mapData.shape;
				const col = Math.round((imgX / imgNatural.w) * shape[1]);
				const row = Math.round((imgY / imgNatural.h) * shape[0]);
				const clampedCol = Math.max(0, Math.min(shape[1] - 1, col));
				const clampedRow = Math.max(0, Math.min(shape[0] - 1, row));
				const val = mapData.height_data[clampedRow]?.[clampedCol];
				if (val != null && isFinite(val)) {
					setHoverValue({ val, label: "m" });
					return;
				}
			}

			// Fallback: read pixel from canvas and estimate via brightness
			const p = ctx.getImageData(px, py, 1, 1).data;
			// Weighted brightness approximates the normalized value
			const bright = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
			const val = dmin + bright * drange;
			const label = mapData.label === "Elevation"
				? "m"
				: mapData.label.includes("Slope")
					? "°"
					: mapData.label.includes("Temperature")
						? "°C"
						: mapData.label.includes("Illumination")
							? "W/m²"
							: "";
			setHoverValue({ val, label });
		},
		[mapData, imgNatural],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!pointerActive.current) return;
			const dx = e.clientX - panStart.current.x;
			const dy = e.clientY - panStart.current.y;

			// If dragging a waypoint, update its temporary position
			if (dragWpIndex.current != null) {
				if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
					panning.current = true;
					const wp = screenToWorld(e.clientX, e.clientY);
					if (wp) {
						setDragWpPos(wp);
					}
					panStart.current = { x: e.clientX, y: e.clientY };
				}
				// Even with tiny movement, return early to prevent map from panning
				return;
			}

			if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
				panning.current = true;
			}
			if (!panning.current) return;
			pos.current.x += dx;
			pos.current.y += dy;
			panStart.current = { x: e.clientX, y: e.clientY };
			applyTransform();
			setHoverValue(null);
		},
		[applyTransform, screenToWorld],
	);

	// Separate hover handler — fires on mouse move without pressing
	const onMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (pointerActive.current) return; // don't double-handle during drag
			if (hoverTimerRef.current == null) {
				hoverTimerRef.current = requestAnimationFrame(() => {
					hoverTimerRef.current = null;
					const wp = screenToWorld(e.clientX, e.clientY);
					if (wp) {
						readPixelValue(wp.imgX, wp.imgY);
					} else {
						setHoverValue(null);
					}
				});
			}
		},
		[screenToWorld, readPixelValue],
	);

	const onPointerUp = useCallback(
		(e: React.PointerEvent) => {
			pointerActive.current = false;
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
			if (hoverTimerRef.current) {
				cancelAnimationFrame(hoverTimerRef.current);
				hoverTimerRef.current = null;
			}

			// Finalize waypoint drag
			if (dragWpIndex.current != null && dragWpPos && panning.current && onUpdateWaypoint) {
				onUpdateWaypoint(dragWpIndex.current, dragWpPos);
				setDragWpPos(null);
				dragWpIndex.current = null;
				return;
			}
			setDragWpPos(null);
			dragWpIndex.current = null;

			if (!panning.current) {
				const dx = Math.abs(e.clientX - pointerDownPos.current.x);
				const dy = Math.abs(e.clientY - pointerDownPos.current.y);
				const dt = Date.now() - pointerDownTime.current;
				if (dx < 5 && dy < 5 && dt < 300) {
					const wp = screenToWorld(e.clientX, e.clientY);
					if (wp) onAddWaypoint(wp);
				}
			}
		},
		[screenToWorld, onAddWaypoint, onUpdateWaypoint, dragWpPos],
	);

	// Clear hover value when map data changes
	useEffect(() => {
		setHoverValue(null);
	}, [mapData]);

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

	// Rover animation hook - animates along the manual path velocity profile
	// Pass manualStats as restartKey so any new simulation response restarts
	// the animation, even if the profile data is unchanged.
	const roverAnim = useRoverAnimation(
		manualStats?.path_velocity_profile,
		worldToPixel,
		ROVER_ANIMATION_SPEED,
		manualStats,
	);

	// Rover animation for the auto-designed path
	const autoRoverAnim = useRoverAnimation(
		autoStats?.path_velocity_profile,
		worldToPixel,
		ROVER_ANIMATION_SPEED,
		autoStats,
	);

	// Fire onAnimationsComplete when both rover animations finish
	const animsDoneRef = useRef(false);
	const animsStartedRef = useRef(false);
	useEffect(() => {
		// Only fire when there are actual stats to animate (game mode)
		if (!manualStats && !autoStats) return;

		const bothDone = roverAnim.done && autoRoverAnim.done;
		const eitherStarted = !roverAnim.done || !autoRoverAnim.done;

		// Track that at least one rover has actually started animating
		// (their done state went true -> false). This prevents firing the
		// callback on the initial render where done=true before the hook
		// effects have had a chance to start the animation.
		if (eitherStarted) {
			animsStartedRef.current = true;
		}

		if (bothDone && animsStartedRef.current && !animsDoneRef.current) {
			animsDoneRef.current = true;
			onAnimationsComplete?.();
		}
		if (!bothDone) {
			animsDoneRef.current = false;
		}
	}, [
		roverAnim.done,
		autoRoverAnim.done,
		manualStats,
		autoStats,
		onAnimationsComplete,
	]);

	return (
		<div
			className="map-view"
			ref={containerRef}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onMouseMove={onMouseMove}
			onMouseLeave={() => { setHoverValue(null); }}
			style={{ touchAction: "none", cursor: "grab" }}
		>
			{status === "idle" && (
				<div
					className="map-placeholder"
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						pointerEvents: "none",
					}}
				>
					<svg
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
					</svg>
					<span>Select a site and generate map</span>
				</div>
			)}
			{status === "loading" && (
				<div
					className="map-placeholder"
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						pointerEvents: "none",
					}}
				>
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
							style={{
								display: "block",
								maxWidth: "none",
								userSelect: "none",
							}}
							draggable={false}
						/>
						<svg
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: imgNatural.w,
								height: imgNatural.h,
								pointerEvents: "none",
							}}
						>
							{gameStartPoint &&
								(() => {
									const b = mapData!.bounds;
									const ix =
										((gameStartPoint.x - b.left) /
											(b.right - b.left)) *
										imgNatural.w;
									const iy =
										imgNatural.h -
										((gameStartPoint.y - b.bottom) /
											(b.top - b.bottom)) *
											imgNatural.h;
									return (
										<g>
											<rect
												x={ix - 8}
												y={iy - 8}
												width={16}
												height={16}
												fill="#4fc3f7"
												rx={2}
											/>
											<text
												x={ix}
												y={iy + 3}
												textAnchor="middle"
												fill="white"
												fontSize={9}
												fontWeight={700}
											>
												S
											</text>
										</g>
									);
								})()}
							{gameEndPoint &&
								(() => {
									const b = mapData!.bounds;
									const ix =
										((gameEndPoint.x - b.left) /
											(b.right - b.left)) *
										imgNatural.w;
									const iy =
										imgNatural.h -
										((gameEndPoint.y - b.bottom) /
											(b.top - b.bottom)) *
											imgNatural.h;
									return (
										<g>
											<rect
												x={ix - 8}
												y={iy - 8}
												width={16}
												height={16}
												fill="#e53935"
												rx={2}
											/>
											<text
												x={ix}
												y={iy + 3}
												textAnchor="middle"
												fill="white"
												fontSize={9}
												fontWeight={700}
											>
												E
											</text>
										</g>
									);
								})()}
							{/* Outline stroke for the dotted line — renders underneath */}
							{waypoints.length > 1 && (
								<polyline
									fill="none"
									stroke="rgba(0,0,0,0.6)"
									strokeWidth={4}
									strokeLinecap="round"
									points={waypoints
										.map((wp, i) => {
											const isDragged = dragWpIndex.current === i && dragWpPos != null;
											const p = isDragged ? dragWpPos : wp;
											const b = mapData!.bounds;
											const ix =
												((p.x - b.left) /
													(b.right - b.left)) *
												imgNatural.w;
											const iy =
												imgNatural.h -
												((p.y - b.bottom) /
													(b.top - b.bottom)) *
													imgNatural.h;
											return `${ix},${iy}`;
										})
										.join(" ")}
								/>
							)}
							{/* Dotted line on top of outline */}
							{waypoints.length > 1 && (
								<polyline
									fill="none"
									stroke="white"
									strokeWidth={2}
									strokeDasharray="6,3"
									points={waypoints
										.map((wp, i) => {
											const isDragged = dragWpIndex.current === i && dragWpPos != null;
											const p = isDragged ? dragWpPos : wp;
											const b = mapData!.bounds;
											const ix =
												((p.x - b.left) /
													(b.right - b.left)) *
												imgNatural.w;
											const iy =
												imgNatural.h -
												((p.y - b.bottom) /
													(b.top - b.bottom)) *
													imgNatural.h;
											return `${ix},${iy}`;
										})
										.join(" ")}
								/>
							)}
							{/* Cursor hint when hovering near a waypoint */}
							{dragWpIndex.current != null && dragWpPos && (
								<circle
									cx={((dragWpPos.x - mapData!.bounds.left) / (mapData!.bounds.right - mapData!.bounds.left)) * imgNatural.w}
									cy={imgNatural.h - ((dragWpPos.y - mapData!.bounds.bottom) / (mapData!.bounds.top - mapData!.bounds.bottom)) * imgNatural.h}
									r={8}
									fill="none"
									stroke="#4fc3f7"
									strokeWidth={2}
									strokeDasharray="4,2"
								/>
							)}
							{waypoints.map((wp, i) => {
								const isDragged = dragWpIndex.current === i && dragWpPos != null;
								const displayWp = isDragged ? dragWpPos : wp;
								const b = mapData!.bounds;
								const ix =
									((displayWp.x - b.left) / (b.right - b.left)) *
									imgNatural.w;
								const iy =
									imgNatural.h -
									((displayWp.y - b.bottom) / (b.top - b.bottom)) *
									imgNatural.h;
								return (
									<g key={i}>
										<circle
											cx={ix}
											cy={iy}
											r={isDragged ? 6 : 5}
											fill={isDragged ? "#4fc3f7" : "white"}
											stroke={isDragged ? "#0288d1" : "black"}
											strokeWidth={1.5}
										/>
										<text
											x={ix + 7}
											y={iy + 3}
											fill={isDragged ? "#4fc3f7" : "white"}
											fontSize={10}
											fontWeight={700}
											stroke="black"
											strokeWidth={0.5}
										>
											{i + 1}
										</text>
									</g>
								);
							})}
							{autodesignResult &&
								autodesignResult.path_xy.length > 1 &&
								(() => {
									const b = mapData!.bounds;
									let autoPts = autodesignResult.path_xy;
									const failArr = autoStats?.failure_xy;

									if (
										failArr &&
										Array.isArray(failArr) &&
										failArr.length >= 2
									) {
										const fx = failArr[0] as number;
										const fy = failArr[1] as number;
										let cutIdx = autoPts.length - 1;
										let minDist = Infinity;
										for (
											let i = 0;
											i < autoPts.length - 1;
											i++
										) {
											const a = autoPts[i];
											const b2 = autoPts[i + 1];
											const dx = b2[0] - a[0];
											const dy = b2[1] - a[1];
											const lenSq = dx * dx + dy * dy;
											let t = 0;
											if (lenSq > 0) {
												t =
													((fx - a[0]) * dx +
														(fy - a[1]) * dy) /
													lenSq;
												t = Math.max(0, Math.min(1, t));
											}
											const cx = a[0] + t * dx;
											const cy = a[1] + t * dy;
											const rx = fx - cx;
											const ry = fy - cy;
											const d = rx * rx + ry * ry;
											if (d < minDist) {
												minDist = d;
												cutIdx = i;
											}
										}
										autoPts = autoPts.slice(0, cutIdx + 1);
										autoPts.push([fx, fy]);
									}

									return (
										<polyline
											fill="none"
											stroke="#4fc3f7"
											strokeWidth={2}
											points={autoPts
												.map((p) => {
													const ix =
														((p[0] - b.left) /
															(b.right -
																b.left)) *
														imgNatural.w;
													const iy =
														imgNatural.h -
														((p[1] - b.bottom) /
															(b.top -
																b.bottom)) *
														imgNatural.h;
													return `${ix},${iy}`;
												})
												.join(" ")}
										/>
									);
								})()}

							{/* Failure indicators — show red X only after rover animation reaches the failure point */}
							{roverAnim.done &&
								roverAnim.failed &&
								_renderFailureMarker(manualStats, mapData!, imgNatural)}
							{autoRoverAnim.done &&
								autoRoverAnim.failed &&
								_renderFailureMarker(autoStats, mapData!, imgNatural)}

							{/* Animated rover dot - manual (cyan) */}
							{roverAnim.pos && !roverAnim.done && (
								<g>
									{/* Glow */}
									<circle
										cx={roverAnim.pos.x}
										cy={roverAnim.pos.y}
										r={9}
										fill={
											roverAnim.failed
												? "rgba(255,23,68,0.3)"
												: "rgba(79,195,247,0.3)"
										}
									/>
									{/* Core dot */}
									<circle
										cx={roverAnim.pos.x}
										cy={roverAnim.pos.y}
										r={5}
										fill={
											roverAnim.failed
												? "#ff1744"
												: "#4fc3f7"
										}
										stroke={
											roverAnim.failed
												? "#b71c1c"
												: "#0288d1"
										}
										strokeWidth={1.5}
									/>
								</g>
							)}

							{/* Animated rover dot - auto (orange) */}
							{autoRoverAnim.pos && !autoRoverAnim.done && (
								<g>
									{/* Glow */}
									<circle
										cx={autoRoverAnim.pos.x}
										cy={autoRoverAnim.pos.y}
										r={9}
										fill={
											autoRoverAnim.failed
												? "rgba(255,23,68,0.3)"
												: "rgba(255,167,38,0.3)"
										}
									/>
									{/* Core dot */}
									<circle
										cx={autoRoverAnim.pos.x}
										cy={autoRoverAnim.pos.y}
										r={5}
										fill={
											autoRoverAnim.failed
												? "#ff1744"
												: "#ffa726"
										}
										stroke={
											autoRoverAnim.failed
												? "#b71c1c"
												: "#e65100"
										}
										strokeWidth={1.5}
									/>
								</g>
							)}
						</svg>
					</div>
					{mapData && (
						<div
							className="view-overlay top-left"
							style={{ zIndex: 20 }}
						>
							{mapData.label} ({mapData.value_range[0].toFixed(1)}{" "}
							- {mapData.value_range[1].toFixed(1)}) ·{" "}
							{displayScale.toFixed(1)}x · {displayWpCount} pts
							{hoverValue && (
								<div style={{ marginTop: 2, fontSize: 12, color: "#00d4ff", textTransform: "none" }}>
									{hoverValue.val.toFixed(2)}{hoverValue.label}
								</div>
							)}
						</div>
					)}
					{/* Velocity overlays */}
					{roverAnim.pos && !roverAnim.done && (
						<div
							className="view-overlay top-right"
							style={{
								zIndex: 20,
								fontSize: 11,
								color: roverAnim.failed ? "#ff1744" : "#4fc3f7",
							}}
						>
							Manual: {roverAnim.velocity.toFixed(2)} m/s
							{roverAnim.failed && " - FAILED"}
						</div>
					)}
					{autoRoverAnim.pos && !autoRoverAnim.done && (
						<div
							className="view-overlay"
							style={{
								top: 32,
								right: 8,
								zIndex: 20,
								fontSize: 11,
								color: autoRoverAnim.failed
									? "#ff1744"
									: "#ffa726",
							}}
						>
							Auto: {autoRoverAnim.velocity.toFixed(2)} m/s
							{autoRoverAnim.failed && " - FAILED"}
						</div>
					)}
				</>
			)}
		</div>
	);
}

function _renderFailureMarker(
	stats: SimulationStats | null,
	mapData: MapPayload,
	imgNatural: { w: number; h: number },
): ReactElement | null {
	const arr = stats?.failure_xy;
	if (!arr || !Array.isArray(arr) || arr.length < 2) return null;
	const fx = arr[0] as number;
	const fy = arr[1] as number;
	const b = mapData.bounds;
	const ix = ((fx - b.left) / (b.right - b.left)) * imgNatural.w;
	const iy =
		imgNatural.h - ((fy - b.bottom) / (b.top - b.bottom)) * imgNatural.h;
	return (
		<g>
			<circle
				cx={ix}
				cy={iy}
				r={5}
				fill="none"
				stroke="#ff1744"
				strokeWidth={2}
			/>
			<line
				x1={ix - 4}
				y1={iy - 4}
				x2={ix + 4}
				y2={iy + 4}
				stroke="#ff1744"
				strokeWidth={2}
			/>
			<line
				x1={ix - 4}
				y1={iy + 4}
				x2={ix + 4}
				y2={iy - 4}
				stroke="#ff1744"
				strokeWidth={2}
			/>
		</g>
	);
}
