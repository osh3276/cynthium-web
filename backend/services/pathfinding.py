from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from .site_rasters import COARSE_ELEVATION_PATH, ILLUMINATION_PATH, _load_site_bounds
from .theta_star import theta_star

HERE = Path(__file__).resolve().parent.parent


def compute_autopath(
	site_name: str,
	waypoints_xy: list[list[float]],
	*,
	min_slope_deg: float = 0.0,
	max_slope_deg: float = 20.0,
	slope_weight: float = 1.0,
	sun_weight: float = 0.5,
	pad_cells: int = 200,
	max_expanded: int = 500000,
) -> dict | None:
	"""Compute an autopath between waypoints using Theta*.

	Args:
		site_name: Name of the site (used for bounds).
		waypoints_xy: List of [x, y] world coordinates (at least 2).
		All other params match the original Theta* config.

	Returns:
		dict with path_xy, total_cost, expanded, or None if failed.
	"""
	bounds_dict = _load_site_bounds()
	if site_name not in bounds_dict:
		return None
	b = bounds_dict[site_name]

	if len(waypoints_xy) < 2:
		return None

	# Validate & convert waypoints
	user_wps: list[tuple[float, float]] = []
	for wp in waypoints_xy:
		if not (isinstance(wp, (list, tuple)) and len(wp) == 2):
			return None
		user_wps.append((float(wp[0]), float(wp[1])))

	# Compute path segment by segment
	all_xy: list[tuple[float, float]] = []
	for i in range(len(user_wps) - 1):
		seg = _compute_segment(
			start_xy=user_wps[i],
			goal_xy=user_wps[i + 1],
			min_slope_deg=min_slope_deg,
			max_slope_deg=max_slope_deg,
			slope_weight=slope_weight,
			sun_weight=sun_weight,
			pad_cells=pad_cells,
			max_expanded=max_expanded,
		)
		if not seg or len(seg) < 2:
			return None

		if i == 0:
			all_xy.extend(seg)
		else:
			all_xy.extend(seg[1:])

	if len(all_xy) < 2:
		return None

	return {
		"path_xy": [[float(x), float(y)] for x, y in all_xy],
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
	pad_cells: int,
	max_expanded: int,
) -> list[tuple[float, float]] | None:
	"""Compute a single Theta* segment between two waypoints."""
	# Load elevation data
	with rasterio.open(str(COARSE_ELEVATION_PATH)) as src:
		transform = src.transform
		inv = ~transform

		# Convert world coords to pixel coords
		sc_f, sr_f = inv * (float(start_xy[0]), float(start_xy[1]))
		gc_f, gr_f = inv * (float(goal_xy[0]), float(goal_xy[1]))
		sr = int(round(float(sr_f)))
		sc = int(round(float(sc_f)))
		gr = int(round(float(gr_f)))
		gc = int(round(float(gc_f)))

		H = int(src.height)
		W = int(src.width)
		if not (0 <= sr < H and 0 <= sc < W and 0 <= gr < H and 0 <= gc < W):
			return None

		# Compute a padded window around the start-goal line
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

		# Read elevation
		elev = src.read(
			1,
			window=rasterio.windows.Window(int(c0), int(r0), int(c1 - c0), int(r1 - r0)),
		).astype(np.float32)
		elev = elev[::stride, ::stride]

	# Compute slope from elevation
	_elev_filled = np.where(np.isfinite(elev), elev, 0)
	_padded = np.pad(_elev_filled, 1, mode="edge")
	gx, gy = np.gradient(_padded, 40.0 * stride, 40.0 * stride)
	gx = gx[1:-1, 1:-1]
	gy = gy[1:-1, 1:-1]
	slope = np.degrees(np.arctan(np.sqrt(gx**2 + gy**2)))

	# Load illumination
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

	# Build traversable mask and cell cost
	traversable = np.isfinite(elev)
	traversable &= slope >= min_slope_deg
	traversable &= slope <= max_slope_deg

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
	).astype(np.float32)
	cell_cost = np.clip(cell_cost, 0.01, np.inf).astype(np.float32)

	# Local start/goal
	start_local = (int((sr - r0) // stride), int((sc - c0) // stride))
	goal_local = (int((gr - r0) // stride), int((gc - c0) // stride))

	if 0 <= start_local[0] < traversable.shape[0] and 0 <= start_local[1] < traversable.shape[1]:
		traversable[start_local[0], start_local[1]] = True
		if not np.isfinite(cell_cost[start_local[0], start_local[1]]):
			cell_cost[start_local[0], start_local[1]] = 1.0
	if 0 <= goal_local[0] < traversable.shape[0] and 0 <= goal_local[1] < traversable.shape[1]:
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
	if result is None or not result["path_rc"]:
		return None

	# Convert pixel path back to world coordinates
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

	return xy
