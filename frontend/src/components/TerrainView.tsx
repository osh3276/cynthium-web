import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ElevationPayload } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	elevation: ElevationPayload | null;
	status: LoadStatus;
}

export default function TerrainView({ elevation, status }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<{
		scene: THREE.Scene;
		camera: THREE.PerspectiveCamera;
		renderer: THREE.WebGLRenderer;
		controls: OrbitControls;
		mesh: THREE.Mesh | null;
	} | null>(null);

	// Initialize Three.js scene once
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

		// Lights
		const ambient = new THREE.AmbientLight(0x404060, 0.5);
		scene.add(ambient);
		const dir = new THREE.DirectionalLight(0xffffff, 1.2);
		dir.position.set(5000, 8000, 3000);
		scene.add(dir);
		const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
		dir2.position.set(-3000, -2000, -4000);
		scene.add(dir2);

		sceneRef.current = { scene, camera, renderer, controls, mesh: null };

		// Animation loop
		let running = true;
		const animate = () => {
			if (!running) return;
			controls.update();
			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		};
		animate();

		// Resize
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

	// Update mesh when elevation data changes
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;

		// Remove old mesh
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

		if (!elevation || status !== "loaded") return;

		const hdata = elevation.height_data;
		const rows = hdata.length;
		const cols = hdata[0].length;
		const b = elevation.bounds;
		const minZ = elevation.min_elev;
		const maxZ = elevation.max_elev;
		const rangeZ = maxZ - minZ || 1;

		// Real-world coordinates in meters — x/y/z are all meters, 1:1
		const x0 = b.left;
		const x1 = b.right;
		const y0 = b.bottom;
		const y1 = b.top;

		// Build geometry
		const geo = new THREE.BufferGeometry();
		const vertices: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const z = hdata[r][c];
				const t_x = c / (cols - 1);
				const t_y = r / (rows - 1);
				const x = x0 + t_x * (x1 - x0);
				const y = y0 + t_y * (y1 - y0);
				vertices.push(x, z, y);

				// Color based on elevation
				const t = (z - minZ) / rangeZ;
				const rC = 0.15 + t * 0.85;
				const gC = 0.25 + t * 0.55;
				const bC = 0.10 + t * 0.25;
				colors.push(rC, gC, bC);
			}
		}

		for (let r = 0; r < rows - 1; r++) {
			for (let c = 0; c < cols - 1; c++) {
				const i = r * cols + c;
				const j = r * cols + c + 1;
				const k = (r + 1) * cols + c;
				const l = (r + 1) * cols + c + 1;
				indices.push(i, j, k);
				indices.push(j, l, k);
			}
		}

		geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
		geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
		geo.setIndex(indices);
		geo.computeVertexNormals();

		const mat = new THREE.MeshStandardMaterial({
			vertexColors: true,
			flatShading: false,
			side: THREE.DoubleSide,
			roughness: 0.6,
			metalness: 0.1,
		});

		const mesh = new THREE.Mesh(geo, mat);
		ctx.scene.add(mesh);
		ctx.mesh = mesh;

		// Center camera on mesh
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		const cz = (minZ + maxZ) / 2;
		ctx.controls.target.set(cx, cz, cy);

		const width = x1 - x0;
		const height = y1 - y0;
		const maxDim = Math.max(width, height);
		ctx.camera.position.set(cx, cz + maxDim * 0.6, cy - maxDim * 0.8);
		ctx.camera.lookAt(cx, cz, cy);
		ctx.controls.update();
	}, [elevation, status]);

	return (
		<div ref={containerRef} className="terrain-view">
			{status === "idle" && (
				<div className="map-placeholder">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M4 15l4-4 5 5 5-5 2 2" />
						<path d="M2 4v16a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2z" />
					</svg>
					<span>3D Terrain View</span>
				</div>
			)}
			{status === "loaded" && elevation && (
				<div className="view-overlay top-left">
					Terrain ({elevation.downsampled_shape[0]}×{elevation.downsampled_shape[1]})
				</div>
			)}
		</div>
	);
}
