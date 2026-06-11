"""Pathfinding with pre-processed per-site data (no raw GeoTIFF I/O)."""

from __future__ import annotations

import math
import time
from collections import deque
from pathlib import Path

import numpy as np

from .rover_settings import RoverSettings
from .simulation import run_simulation
from .site_rasters import _load_site_bounds, load_site_data


class _Window:
	"""Minimal window class replacing rasterio.windows.Window."""
	__slots__ = ("col_off", "row_off", "width", "height")

	def __init__(self, col_off: float, row_off: float, width: float, height: float):
		self.col_off = col_off
		self.row_off = row_off
		self.width = width
		self.height = height

	def round_offsets(self) -> "_Window":
		return _Window(round(self.col_off), round(self.row_off), self.width, self.height)

	def round_lengths(self) -> "_Window":
		return _Window(self.col_off, self.row_off, round(self.width), round(self.height))


def _window_from_bounds(left: float, bottom: float, right: float, top: float, transform) -> _Window:
	"""Compute pixel window from geographic bounds, like rasterio.windows.from_bounds."""
	inv = ~transform
	col_ul, row_ul = inv * (left, top)
	col_ur, row_ur = inv * (right, top)
	col_ll, row_ll = inv * (left, bottom)
	col_lr, row_lr = inv * (right, bottom)
	col_off = min(col_ul, col_ur, col_ll, col_lr)
	row_off = min(row_ul, row_ur, row_ll, row_lr)
	col_end = max(col_ul, col_ur, col_ll, col_lr)
	row_end = max(row_ul, row_ur, row_ll, row_lr)
	return _Window(col_off, row_off, col_end - col_off, row_end - row_off)


HERE = Path(__file__).resolve().parent.parent.parent
_SNAP_RADIUS = 200
_MIN_TRAV_NEIGHBORS = 1


def _dijkstra(
	*,
	start_rc: tuple[int, int],
	goal_rc: tuple[int, int],
	traversable: np.ndarray,
	cell_cost: np.ndarray,
	res_x: float,
	res_y: float,
) -> dict | None:
	"""A* with 16-directional movement and admissible straight-line heuristic."""
	import heapq

	H, W = traversable.shape
	sr, sc = start_rc
	gr, gc = goal_rc
	if not (0 <= sr < H and 0 <= sc < W and 0 <= gr < H and 0 <= gc < W):
		return None
	if not bool(traversable[sr, sc]) or not bool(traversable[gr, gc]):
		return None

	INF = float("inf")
	g_cost = np.full((H, W), INF, dtype=np.float64)
	parent_r = np.full((H, W), -1, dtype=np.int32)
	parent_c = np.full((H, W), -1, dtype=np.int32)

	g_cost[sr, sc] = 0.0
	parent_r[sr, sc] = sr
	parent_c[sr, sc] = sc

	def heuristic(r, c):
		return math.hypot(float(gc - c) * res_x, float(gr - r) * res_y)

	dirs = [
		(-1,0), (1,0), (0,-1), (0,1),
		(-1,-1), (-1,1), (1,-1), (1,1),
		(-1,-2), (1,-2), (-2,-1), (2,-1),
		(-2,1), (2,1), (-1,2), (1,2),
	]

	heap = [(heuristic(sr, sc), 0.0, sr, sc)]
	expanded = 0

	while heap:
		_, g_val, r, c = heapq.heappop(heap)
		if g_val > g_cost[r, c]:
			continue
		if r == gr and c == gc:
			break
		expanded += 1

		for dr, dc in dirs:
			nr, nc = r + dr, c + dc
			if nr < 0 or nc < 0 or nr >= H or nc >= W:
				continue
			if not bool(traversable[nr, nc]):
				continue
			if max(abs(dr), abs(dc)) == 2:
				mr = r + dr // 2 if abs(dr) == 2 else r
				mc = c + dc // 2 if abs(dc) == 2 else c
				if mr < 0 or mc < 0 or mr >= H or mc >= W:
					continue
				if not bool(traversable[mr, mc]):
					continue

			step = math.hypot(float(dc) * res_x, float(dr) * res_y)
			avg_cost = 0.5 * (float(cell_cost[r, c]) + float(cell_cost[nr, nc]))
			cand = g_val + step * avg_cost

			if cand < g_cost[nr, nc]:
				g_cost[nr, nc] = cand
				parent_r[nr, nc] = r
				parent_c[nr, nc] = c
				f = cand + heuristic(nr, nc)
				heapq.heappush(heap, (f, cand, nr, nc))

	if g_cost[gr, gc] == INF:
		return None

	path: list[tuple[int, int]] = []
	r, c = gr, gc
	for _ in range(H * W):
		path.append((r, c))
		pr, pc = int(parent_r[r, c]), int(parent_c[r, c])
		if pr == r and pc == c:
			break
		if pr < 0 or pc < 0:
			break
		r, c = pr, pc
	else:
		return None
	path.reverse()
	return {"path_rc": path, "total_cost": float(g_cost[gr, gc]), "expanded": expanded}


def _snap_to_traversable(
	rc: tuple[int, int],
	traversable: np.ndarray,
	max_radius: int = _SNAP_RADIUS,
) -> tuple[int, int] | None:
	r, c = int(rc[0]), int(rc[1])
	H, W = traversable.shape
	dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

	def _neighbor_count(cr: int, cc: int) -> int:
		n = 0
		for dr, dc in dirs:
			nr, nc = cr + dr, cc + dc
			if 0 <= nr < H and 0 <= nc < W and traversable[nr, nc]:
				n += 1
		return n

	if 0 <= r < H and 0 <= c < W and traversable[r, c] and _neighbor_count(r, c) >= _MIN_TRAV_NEIGHBORS:
		return (r, c)

	seen = np.zeros_like(traversable, dtype=bool)
	q = deque([(r, c, 0)])
	if 0 <= r < H and 0 <= c < W:
		seen[r, c] = True

	while q:
		cr, cc, d = q.popleft()
		if d > max_radius:
			return None
		if traversable[cr, cc] and d > 0 and _neighbor_count(cr, cc) >= _MIN_TRAV_NEIGHBORS:
			return (cr, cc)
		for dr, dc in dirs:
			nr, nc = cr + dr, cc + dc
			if 0 <= nr < H and 0 <= nc < W and not seen[nr, nc]:
				seen[nr, nc] = True
				q.append((nr, nc, d + 1))
	return None


def compute_autodesign(
	site_name: str,
	waypoints_xy: list[list[float]],
	*,
	slope_weight: float = 0.3,
	sun_weight: float = 0.3,
	meteor_weight: float = 0.05,
	pad_cells: int = 200,
	max_expanded: int = 500000,
	path_mode: str = "segment",
	rover_mass_kg: float = 150.0,
	rover_power_hp: float = 0.2,
	rover_friction_coeff: float = 0.6,
	rover_crr: float = 0.1,
) -> dict:
	"""Compute a path and validate it via simulation with the rover params."""
	t_start = time.perf_counter()
	rover_mu = rover_friction_coeff
	max_climbable = max(1.0, math.degrees(math.atan(rover_mu)))

	sites = _load_site_bounds()
	found = any(s["name"] == site_name for s in sites)
	if not found:
		return {"error": f"Site '{site_name}' not found"}

	if len(waypoints_xy) < 2:
		return {"error": "Need at least 2 waypoints"}

	user_wps: list[tuple[float, float]] = []
	for wp in waypoints_xy:
		if not (isinstance(wp, (list, tuple)) and len(wp) == 2):
			return {"error": f"Invalid waypoint format: {wp}"}
		user_wps.append((float(wp[0]), float(wp[1])))

	blocked_pixels: set[tuple[int, int]] = set()
	site_path_xy: list[list[float]] = []

	for attempt in range(10):
		all_xy: list[tuple[float, float]] = []
		seg_kw = dict(
			site_name=site_name,
			min_slope_deg=0.0,
			max_slope_deg=max_climbable,
			slope_weight=slope_weight,
			sun_weight=sun_weight,
			meteor_weight=meteor_weight,
			pad_cells=pad_cells,
			max_expanded=max_expanded,
			blocked_pixels=blocked_pixels if blocked_pixels else None,
		)

		if path_mode == "direct":
			seg, err = _compute_segment(start_xy=user_wps[0], goal_xy=user_wps[-1], **seg_kw)
			if err:
				return {"error": err}
			if not seg or len(seg) < 2:
				return {"error": "Path too short"}
			all_xy = seg
		else:
			for i in range(len(user_wps) - 1):
				seg, err = _compute_segment(start_xy=user_wps[i], goal_xy=user_wps[i + 1], **seg_kw)
				if err:
					return {"error": f"Segment {i+1}: {err}"}
				if not seg or len(seg) < 2:
					return {"error": f"Segment {i+1}: path too short"}
				if i == 0:
					all_xy.extend(seg)
				else:
					all_xy.extend(seg[1:])

		if len(all_xy) < 2:
			return {"error": "Combined path too short"}

		site_path_xy = [[float(x), float(y)] for x, y in all_xy]

		# Validate path with simulation
		rover = RoverSettings(
			mass_kg=rover_mass_kg,
			power_hp=rover_power_hp,
			wheel_friction_coeff=rover_friction_coeff,
			rolling_resistance_coeff=rover_crr,
		)
		try:
			result = run_simulation(site_name, site_path_xy, rover)
			feasible = result.get("traverse_feasible", 0) >= 0.5
		except Exception:
			feasible = False

		if feasible:
			elapsed = time.perf_counter() - t_start
			print(f"[TIMER] Autodesign {elapsed:.1f}s attempt={attempt+1} | site={site_name} wps={len(waypoints_xy)} mode={path_mode} μ={rover_mu} → feasible")
			return {"path_xy": site_path_xy, "total_cost": 0.0, "expanded": 0}

		# Block the failed path and retry using the site's elevation transform
		site_data = load_site_data(site_name)
		if site_data and site_data.get("elevation_meta"):
			tf = site_data["elevation_meta"]["transform"]
			inv = ~tf
			for x, y in all_xy:
				c, r = inv * (float(x), float(y))
				blocked_pixels.add((int(round(r)), int(round(c))))

		print(f"[TIMER] Autodesign attempt {attempt+1} infeasible, retrying with {len(blocked_pixels)} cells blocked")

	elapsed = time.perf_counter() - t_start
	print(f"[TIMER] Autodesign {elapsed:.1f}s | gave up after 10 attempts")
	return {"error": "No traversable path found after 10 attempts — the rover cannot handle this terrain with the current settings"}


def _compute_segment(
	*,
	site_name: str,
	start_xy: tuple[float, float],
	goal_xy: tuple[float, float],
	min_slope_deg: float,
	max_slope_deg: float,
	slope_weight: float,
	sun_weight: float,
	meteor_weight: float = 0.0,
	pad_cells: int,
	max_expanded: int,
	blocked_pixels: set | None = None,
) -> tuple[list[tuple[float, float]] | None, str | None]:
	"""Compute a single segment using pre-processed per-site data."""
	site_data = load_site_data(site_name)
	if site_data is None or site_data["elevation"] is None:
		return None, f"no data for site '{site_name}'"

	elev = site_data["elevation"]
	elev_meta = site_data["elevation_meta"]
	transform = elev_meta["transform"]
	inv = ~transform

	H, W = elev.shape

	sc_f, sr_f = inv * (float(start_xy[0]), float(start_xy[1]))
	gc_f, gr_f = inv * (float(goal_xy[0]), float(goal_xy[1]))
	sr = int(round(float(sr_f)))
	sc = int(round(float(sc_f)))
	gr = int(round(float(gr_f)))
	gc = int(round(float(gc_f)))

	if not (0 <= sc < W and 0 <= sr < H):
		return None, f"start ({start_xy[0]:.1f}, {start_xy[1]:.1f}) outside site elevation"
	if not (0 <= gc < W and 0 <= gr < H):
		return None, f"goal ({goal_xy[0]:.1f}, {goal_xy[1]:.1f}) outside site elevation"

	dr = abs(gr - sr)
	dc = abs(gc - sc)
	dist_cells = int(max(dr, dc))
	pad = int(max(50, min(pad_cells, dist_cells * 0.5 + 50)))

	r0 = max(0, min(sr, gr) - pad)
	r1 = min(H, max(sr, gr) + pad + 1)
	c0 = max(0, min(sc, gc) - pad)
	c1 = min(W, max(sc, gc) + pad + 1)

	win_h = int(r1 - r0)
	win_w = int(c1 - c0)
	max_nodes = 500000
	area = win_h * win_w
	stride = 1
	if area > max_nodes:
		stride = int(math.ceil(math.sqrt(float(area) / float(max_nodes))))
		stride = max(1, stride)

	# Extract window from pre-cropped elevation
	elev_win = elev[r0:r1, c0:c1].copy().astype(np.float32)
	elev_win = elev_win[::stride, ::stride]

	px_res_x = float(abs(transform.a))
	px_res_y = float(abs(transform.e))

	# Compute slope from elevation window
	_elev_filled = np.where(np.isfinite(elev_win), elev_win, 0)
	_padded = np.pad(_elev_filled, 1, mode="edge")
	gx, gy = np.gradient(_padded, px_res_y * float(stride), px_res_x * float(stride))
	gx = gx[1:-1, 1:-1]
	gy = gy[1:-1, 1:-1]
	slope = np.degrees(np.arctan(np.sqrt(np.square(gx) + np.square(gy))))

	# Load illumination
	illum = site_data.get("illumination")
	if illum is not None and site_data.get("illumination_meta"):
		illum_meta = site_data["illumination_meta"]
		illum_tf = illum_meta["transform"]
		# Find corresponding window in illumination raster
		# Map geographic coords of the elevation window to illumination pixel coords
		x0 = transform.c + c0 * transform.a
		y1 = transform.f + r0 * transform.e
		x1_val = transform.c + c1 * transform.a
		y0 = transform.f + r1 * transform.e
		from scipy.ndimage import zoom
		illum_window = _window_from_bounds(x0, y0, x1_val, y1, transform=illum_tf)
		illum_window = illum_window.round_offsets().round_lengths()
		if illum_window.width > 0 and illum_window.height > 0:
			r_s = int(illum_window.row_off)
			r_e = int(r_s + illum_window.height)
			c_s = int(illum_window.col_off)
			c_e = int(c_s + illum_window.width)
			illum_crop = illum[r_s:r_e, c_s:c_e].astype(np.float32)
			if illum_crop.shape != elev_win.shape:
				illum_crop = zoom(illum_crop, (elev_win.shape[0] / illum_crop.shape[0], elev_win.shape[1] / illum_crop.shape[1]), order=0)
		else:
			illum_crop = np.full_like(elev_win, 0.5)
	else:
		illum_crop = np.full_like(elev_win, 0.5)

	# Load meteor
	meteor_arr = site_data.get("meteor")
	if meteor_arr is not None and site_data.get("meteor_meta"):
		meteor_meta = site_data["meteor_meta"]
		meteor_tf = meteor_meta["transform"]
		from scipy.ndimage import zoom
		meteor_window = _window_from_bounds(x0, y0, x1_val, y1, transform=meteor_tf)
		meteor_window = meteor_window.round_offsets().round_lengths()
		if meteor_window.width > 0 and meteor_window.height > 0:
			r_s = int(meteor_window.row_off)
			r_e = int(r_s + meteor_window.height)
			c_s = int(meteor_window.col_off)
			c_e = int(c_s + meteor_window.width)
			meteor_crop = meteor_arr[r_s:r_e, c_s:c_e].astype(np.float32)
			if meteor_crop.shape != elev_win.shape:
				meteor_crop = zoom(meteor_crop, (elev_win.shape[0] / meteor_crop.shape[0], elev_win.shape[1] / meteor_crop.shape[1]), order=0)
		else:
			meteor_crop = np.full_like(elev_win, 0.0)
	else:
		meteor_crop = np.full_like(elev_win, 0.0)

	# Normalizations
	meteor_norm = np.full_like(meteor_crop, 0.0, dtype=np.float32)
	finite_meteor = meteor_crop[np.isfinite(meteor_crop)]
	if finite_meteor.size > 0:
		lo = float(np.min(finite_meteor))
		hi = float(np.max(finite_meteor))
		if hi > lo:
			meteor_norm = ((meteor_crop - lo) / (hi - lo)).astype(np.float32)
			meteor_norm = np.clip(meteor_norm, 0.0, 1.0)
			meteor_norm[~np.isfinite(meteor_norm)] = 0.0

	# All cells traversable at coarse resolution
	traversable = np.ones(slope.shape, dtype=bool)

	if blocked_pixels:
		for rr, cc in blocked_pixels:
			rr_local = (rr - r0) // stride
			cc_local = (cc - c0) // stride
			if 0 <= rr_local < traversable.shape[0] and 0 <= cc_local < traversable.shape[1]:
				traversable[rr_local, cc_local] = False

	max_slope_val = max(60.0, float(max_slope_deg))
	slope_norm = np.clip(slope.astype(np.float32) / max_slope_val, 0.0, 1.0)

	illum_norm = np.full_like(illum_crop, 0.5, dtype=np.float32)
	finite_illum = illum_crop[np.isfinite(illum_crop)]
	if finite_illum.size > 0:
		lo = float(np.min(finite_illum))
		hi = float(np.max(finite_illum))
		if hi > lo:
			illum_norm = ((illum_crop - lo) / (hi - lo)).astype(np.float32)
			illum_norm = np.clip(illum_norm, 0.0, 1.0)
			illum_norm[~np.isfinite(illum_norm)] = 0.5

	cell_cost = (
		1.0
		+ (float(max(0.0, slope_weight)) * slope_norm)
		+ (float(max(0.0, sun_weight)) * (1.0 - illum_norm))
		+ (float(max(0.0, meteor_weight)) * meteor_norm)
	).astype(np.float32)
	cell_cost = np.clip(cell_cost, 0.01, np.inf).astype(np.float32)
	bad = ~np.isfinite(elev_win) | ~np.isfinite(slope)
	cell_cost[bad] = 1e6

	start_local = (int((sr - r0) // stride), int((sc - c0) // stride))
	goal_local = (int((gr - r0) // stride), int((gc - c0) // stride))

	if 0 <= start_local[0] < traversable.shape[0] and 0 <= start_local[1] < traversable.shape[1]:
		if not traversable[start_local[0], start_local[1]]:
			snapped = _snap_to_traversable(start_local, traversable)
			if snapped is not None:
				start_local = snapped
		traversable[start_local[0], start_local[1]] = True
		if not np.isfinite(cell_cost[start_local[0], start_local[1]]):
			cell_cost[start_local[0], start_local[1]] = 1.0
	if 0 <= goal_local[0] < traversable.shape[0] and 0 <= goal_local[1] < traversable.shape[1]:
		if not traversable[goal_local[0], goal_local[1]]:
			snapped = _snap_to_traversable(goal_local, traversable)
			if snapped is not None:
				goal_local = snapped
		traversable[goal_local[0], goal_local[1]] = True
		if not np.isfinite(cell_cost[goal_local[0], goal_local[1]]):
			cell_cost[goal_local[0], goal_local[1]] = 1.0

	res_x = float(abs(transform.a)) * float(stride)
	res_y = float(abs(transform.e)) * float(stride)

	result = _dijkstra(
		start_rc=start_local,
		goal_rc=goal_local,
		traversable=traversable,
		cell_cost=cell_cost,
		res_x=res_x,
		res_y=res_y,
	)
	if result is None or not result.get("path_rc"):
		return None, "no path found"

	a, b, c_ = float(transform.a), float(transform.b), float(transform.c)
	d, e, f_ = float(transform.d), float(transform.e), float(transform.f)
	xy: list[tuple[float, float]] = []
	for r, c in result["path_rc"]:
		grr = float(r0 + (int(r) * int(stride))) + 0.5
		gcc = float(c0 + (int(c) * int(stride))) + 0.5
		x = (a * gcc) + (b * grr) + c_
		y = (d * gcc) + (e * grr) + f_
		xy.append((float(x), float(y)))

	if xy:
		xy[0] = (float(start_xy[0]), float(start_xy[1]))
		xy[-1] = (float(goal_xy[0]), float(goal_xy[1]))

	return xy, None
