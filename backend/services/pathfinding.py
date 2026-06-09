from __future__ import annotations

import math
import re
import time
from collections import deque
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from .site_rasters import (
	COARSE_ELEVATION_PATH,
	ILLUMINATION_PATH,
	METEOR_PATH,
	_load_site_bounds,
)
from .theta_star import theta_star

HERE = Path(__file__).resolve().parent.parent
_SNAP_RADIUS = 50
_MIN_TRAV_NEIGHBORS = 3


def _snap_to_traversable(
	rc: tuple[int, int],
	traversable: np.ndarray,
	max_radius: int = _SNAP_RADIUS,
) -> tuple[int, int] | None:
	"""BFS from rc to find the nearest traversable cell with enough traversable neighbors."""
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
	slope_weight: float = 1.0,
	sun_weight: float = 0.5,
	meteor_weight: float = 0.0,
	pad_cells: int = 200,
	max_expanded: int = 500000,
	path_mode: str = "segment",
	rover_mu: float = 0.6,
) -> dict:
	"""Compute the optimal path for the current rover using Theta*.

	Derives max climbable slope from rover's wheel friction (mu),
	so the path is tailored to what this rover can handle.
	Returns a dict with "path_xy" on success, or "error" on failure.
	"""
	t_start = time.perf_counter()

	# Rover's max climbable slope governs the cost normalization
	max_climbable = max(1.0, math.degrees(math.atan(rover_mu)))

	bounds_dict = _load_site_bounds()
	if site_name not in bounds_dict:
		return {"error": f"Site '{site_name}' not found"}

	if len(waypoints_xy) < 2:
		return {"error": "Need at least 2 waypoints"}

	user_wps: list[tuple[float, float]] = []
	for wp in waypoints_xy:
		if not (isinstance(wp, (list, tuple)) and len(wp) == 2):
			return {"error": f"Invalid waypoint format: {wp}"}
		user_wps.append((float(wp[0]), float(wp[1])))

	all_xy: list[tuple[float, float]] = []
	seg_kw = dict(
		min_slope_deg=0.0,
		max_slope_deg=max_climbable,
		slope_weight=slope_weight,
		sun_weight=sun_weight,
		meteor_weight=meteor_weight,
		pad_cells=pad_cells,
		max_expanded=max_expanded,
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

	elapsed = time.perf_counter() - t_start
	print(f"[TIMER] Autodesign {elapsed:.1f}s | site={site_name} wps={len(waypoints_xy)} mode={path_mode} μ={rover_mu} max_climb={max_climbable:.1f}°")

	return {
		"path_xy": site_path_xy,
		"total_cost": 0.0,
		"expanded": 0,
	}


def _compute_segment(
	*,
	start_xy: tuple[float, float],
	goal_xy: tuple[float, float],
	min_slope_deg: float,
	max_slope_deg: float,
	slope_weight: float,
	sun_weight: float,
	meteor_weight: float = 0.0,
	pad_cells: int,
	max_expanded: int,
) -> tuple[list[tuple[float, float]] | None, str | None]:
	"""Compute a single Theta* segment. Returns (path, error_message)."""
	with rasterio.open(str(COARSE_ELEVATION_PATH)) as src:
		transform = src.transform
		inv = ~transform

		sc_f, sr_f = inv * (float(start_xy[0]), float(start_xy[1]))
		gc_f, gr_f = inv * (float(goal_xy[0]), float(goal_xy[1]))
		sr = int(round(float(sr_f)))
		sc = int(round(float(sc_f)))
		gr = int(round(float(gr_f)))
		gc = int(round(float(gc_f)))

		H = int(src.height)
		W = int(src.width)

		if not (0 <= sc < W and 0 <= sr < H):
			return None, f"start ({start_xy[0]:.1f}, {start_xy[1]:.1f}) outside elevation raster"
		if not (0 <= gc < W and 0 <= gr < H):
			return None, f"goal ({goal_xy[0]:.1f}, {goal_xy[1]:.1f}) outside elevation raster"

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
		max_nodes = 250000
		area = win_h * win_w
		stride = 1
		if area > max_nodes:
			stride = int(math.ceil(math.sqrt(float(area) / float(max_nodes))))
			stride = max(1, stride)

		elev = src.read(
			1,
			window=rasterio.windows.Window(int(c0), int(r0), int(c1 - c0), int(r1 - r0)),
		).astype(np.float32)
		elev = elev[::stride, ::stride]

	px_res_x = float(abs(transform.a))
	px_res_y = float(abs(transform.e))

	_elev_filled = np.where(np.isfinite(elev), elev, 0)
	_padded = np.pad(_elev_filled, 1, mode="edge")
	gx, gy = np.gradient(_padded, px_res_y * float(stride), px_res_x * float(stride))
	gx = gx[1:-1, 1:-1]
	gy = gy[1:-1, 1:-1]
	slope = np.degrees(np.arctan(np.sqrt(np.square(gx) + np.square(gy))))

	try:
		with rasterio.open(str(ILLUMINATION_PATH)) as illum_src:
			illum_window = from_bounds(
				float(transform.c + c0 * float(transform.a)),
				float(transform.f + r0 * float(transform.e) + win_h * float(transform.e)),
				float(transform.c + c1 * float(transform.a)),
				float(transform.f + r0 * float(transform.e)),
				transform=illum_src.transform,
			)
			illum_window = illum_window.round_offsets().round_lengths()
			if illum_window.width > 0 and illum_window.height > 0:
				illum = illum_src.read(1, window=illum_window, boundless=True, fill_value=float("nan")).astype(np.float32)
				if illum.shape != elev.shape:
					from scipy.ndimage import zoom
					illum = zoom(illum, (elev.shape[0] / illum.shape[0], elev.shape[1] / illum.shape[1]), order=0)
			else:
				illum = np.full_like(elev, 0.5)
	except Exception:
		illum = np.full_like(elev, 0.5)

	try:
		with rasterio.open(str(METEOR_PATH)) as meteor_src:
			meteor_window = from_bounds(
				float(transform.c + c0 * float(transform.a)),
				float(transform.f + r0 * float(transform.e) + win_h * float(transform.e)),
				float(transform.c + c1 * float(transform.a)),
				float(transform.f + r0 * float(transform.e)),
				transform=meteor_src.transform,
			)
			meteor_window = meteor_window.round_offsets().round_lengths()
			if meteor_window.width > 0 and meteor_window.height > 0:
				meteor = meteor_src.read(1, window=meteor_window, boundless=True, fill_value=float("nan")).astype(np.float32)
				if meteor.shape != elev.shape:
					from scipy.ndimage import zoom
					meteor = zoom(meteor, (elev.shape[0] / meteor.shape[0], elev.shape[1] / meteor.shape[1]), order=0)
			else:
				meteor = np.full_like(elev, 0.0)
	except Exception:
		meteor = np.full_like(elev, 0.0)

	meteor_norm = np.full_like(meteor, 0.0, dtype=np.float32)
	finite_meteor = meteor[np.isfinite(meteor)]
	if finite_meteor.size > 0:
		lo = float(np.min(finite_meteor))
		hi = float(np.max(finite_meteor))
		if hi > lo:
			meteor_norm = ((meteor - lo) / (hi - lo)).astype(np.float32)
			meteor_norm = np.clip(meteor_norm, 0.0, 1.0)
			meteor_norm[~np.isfinite(meteor_norm)] = 0.0

	traversable = np.isfinite(elev)
	traversable &= np.isfinite(slope)

	max_slope_val = float(max_slope_deg) if max_slope_deg > 0 else 1.0
	slope_norm = np.clip(slope.astype(np.float32) / max_slope_val, 0.0, 1.0)

	illum_norm = np.full_like(illum, 0.5, dtype=np.float32)
	finite_illum = illum[np.isfinite(illum)]
	if finite_illum.size > 0:
		lo = float(np.min(finite_illum))
		hi = float(np.max(finite_illum))
		if hi > lo:
			illum_norm = ((illum - lo) / (hi - lo)).astype(np.float32)
			illum_norm = np.clip(illum_norm, 0.0, 1.0)
			illum_norm[~np.isfinite(illum_norm)] = 0.5

	cell_cost = (
		1.0
		+ (float(max(0.0, slope_weight)) * slope_norm)
		+ (float(max(0.0, sun_weight)) * (1.0 - illum_norm))
		+ (float(max(0.0, meteor_weight)) * meteor_norm)
	).astype(np.float32)
	cell_cost = np.clip(cell_cost, 0.01, np.inf).astype(np.float32)

	start_local = (int((sr - r0) // stride), int((sc - c0) // stride))
	goal_local = (int((gr - r0) // stride), int((gc - c0) // stride))

	# Snap start/goal to nearest traversable cell if they land on steep terrain
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

	result = theta_star(
		start_rc=start_local,
		goal_rc=goal_local,
		traversable=traversable,
		cell_cost=cell_cost,
		res_x=res_x,
		res_y=res_y,
		max_expanded=int(max_expanded),
	)
	if result is None:
		return None, "no traversable path exists — try increasing the max slope or adjusting waypoints"
	if not result["path_rc"]:
		return None, "no traversable path exists between these waypoints with current slope constraints"

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
