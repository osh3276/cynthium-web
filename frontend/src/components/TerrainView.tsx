import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MapPayload, Waypoint, AutopathResult } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	mapData: MapPayload | null;
	status: LoadStatus;
	waypoints: Waypoint[];
	autopathResult: AutopathResult | null;
}

export default function TerrainView({ mapData, status, waypoints, autopathResult }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<{
		scene: THREE.Scene;
		camera: THREE.PerspectiveCamera;
		renderer: THREE.WebGLRenderer;
		controls: OrbitControls;
		mesh: THREE.Mesh | null;
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

		const ambient = new THREE.AmbientLight(0x404060, 0.5);
		scene.add(ambient);
		const dir = new THREE.DirectionalLight(0xffffff, 1.2);
		dir.position.set(5000, 8000, 3000);
		scene.add(dir);
		const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
		dir2.position.set(-3000, -2000, -4000);
		scene.add(dir2);

		const wpGroup = new THREE.Group();
		scene.add(wpGroup);

		sceneRef.current = { scene, camera, renderer, controls, mesh: null, wpGroup, pathLine: null, autoLine: null };

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

		if (!mapData || status !== "loaded" || !mapData.height_data) return;

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
				const t_x = c / (cols - 1);
				// hdata rows go north→south (row 0 = top), so flip Y:
				// row 0 → y1 (top), row rows-1 → y0 (bottom)
				const t_y = (rows - 1 - r) / (rows - 1);
				vertices.push(x0 + t_x * (x1 - x0), z, y0 + t_y * (y1 - y0));
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
			color: 0x666666,
			flatShading: false,
			side: THREE.DoubleSide,
			roughness: 0.8,
			metalness: 0.05,
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

	// Update waypoints and paths
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;

		// Clear old waypoints
		while (ctx.wpGroup.children.length > 0) {
			const child = ctx.wpGroup.children[0];
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
				else child.material.dispose();
			}
			ctx.wpGroup.remove(child);
		}

		// Clear path lines
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

		// Add waypoint spheres
		const sphereGeo = new THREE.SphereGeometry(40, 12, 12);
		const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4488ff, emissiveIntensity: 0.3 });
		waypoints.forEach((wp) => {
			const s = new THREE.Mesh(sphereGeo, sphereMat);
			const z = _sampleHeight(wp.x, wp.y, mapData!);
			s.position.set(wp.x, z + 20, wp.y);
			ctx.wpGroup.add(s);
		});

		// Manual path line
		if (waypoints.length > 1) {
			const pts = waypoints.map((wp) => {
				const z = _sampleHeight(wp.x, wp.y, mapData!);
				return new THREE.Vector3(wp.x, z + 5, wp.y);
			});
			const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
			const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
			const line = new THREE.Line(lineGeo, lineMat);
			ctx.scene.add(line);
			ctx.pathLine = line;
		}

		// Autopath line
		if (autopathResult && autopathResult.path_xy.length > 1) {
			const pts = autopathResult.path_xy.map((p) => {
				const z = _sampleHeight(p[0], p[1], mapData!);
				return new THREE.Vector3(p[0], z + 5, p[1]);
			});
			const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
			const lineMat = new THREE.LineBasicMaterial({ color: 0x4fc3f7, linewidth: 2 });
			const line = new THREE.Line(lineGeo, lineMat);
			ctx.scene.add(line);
			ctx.autoLine = line;
		}
	}, [mapData, waypoints, autopathResult]);

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
	const tx = (x - b.left) / (b.right - b.left);
	const ty = (y - b.bottom) / (b.top - b.bottom);
	const c = Math.round(tx * (cols - 1));
	const r = Math.round((1 - ty) * (rows - 1));
	if (r < 0 || r >= rows || c < 0 || c >= cols) return 0;
	return hdata[r][c];
}
