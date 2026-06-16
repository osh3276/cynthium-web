import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MapPayload, Waypoint, AutodesignResult, SimulationStats } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	mapData: MapPayload | null;
	status: LoadStatus;
	waypoints: Waypoint[];
	autodesignResult: AutodesignResult | null;
	manualStats: SimulationStats | null;
	autoStats: SimulationStats | null;
}

function reflectX(x: number, b: { left: number; right: number }): number {
	return b.left + b.right - x;
}

export default function TerrainView({ mapData, status, waypoints, autodesignResult, manualStats, autoStats }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const prevShapeKey = useRef<string | null>(null);
	const sceneRef = useRef<{
		scene: THREE.Scene;
		camera: THREE.PerspectiveCamera;
		renderer: THREE.WebGLRenderer;
		controls: OrbitControls;
		mesh: THREE.Mesh | null;
		sunLight: THREE.DirectionalLight;
		wpGroup: THREE.Group;
		pathLine: THREE.Line | null;
		autoLine: THREE.Line | null;
	} | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || sceneRef.current) return;

		const w = container.clientWidth || 400;
		const h = container.clientHeight || 400;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x1e1e1e);

		const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
		camera.position.set(0, 5000, 8000);

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.target.set(0, 0, 0);

		const ambient = new THREE.AmbientLight(0x000000, 0.3);
		scene.add(ambient);
		const sunLight = new THREE.DirectionalLight(0xffffff, 3);
		sunLight.position.set(5000, 8000, 3000);
		scene.add(sunLight);
		const fillLight = new THREE.DirectionalLight(0x8888ff, 0.2);
		fillLight.position.set(-3000, -2000, -4000);
		scene.add(fillLight);

		const wpGroup = new THREE.Group();
		scene.add(wpGroup);

		sceneRef.current = { scene, camera, renderer, controls, mesh: null, sunLight, wpGroup, pathLine: null, autoLine: null };

		let running = true;
		const animate = () => {
			if (!running) return;
			controls.update();
			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		};
		animate();

		const onResize = () => {
			if (!container || !sceneRef.current) return;
			const w2 = container.clientWidth;
			const h2 = container.clientHeight;
			camera.aspect = w2 / h2;
			camera.updateProjectionMatrix();
			renderer.setSize(w2, h2);
		};
		window.addEventListener("resize", onResize);

		return () => {
			running = false;
			window.removeEventListener("resize", onResize);
			container.removeChild(renderer.domElement);
			renderer.dispose();
			sceneRef.current = null;
		};
	}, []);

	// Update terrain mesh
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;

		if (!mapData || status !== "loaded" || !mapData.height_data) {
			if (ctx.mesh) {
				ctx.scene.remove(ctx.mesh);
				ctx.mesh.geometry.dispose();
				if (Array.isArray(ctx.mesh.material)) {
					ctx.mesh.material.forEach((m) => m.dispose());
				} else {
					ctx.mesh.material.dispose();
				}
				ctx.mesh = null;
			}
			return;
		}

		const shapeKey = mapData.downsampled_shape?.join(",") ?? "";
		if (shapeKey === prevShapeKey.current && ctx.mesh) return;
		prevShapeKey.current = shapeKey;

		if (ctx.mesh) {
			ctx.scene.remove(ctx.mesh);
			ctx.mesh.geometry.dispose();
			if (Array.isArray(ctx.mesh.material)) {
				ctx.mesh.material.forEach((m) => m.dispose());
			} else {
				ctx.mesh.material.dispose();
			}
			ctx.mesh = null;
		}

		const hdata = mapData.height_data;
		const rows = hdata.length;
		const cols = hdata[0].length;
		const b = mapData.bounds;
		const minZ = mapData.min_elev ?? 0;
		const maxZ = mapData.max_elev ?? 1;

		const x0 = b.left;
		const x1 = b.right;
		const y0 = b.bottom;
		const y1 = b.top;

		const geo = new THREE.BufferGeometry();
		const vertices: number[] = [];
		const indices: number[] = [];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const z = hdata[r][c];
				const t = c / (cols - 1);
				const ty = (rows - 1 - r) / (rows - 1);
				vertices.push(x1 - t * (x1 - x0), z, y0 + ty * (y1 - y0));
			}
		}

		for (let r = 0; r < rows - 1; r++) {
			for (let c = 0; c < cols - 1; c++) {
				const i = r * cols + c;
				const j = r * cols + c + 1;
				const k = (r + 1) * cols + c;
				const l = (r + 1) * cols + c + 1;
				indices.push(i, j, k, j, l, k);
			}
		}

		geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
		geo.setIndex(indices);
		geo.computeVertexNormals();

		const mat = new THREE.MeshStandardMaterial({
			color: 0x878787,
			flatShading: false,
			side: THREE.DoubleSide,
			roughness: 1.0,
			metalness: 0.10,
		});

		const mesh = new THREE.Mesh(geo, mat);
		ctx.scene.add(mesh);
		ctx.mesh = mesh;

		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		const cz = (minZ + maxZ) / 2;
		ctx.controls.target.set(cx, cz, cy);
		const maxDim = Math.max(x1 - x0, y1 - y0);
		ctx.camera.position.set(cx, cz + maxDim * 0.6, cy - maxDim * 0.8);
		ctx.camera.lookAt(cx, cz, cy);
		ctx.controls.update();
	}, [mapData, status]);

	// Sun light: use azimuth from backend but fixed 45° elevation
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx || !mapData) return;
		const az = mapData.sun_azimuth;
		if (az == null) return;

		// Realistic elevation (commenting out for now):
		// const el = mapData.sun_elevation;
		// if (el == null) return;
		// const elRad = (el * Math.PI) / 180;

		const elRad = (25 * Math.PI) / 180;
		const azRad = (az * Math.PI) / 180;
		const dist = 100000;
		ctx.sunLight.position.set(
			Math.sin(azRad) * Math.cos(elRad) * dist,
			Math.sin(elRad) * dist,
			Math.cos(azRad) * Math.cos(elRad) * dist,
		);
	}, [mapData?.sun_azimuth]);

	// Update waypoints, paths, and failure indicators
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;

		// Clear waypoints group
	while (ctx.wpGroup.children.length > 0) {
		const child = ctx.wpGroup.children[0];
		if (child instanceof THREE.Mesh) {
			child.geometry.dispose();
			if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
			else child.material.dispose();
		}
		ctx.wpGroup.remove(child);
	}

	// Clear old path lines
	if (ctx.pathLine) {
		ctx.scene.remove(ctx.pathLine);
		ctx.pathLine.geometry.dispose();
		(ctx.pathLine.material as THREE.Material).dispose();
		ctx.pathLine = null;
	}
	if (ctx.autoLine) {
		ctx.scene.remove(ctx.autoLine);
		ctx.autoLine.geometry.dispose();
		(ctx.autoLine.material as THREE.Material).dispose();
		ctx.autoLine = null;
	}

	if (!mapData || !mapData.height_data) return;

	const mesh = ctx.mesh;
	if (!mesh) return;

	const b = mapData.bounds;
	const Z_OFFSET = 5;

	// Waypoints
	const sphereGeo = new THREE.SphereGeometry(40, 12, 12);
	const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4488ff, emissiveIntensity: 0.3 });
	waypoints.forEach((wp) => {
		const s = new THREE.Mesh(sphereGeo, sphereMat);
		const z = _sampleHeight(wp.x, wp.y, mapData!);
		s.position.set(reflectX(wp.x, b), z + 20, wp.y);
		ctx.wpGroup.add(s);
	});

	// Manual path line
	if (waypoints.length > 1) {
		const pts = _surfaceLine(waypoints, mapData, Z_OFFSET, reflectX);
		const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
		const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
		const line = new THREE.Line(lineGeo, lineMat);
		ctx.scene.add(line);
		ctx.pathLine = line;
	}

	// Auto path line (truncated at failure point if failure_xy is present)
	if (autodesignResult && autodesignResult.path_xy.length > 1) {
		let autoPts = autodesignResult.path_xy.map((p) => ({ x: p[0], y: p[1] }));
		const failArr = autoStats?.failure_xy;

		if (failArr && Array.isArray(failArr) && failArr.length >= 2) {
			const fx = failArr[0] as number;
			const fy = failArr[1] as number;
			// Find segment containing the failure point
			let cutIdx = autoPts.length - 1;
			let minDist = Infinity;
			for (let i = 0; i < autoPts.length - 1; i++) {
				const a = autoPts[i];
				const b2 = autoPts[i + 1];
				const d = _pointToSegmentDistSq(fx, fy, a.x, a.y, b2.x, b2.y);
				if (d < minDist) {
					minDist = d;
					cutIdx = i;
				}
			}
			// Truncate: points up to cutIdx + interpolated failure point
			autoPts = autoPts.slice(0, cutIdx + 1);
			autoPts.push({ x: fx, y: fy });
		}

		const pts = _surfaceLine(autoPts, mapData, Z_OFFSET, reflectX);
		const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
		const lineMat = new THREE.LineBasicMaterial({ color: 0x4fc3f7, linewidth: 2 });
		const line = new THREE.Line(lineGeo, lineMat);
		ctx.scene.add(line);
		ctx.autoLine = line;
	}

	// Failure indicators — render red sphere wherever failure_xy exists
	const failGeo = new THREE.SphereGeometry(55, 16, 16);
	[manualStats, autoStats].forEach((stats) => {
		const arr = stats?.failure_xy;
		if (!arr || !Array.isArray(arr) || arr.length < 2) return;
		const fx = arr[0] as number;
		const fy = arr[1] as number;
		const fz = _sampleHeight(fx, fy, mapData);
		const failMat = new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xff1744, emissiveIntensity: 0.5 });
		const failSphere = new THREE.Mesh(failGeo, failMat);
		failSphere.position.set(reflectX(fx, b), fz + 25, fy);
		ctx.wpGroup.add(failSphere);
	});
}, [mapData, waypoints, autodesignResult, manualStats, autoStats]);

	return (
		<div ref={containerRef} className="terrain-view">
			{status === "idle" && (
				<div className="map-placeholder" style={{
					position: "absolute", inset: 0, display: "flex", flexDirection: "column",
					alignItems: "center", justifyContent: "center", pointerEvents: "none",
				}}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M4 15l4-4 5 5 5-5 2 2" />
						<path d="M2 4v16a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2z" />
					</svg>
					<span>3D Terrain View</span>
				</div>
			)}
			{mapData?.height_data && status === "loaded" && (
				<div className="view-overlay top-left">
					Terrain · {waypoints.length} waypoints
				</div>
			)}
		</div>
	);
}

function _sampleHeight(x: number, y: number, mapData: MapPayload): number {
	const hdata = mapData.height_data;
	if (!hdata) return 0;
	const rows = hdata.length;
	const cols = hdata[0].length;
	const b = mapData.bounds;

	// Fractional grid coordinates
	const tx = (x - b.left) / (b.right - b.left);
	const ty = (y - b.bottom) / (b.top - b.bottom);
	const fc = tx * (cols - 1);
	const fr = (1 - ty) * (rows - 1);

	const c0 = Math.floor(fc);
	const c1 = Math.min(c0 + 1, cols - 1);
	const r0 = Math.floor(fr);
	const r1 = Math.min(r0 + 1, rows - 1);

	if (r0 < 0 || r0 >= rows || c0 < 0 || c0 >= cols) return 0;

	const fracC = fc - c0;
	const fracR = fr - r0;

	const h00 = hdata[r0][c0];
	const h10 = hdata[r0][c1];
	const h01 = hdata[r1][c0];
	const h11 = hdata[r1][c1];

	// Bilinear interpolation — matches terrain mesh surface exactly
	const top = h00 + (h10 - h00) * fracC;
	const bottom = h01 + (h11 - h01) * fracC;
	return top + (bottom - top) * fracR;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by) */
function _pointToSegmentDistSq(
	px: number, py: number,
	ax: number, ay: number,
	bx: number, by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		const ex = px - ax;
		const ey = py - ay;
		return ex * ex + ey * ey;
	}
	let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	const rx = px - cx;
	const ry = py - cy;
	return rx * rx + ry * ry;
}

function _surfaceLine(
	points: { x: number; y: number }[],
	mapData: MapPayload,
	zOffset: number,
	refFn: (x: number, b: { left: number; right: number }) => number,
): THREE.Vector3[] {
	const hdata = mapData.height_data!;
	const rows = hdata.length;
	const cols = hdata[0].length;
	const b = mapData.bounds;
	const cellW = (b.right - b.left) / (cols - 1);
	const cellH = (b.top - b.bottom) / (rows - 1);
	const step = Math.min(cellW, cellH);

	const result: THREE.Vector3[] = [];

	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const z = _sampleHeight(a.x, a.y, mapData);
		result.push(new THREE.Vector3(refFn(a.x, b), z + zOffset, a.y));

		const next = points[i + 1];
		if (!next) continue;

		const dx = next.x - a.x;
		const dy = next.y - a.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const n = Math.max(1, Math.ceil(dist / step));

		for (let s = 1; s < n; s++) {
			const t = s / n;
			const sx = a.x + t * dx;
			const sy = a.y + t * dy;
			const sz = _sampleHeight(sx, sy, mapData);
			result.push(new THREE.Vector3(refFn(sx, b), sz + zOffset, sy));
		}
	}

	return result;
}
