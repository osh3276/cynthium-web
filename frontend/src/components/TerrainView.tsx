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

		const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
		camera.position.set(0, 500, 800);
		camera.lookAt(0, 0, 0);

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
		dir.position.set(500, 800, 300);
		scene.add(dir);
		const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
		dir2.position.set(-300, -200, -400);
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
		const minZ = elevation.min_elev;
		const maxZ = elevation.max_elev;
		const rangeZ = maxZ - minZ || 1;

		// Build geometry
		const geo = new THREE.BufferGeometry();
		const vertices: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];

		// Scale: map matrix coords to a unit space
		const scaleX = 1;
		const scaleZ = 1;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const z = hdata[r][c];
				const x = (c / (cols - 1) - 0.5) * scaleX * cols;
				const y = (r / (rows - 1) - 0.5) * scaleZ * rows * -1;
				const elev = z;
				vertices.push(x, elev, y);

				// Color based on elevation
				const t = (elev - minZ) / rangeZ;
				const rC = 0.2 + t * 0.8;
				const gC = 0.3 + t * 0.5;
				const bC = 0.1 + t * 0.3;
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
		const center = new THREE.Vector3(0, (minZ + maxZ) / 2, 0);
		ctx.controls.target.copy(center);
		const maxDim = Math.max(cols, rows, rangeZ);
		ctx.camera.position.set(maxDim * 0.6, maxDim * 0.5, maxDim * 0.6);
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
