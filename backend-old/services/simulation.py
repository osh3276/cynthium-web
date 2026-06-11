import time

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from .rover_settings import RoverSettings
from .site_rasters import (
	COARSE_ELEVATION_PATH,
	ILLUMINATION_PATH,
	METEOR_PATH,
	SUMMER_TEMP_PATH,
	WINTER_TEMP_PATH,
	_load_site_bounds,
)

LUNAR_GRAVITY = 1.625  # m/s^2

# ---------------------------------------------------------------------------
# Scoring constants — tweak these to rebalance the traversal score
# ---------------------------------------------------------------------------
# Max points per sub-score category (total should sum to 1000)
SCORE_MAX_PATH_EFFICIENCY = 150
SCORE_MAX_ENERGY_ECONOMY = 300
SCORE_MAX_ILLUMINATION = 350
SCORE_MAX_METEOR_SAFETY = 50
SCORE_MAX_TRACTION_MATCH = 100
SCORE_MAX_POWER_MATCH = 50

# Expense subtracted from total: final = sum - expense * SCALE
# expense = rover_power_hp + rover_mu^2 - rolling_resistance_coeff^2
# Higher crr reduces expense (worse wheels = cheaper).
# Autodesign keeps hp and crr at minimum, adjusts mu to meet budget.
EXPENSE_SCALE = 100

# Rover optimization tuning
TRACTION_PEAK_RATIO = 0.7       # mu_required / mu_actual ratio that scores full marks
POWER_PEAK_RATIO = 0.95         # achieved_v / v_ref ratio that scores full marks
V_REF_CAP_MPS = 10.0            # max theoretical flat-ground speed considered

# Grade thresholds
GRADE_S = 900
GRADE_A = 750
GRADE_B = 600
GRADE_C = 450
GRADE_D = 300
FAILURE_HARD_CAP = 250.0

# Rover defaults for fallback
DEFAULT_ROVER_MASS_KG = 150.0
DEFAULT_ROVER_POWER_HP = 0.2
DEFAULT_ROVER_CRR = 0.1
HP_TO_W = 745.7


# ---------------------------------------------------------------------------
# Path sampling (ported from cynthium path_sampling.py)
# ---------------------------------------------------------------------------

def get_pixel_resolution_m(transform) -> float:
	return float(min(abs(transform.a), abs(transform.e)))


def sample_path_elevations(
	waypoints: np.ndarray,
	elevation_map: np.ndarray,
	transform,
) -> np.ndarray:
	"""Sample (x,y,z) along the waypoint polyline at ~1 pixel spacing."""
	inverse_transform = ~transform
	pixel_resolution = get_pixel_resolution_m(transform)
	sampled_points: list[list[float]] = []

	for index in range(len(waypoints) - 1):
		start_point = waypoints[index]
		end_point = waypoints[index + 1]
		horizontal_distance = float(np.linalg.norm(end_point[:2] - start_point[:2]))
		if horizontal_distance == 0:
			segment_sample_count = 1
		else:
			segment_sample_count = int(np.ceil(horizontal_distance / pixel_resolution))

		for sample_index in range(segment_sample_count + 1):
			fraction = sample_index / segment_sample_count
			current_xy = start_point[:2] + fraction * (end_point[:2] - start_point[:2])

			col, row = inverse_transform * (float(current_xy[0]), float(current_xy[1]))
			col_i = _clamp_index(int(round(col)), elevation_map.shape[1])
			row_i = _clamp_index(int(round(row)), elevation_map.shape[0])

			elevation = float(elevation_map[row_i, col_i])
			sampled_points.append([float(current_xy[0]), float(current_xy[1]), elevation])

	sampled_points_arr = np.array(sampled_points, dtype=np.float64)
	if len(sampled_points_arr) > 1:
		mask = np.any(np.diff(sampled_points_arr, axis=0) != 0, axis=1)
		mask = np.append(mask, True)
		sampled_points_arr = sampled_points_arr[mask]

	return sampled_points_arr


def _clamp_index(index: int, size: int) -> int:
	return max(0, min(index, size - 1))


# ---------------------------------------------------------------------------
# Rover physics (ported from cynthium rover_physics.py)
# ---------------------------------------------------------------------------

def simulate_rover_over_path(
	*,
	pts_xyz: np.ndarray,
	rover: RoverSettings,
	wheel_friction_coeff: float,
	power_w: float,
	illumination_map: np.ndarray | None = None,
	illumination_transform=None,
	g_mps2: float,
	v0_mps: float = 0.0,
	v_min_power_mps: float = 0.05,
) -> dict[str, float]:
	"""Simple 1D dynamics along a polyline.

	Assumptions:
	- Rover is always at max throttle (power-limited: F = P/v).
	- Tractive force is capped by wheel/ground friction: F <= μN.
	- Downhill can accelerate from gravity; velocity carries into later segments.
	- No braking and no speed cap.
	- Illumination energy integrates E = ∫ I dt (J/m^2) using segment midpoints.
	"""
	if pts_xyz.shape[0] < 2:
		return {
			"traverse_feasible": 1.0,
			"traversal_time_s": 0.0,
			"average_velocity_mps": 0.0,
			"min_velocity_mps": 0.0,
			"max_velocity_mps": 0.0,
			"solar_energy_per_m2_j": 0.0,
			"avg_solar_illumination_w_per_m2": 0.0,
		}

	m = float(rover.mass_kg)
	mu = float(wheel_friction_coeff)
	p_w = float(power_w)
	g = float(g_mps2)

	diffs = np.diff(pts_xyz.astype(np.float64, copy=False), axis=0)
	ds = np.linalg.norm(diffs, axis=1).astype(np.float64)
	horiz = np.linalg.norm(diffs[:, :2], axis=1).astype(np.float64)
	dz = diffs[:, 2].astype(np.float64)

	valid = (ds > 1e-9) & (horiz > 1e-9)
	theta = np.zeros(ds.shape, dtype=np.float64)
	theta[valid] = np.arctan2(dz[valid], horiz[valid])

	inv_illum = None
	if illumination_map is not None and illumination_transform is not None:
		inv_illum = ~illumination_transform

	v = float(v0_mps)
	t_total = 0.0
	d_total = 0.0
	energy_j_per_m2 = 0.0

	min_v = float("inf")
	max_v = 0.0

	for i in range(ds.size):
		s = float(ds[i])
		if not (s > 0):
			continue

		th = float(theta[i])

		f_n = m * g * abs(np.cos(th))
		f_trac_max = mu * f_n

		v_eff = max(float(v), float(v_min_power_mps))
		f_power = p_w / v_eff
		f_drive = min(f_power, f_trac_max)

		f_grade = m * g * np.sin(th)

		c_rr = float(rover.rolling_resistance_coeff)
		f_roll = c_rr * f_n

		f_net = f_drive - f_grade - f_roll
		a = f_net / m

		v_sq_next = (v * v) + (2.0 * a * s)
		if v_sq_next <= 0.0:
			if a >= 0.0:
				v_next = 0.0
				dt = 0.0
			else:
				s_stop = (v * v) / (-2.0 * a) if v > 0.0 else 0.0
				dt = (v / (-a)) if v > 0.0 else 0.0
				d_total += float(s_stop)
				t_total += float(dt)

				if inv_illum is not None and dt > 0.0:
					xy_mid = 0.5 * (pts_xyz[i, :2] + pts_xyz[i + 1, :2])
					col, row = inv_illum * (float(xy_mid[0]), float(xy_mid[1]))
					ci = int(round(col))
					ri = int(round(row))
					if (
						0 <= ri < illumination_map.shape[0]
						and 0 <= ci < illumination_map.shape[1]
					):
						illum = float(illumination_map[ri, ci])
						if np.isfinite(illum):
							energy_j_per_m2 += illum * float(dt)

				min_v = min(min_v, 0.0)
				max_v = max(max_v, float(v))

				return {
					"traverse_feasible": 0.0,
					"traversal_time_s": float("inf"),
					"average_velocity_mps": 0.0,
					"min_velocity_mps": 0.0 if min_v == float("inf") else float(min_v),
					"max_velocity_mps": float(max_v),
					"solar_energy_per_m2_j": float(energy_j_per_m2),
					"avg_solar_illumination_w_per_m2": 0.0,
				}

		v_next = float(np.sqrt(v_sq_next))
		den = float(v + v_next)
		dt = (2.0 * s / den) if den > 0.0 else 0.0

		d_total += s
		t_total += float(dt)

		v_mid = 0.5 * (float(v) + float(v_next))
		min_v = min(min_v, float(v_mid))
		max_v = max(max_v, float(v_mid))

		if inv_illum is not None and dt > 0.0:
			xy_mid = 0.5 * (pts_xyz[i, :2] + pts_xyz[i + 1, :2])
			col, row = inv_illum * (float(xy_mid[0]), float(xy_mid[1]))
			ci = int(round(col))
			ri = int(round(row))
			if 0 <= ri < illumination_map.shape[0] and 0 <= ci < illumination_map.shape[1]:
				illum = float(illumination_map[ri, ci])
				if np.isfinite(illum):
					energy_j_per_m2 += illum * float(dt)

		v = v_next

	if t_total <= 0.0:
		avg_v = 0.0
		avg_illum = 0.0
	else:
		avg_v = float(d_total / t_total)
		avg_illum = float(energy_j_per_m2 / t_total)

	if min_v == float("inf"):
		min_v = 0.0

	return {
		"traverse_feasible": 1.0,
		"traversal_time_s": float(t_total),
		"average_velocity_mps": float(avg_v),
		"min_velocity_mps": float(min_v),
		"max_velocity_mps": float(max_v),
		"solar_energy_per_m2_j": float(energy_j_per_m2),
		"avg_solar_illumination_w_per_m2": float(avg_illum),
	}


# ---------------------------------------------------------------------------
# Rover dynamics (ported from cynthium rover_dynamics.py)
# ---------------------------------------------------------------------------

def _compute_required_mu_dynamic(
	*,
	pts_xyz: np.ndarray,
	rover: RoverSettings,
	power_w: float,
	g_mps2: float,
	mu_upper_hint: float,
	tol: float = 1e-3,
	max_iter: int = 30,
) -> float:
	"""Find the minimum μ that makes the traverse feasible under the same physics model."""

	def feasible(mu_test: float) -> bool:
		out = simulate_rover_over_path(
			pts_xyz=pts_xyz,
			rover=rover,
			wheel_friction_coeff=float(mu_test),
			power_w=float(power_w),
			illumination_map=None,
			illumination_transform=None,
			g_mps2=float(g_mps2),
			v0_mps=0.0,
			v_min_power_mps=0.001,
		)
		return float(out.get("traverse_feasible", 0.0)) >= 0.5

	lo = 0.0
	if feasible(lo):
		return 0.0

	hi = float(max(mu_upper_hint, 1e-6))
	grow = 0
	while not feasible(hi):
		hi *= 2.0
		grow += 1
		if hi > 50.0 or grow > 20:
			return float("inf")

	for _ in range(int(max_iter)):
		mid = 0.5 * (lo + hi)
		if hi - lo <= float(tol):
			break
		if feasible(mid):
			hi = mid
		else:
			lo = mid

	return float(hi)


def compute_traversal_dynamics(
	*,
	waypoints_xyz: np.ndarray,
	elevation_map: np.ndarray | None,
	transform,
	illumination_map: np.ndarray | None = None,
	illumination_transform=None,
	rover: RoverSettings,
) -> dict[str, float]:
	"""Physics-style rover traversal simulation."""
	mu = float(rover.wheel_friction_coeff)
	max_climbable = float(np.degrees(np.arctan(mu)))

	if waypoints_xyz.shape[0] < 2:
		return {
			"average_velocity_mps": 0.0,
			"min_velocity_mps": 0.0,
			"max_velocity_mps": 0.0,
			"traversal_time_s": 0.0,
			"solar_energy_per_m2_j": 0.0,
			"avg_solar_illumination_w_per_m2": 0.0,
			"max_climbable_slope_deg": max_climbable,
			"traverse_feasible": 1.0,
			"required_wheel_friction_coeff": 0.0,
			"required_climb_slope_deg": 0.0,
		}

	if elevation_map is not None and transform is not None:
		pts = sample_path_elevations(waypoints_xyz, elevation_map, transform)
	else:
		pts = waypoints_xyz.astype(np.float64, copy=False)

	diffs = np.diff(pts, axis=0)
	dist = np.linalg.norm(diffs, axis=1).astype(np.float64)
	horiz = np.linalg.norm(diffs[:, :2], axis=1).astype(np.float64)
	dz = diffs[:, 2].astype(np.float64)

	valid = (dist > 1e-9) & (horiz > 1e-9)
	theta = np.zeros(dist.shape, dtype=np.float64)
	theta[valid] = np.arctan2(dz[valid], horiz[valid])

	physics = simulate_rover_over_path(
		pts_xyz=pts,
		rover=rover,
		wheel_friction_coeff=mu,
		power_w=float(rover.power_w),
		illumination_map=illumination_map,
		illumination_transform=illumination_transform,
		g_mps2=float(LUNAR_GRAVITY),
		v0_mps=0.0,
		v_min_power_mps=0.001,
	)

	required_mu_dynamic = _compute_required_mu_dynamic(
		pts_xyz=pts,
		rover=rover,
		power_w=float(rover.power_w),
		g_mps2=float(LUNAR_GRAVITY),
		mu_upper_hint=mu,
	)

	return {
		"average_velocity_mps": float(physics["average_velocity_mps"]),
		"min_velocity_mps": float(physics["min_velocity_mps"]),
		"max_velocity_mps": float(physics["max_velocity_mps"]),
		"traversal_time_s": float(physics["traversal_time_s"]),
		"solar_energy_per_m2_j": float(physics["solar_energy_per_m2_j"]),
		"avg_solar_illumination_w_per_m2": float(
			physics["avg_solar_illumination_w_per_m2"]
		),
		"max_climbable_slope_deg": max_climbable,
		"traverse_feasible": float(physics["traverse_feasible"]),
		"required_wheel_friction_coeff": float(required_mu_dynamic),
		"required_climb_slope_deg": float(
			np.degrees(np.arctan(required_mu_dynamic))
		),
	}


# ---------------------------------------------------------------------------
# Path stats (ported from cynthium stats.py)
# ---------------------------------------------------------------------------

EMPTY_PATH_STATS = {
	"total_distance": 0.0,
	"total_distance_travelled": 0.0,
	"total_displacement": 0.0,
	"total_elevation_gain": 0.0,
	"net_elevation_change": 0.0,
	"average_slope": 0.0,
	"max_slope": 0.0,
	"min_slope": 0.0,
	"surface_average_slope": 0.0,
	"surface_max_slope": 0.0,
	"surface_min_slope": 0.0,
	"average_meteor_flux": 0.0,
	"max_meteor_flux": 0.0,
	"min_meteor_flux": 0.0,
	"max_temperature": 0.0,
	"min_temperature": 0.0,
	"average_temperature": 0.0,
	"percent_illumination": 0.0,
}


def _sample_raster_values(
	points_xy: np.ndarray,
	raster: np.ndarray | None,
	transform,
) -> np.ndarray:
	if raster is None or transform is None or points_xy.size == 0:
		return np.array([], dtype=np.float32)

	inverse_transform = ~transform
	values = []
	for x, y in points_xy:
		col, row = inverse_transform * (float(x), float(y))
		col = int(round(col))
		row = int(round(row))
		if 0 <= row < raster.shape[0] and 0 <= col < raster.shape[1]:
			value = raster[row, col]
			if np.isfinite(value):
				values.append(float(value))

	return np.array(values, dtype=np.float32)


def _calculate_stats_from_points(points: np.ndarray) -> dict[str, float]:
	diffs = np.diff(points, axis=0)
	step_distances = np.linalg.norm(diffs, axis=1)
	z_diffs = diffs[:, 2]
	total_distance_travelled = float(np.sum(step_distances))
	total_displacement = float(np.linalg.norm(points[-1] - points[0]))

	return {
		"total_distance": total_distance_travelled,
		"total_distance_travelled": total_distance_travelled,
		"total_displacement": total_displacement,
		"total_elevation_gain": float(np.sum(z_diffs[z_diffs > 0])),
		"net_elevation_change": float(points[-1, 2] - points[0, 2]),
	}


def _add_context_stats(
	stats: dict[str, float],
	points_xy: np.ndarray,
	temperature_map: np.ndarray | None,
	temperature_transform,
	illumination_map: np.ndarray | None = None,
	illumination_transform=None,
	meteor_map: np.ndarray | None = None,
	meteor_transform=None,
):
	temperature_values = _sample_raster_values(
		points_xy,
		temperature_map,
		temperature_transform,
	)
	if temperature_values.size:
		stats["max_temperature"] = float(np.max(temperature_values))
		stats["min_temperature"] = float(np.min(temperature_values))
		stats["average_temperature"] = float(np.mean(temperature_values))
	else:
		stats["max_temperature"] = 0.0
		stats["min_temperature"] = 0.0
		stats["average_temperature"] = 0.0

	illumination_values = _sample_raster_values(
		points_xy,
		illumination_map,
		illumination_transform,
	)
	if illumination_values.size:
		illuminated_count = np.count_nonzero(illumination_values > 0)
		stats["percent_illumination"] = float(
			illuminated_count / illumination_values.size * 100.0
		)
	else:
		stats["percent_illumination"] = 0.0

	meteor_values = _sample_raster_values(
		points_xy, meteor_map, meteor_transform
	)
	if meteor_values.size:
		stats["average_meteor_flux"] = float(np.mean(meteor_values))
		stats["max_meteor_flux"] = float(np.max(meteor_values))
		stats["min_meteor_flux"] = float(np.min(meteor_values))
	else:
		stats["average_meteor_flux"] = 0.0
		stats["max_meteor_flux"] = 0.0
		stats["min_meteor_flux"] = 0.0


def _calculate_integrated_stats(
	waypoints: np.ndarray,
	elevation_map: np.ndarray,
	transform,
	slope_map: np.ndarray | None = None,
	temperature_map: np.ndarray | None = None,
	temperature_transform=None,
	illumination_map: np.ndarray | None = None,
	illumination_transform=None,
	meteor_map: np.ndarray | None = None,
	meteor_transform=None,
) -> dict[str, float]:
	sampled_points = sample_path_elevations(waypoints, elevation_map, transform)
	stats = _calculate_stats_from_points(sampled_points)
	stats["average_resolution"] = get_pixel_resolution_m(transform)

	# Traversal slope
	if len(sampled_points) > 1:
		diffs = np.diff(sampled_points, axis=0)
		horizontal_distances = np.linalg.norm(diffs[:, :2], axis=1)
		z_diffs = diffs[:, 2]

		mask = horizontal_distances > 0
		if np.any(mask):
			slopes = np.degrees(np.arctan2(z_diffs[mask], horizontal_distances[mask]))
			stats["average_slope"] = float(np.mean(slopes))
			stats["max_slope"] = float(np.max(slopes))
			stats["min_slope"] = float(np.min(slopes))
		else:
			stats["average_slope"] = 0.0
			stats["max_slope"] = 0.0
			stats["min_slope"] = 0.0
	else:
		stats["average_slope"] = 0.0
		stats["max_slope"] = 0.0
		stats["min_slope"] = 0.0

	# Surface slope from slope raster
	slope_values = _sample_raster_values(sampled_points[:, :2], slope_map, transform)
	if slope_values.size > 0:
		stats["surface_average_slope"] = float(np.mean(slope_values))
		stats["surface_max_slope"] = float(np.max(slope_values))
		stats["surface_min_slope"] = float(np.min(slope_values))
	else:
		stats["surface_average_slope"] = 0.0
		stats["surface_max_slope"] = 0.0
		stats["surface_min_slope"] = 0.0

	_add_context_stats(
		stats,
		sampled_points[:, :2],
		temperature_map,
		temperature_transform,
		illumination_map,
		illumination_transform,
		meteor_map,
		meteor_transform,
	)
	return stats


def calculate_path_stats(
	points: np.ndarray,
	elevation_map: np.ndarray | None = None,
	transform=None,
	slope_map: np.ndarray | None = None,
	temperature_map: np.ndarray | None = None,
	temperature_transform=None,
	illumination_map: np.ndarray | None = None,
	illumination_transform=None,
	meteor_map: np.ndarray | None = None,
	meteor_transform=None,
) -> dict[str, float]:
	if len(points) < 2:
		return EMPTY_PATH_STATS.copy()

	if elevation_map is not None and transform is not None:
		return _calculate_integrated_stats(
			points,
			elevation_map,
			transform,
			slope_map,
			temperature_map,
			temperature_transform,
			illumination_map,
			illumination_transform,
			meteor_map,
			meteor_transform,
		)

	stats = _calculate_stats_from_points(points)
	_add_context_stats(
		stats,
		points[:, :2],
		temperature_map,
		temperature_transform,
		illumination_map,
		illumination_transform,
		meteor_map,
		meteor_transform,
	)
	return stats


# ---------------------------------------------------------------------------
# Site-level raster loading
# ---------------------------------------------------------------------------

def _crop_raster_sim(source_path, bounds: dict) -> tuple[np.ndarray, dict] | None:
	"""Crop a raster to site bounds. Returns (data, meta) or None."""
	crop_bounds = (bounds["left"], bounds["bottom"], bounds["right"], bounds["top"])
	try:
		with rasterio.open(str(source_path)) as src:
			window = from_bounds(*crop_bounds, transform=src.transform)
			window = window.round_offsets().round_lengths()
			if window.width <= 0 or window.height <= 0:
				return None
			data = src.read(
				1,
				window=window,
				boundless=True,
				fill_value=src.nodata if src.nodata is not None else float("nan"),
			).astype(np.float32)
			meta = {"transform": src.window_transform(window), "crs": src.crs}
		return data, meta
	except Exception:
		return None


def load_site_rasters(site_name: str) -> dict | None:
	"""Load all rasters needed for simulation, cropped to the site bounds.

	Returns a dict with keys: elevation, elevation_meta, slope, temperature,
	temperature_meta, illumination, illumination_meta, meteor, meteor_meta.
	Returns None if the site or elevation raster isn't found.
	"""
	bounds_dict = _load_site_bounds()
	if site_name not in bounds_dict:
		return None

	bounds = bounds_dict[site_name]

	elev = _crop_raster_sim(COARSE_ELEVATION_PATH, bounds)
	if elev is None:
		return None
	elev_data, elev_meta = elev

	# Slope computed from elevation
	padded = np.pad(np.where(np.isfinite(elev_data), elev_data, 0), 1, mode="edge")
	gx, gy = np.gradient(padded, 40.0, 40.0)
	gx = gx[1:-1, 1:-1]
	gy = gy[1:-1, 1:-1]
	slope_data = np.degrees(np.arctan(np.sqrt(gx**2 + gy**2)))
	slope_data[~np.isfinite(elev_data)] = 0

	illum = _crop_raster_sim(ILLUMINATION_PATH, bounds)
	illum_data, illum_meta = illum if illum else (None, None)

	meteor = _crop_raster_sim(METEOR_PATH, bounds)
	meteor_data, meteor_meta = meteor if meteor else (None, None)

	# Average of summer and winter temperatures
	summer = _crop_raster_sim(SUMMER_TEMP_PATH, bounds)
	winter = _crop_raster_sim(WINTER_TEMP_PATH, bounds)
	temp_data = None
	temp_meta = None
	if summer is not None and winter is not None:
		temp_data = (summer[0] + winter[0]) / 2.0
		temp_meta = summer[1]
	elif summer is not None:
		temp_data, temp_meta = summer
	elif winter is not None:
		temp_data, temp_meta = winter

	return {
		"elevation": elev_data,
		"elevation_meta": elev_meta,
		"slope": slope_data,
		"temperature": temp_data,
		"temperature_meta": temp_meta,
		"illumination": illum_data,
		"illumination_meta": illum_meta,
		"meteor": meteor_data,
		"meteor_meta": meteor_meta,
	}


# ---------------------------------------------------------------------------
# Top-level simulation entry point
# ---------------------------------------------------------------------------

def compute_traversal_score(stats: dict[str, float]) -> dict:
	"""Compute traversal score (0-1000) with sub-scores and letter grade.

	Failed traversals (traverse_feasible = 0) hard-cap at FAILURE_HARD_CAP, always F.
	All max values come from the SCORE_MAX_* constants defined at the top of this file.
	"""
	g = LUNAR_GRAVITY
	feasible = stats.get("traverse_feasible", 1.0) >= 0.5

	# -- 1. Path Efficiency --
	distance = stats.get("total_distance_travelled", 1.0)
	displacement = stats.get("total_displacement", 0.0)
	path_eff = SCORE_MAX_PATH_EFFICIENCY * max(0.0, min(1.0, displacement / max(distance, 1.0)))

	# -- 2. Energy Economy --
	# Compare actual avg velocity to rover's theoretical flat-ground top speed
	mass = stats.get("rover_mass_kg", DEFAULT_ROVER_MASS_KG)
	power_w = stats.get("rover_power_hp", DEFAULT_ROVER_POWER_HP) * HP_TO_W
	crr = stats.get("rover_crr", DEFAULT_ROVER_CRR)
	v_flat_max = power_w / max(mass * g * crr, 0.001)
	v_ref = min(float(v_flat_max), V_REF_CAP_MPS)
	avg_v = stats.get("average_velocity_mps", 0.0)
	energy_eco = SCORE_MAX_ENERGY_ECONOMY * max(0.0, min(1.0, avg_v / max(v_ref, 0.01)))

	# -- 3. Illumination --
	# Composite: 70% path coverage in sunlight + 30% solar intensity during traversal
	illum_pct = stats.get("percent_illumination", 0.0) / 100.0
	avg_illum = stats.get("avg_solar_illumination_w_per_m2", 0.0)
	solar_intensity = max(0.0, min(1.0, avg_illum / 200.0))
	illumination = SCORE_MAX_ILLUMINATION * max(0.0, min(1.0, 0.7 * illum_pct + 0.3 * solar_intensity))

	# -- 4. Rover Optimization --
	# Traction match: how well actual mu matches what the path requires
	required_mu = stats.get("required_wheel_friction_coeff", 0.0)
	actual_mu = stats.get("rover_mu", 0.0)
	if actual_mu <= 0.01:
		traction_match = 0.0
	elif required_mu <= 0.01:
		traction_match = float(SCORE_MAX_TRACTION_MATCH)
	else:
		ratio = required_mu / actual_mu
		if ratio > 1.0:
			traction_match = float(SCORE_MAX_TRACTION_MATCH) * 0.5  # undergunned but survived
		else:
			traction_match = SCORE_MAX_TRACTION_MATCH * max(0.0, min(1.0, ratio / TRACTION_PEAK_RATIO))

	# Power match: actual speed vs theoretical potential
	if v_flat_max <= 0.01:
		power_match = 0.0
	elif avg_v >= v_ref * POWER_PEAK_RATIO:
		power_match = float(SCORE_MAX_POWER_MATCH)
	else:
		power_match = SCORE_MAX_POWER_MATCH * max(0.0, min(1.0, avg_v / max(v_ref * POWER_PEAK_RATIO, 0.01)))

	rover_opt = traction_match + power_match

	# -- 5. Meteor Safety --
	avg_meteor = stats.get("average_meteor_flux", 0.0)
	meteor_safety = SCORE_MAX_METEOR_SAFETY * max(0.0, min(1.0, 1.0 - avg_meteor / 5000.0))

	# -- 6. Rover Expense penalty --
	# Subtracted from total. expense = hp + mu² - crr²
	_hp = stats.get("rover_power_hp", DEFAULT_ROVER_POWER_HP)
	_mu = stats.get("rover_mu", 0.6)
	_crr = stats.get("rover_crr", DEFAULT_ROVER_CRR)
	expense = _hp + _mu * _mu - _crr * _crr
	expense_penalty = expense * EXPENSE_SCALE

	# -- Total (expense subtracted) --
	total = path_eff + energy_eco + illumination + rover_opt + meteor_safety - expense_penalty

	# Hard-cap for failed traversals
	if not feasible:
		total = min(total, FAILURE_HARD_CAP)

	total = max(0.0, min(1000.0, total))

	# Grade
	if total >= GRADE_S:
		grade = "S"
	elif total >= GRADE_A:
		grade = "A"
	elif total >= GRADE_B:
		grade = "B"
	elif total >= GRADE_C:
		grade = "C"
	elif total >= GRADE_D:
		grade = "D"
	else:
		grade = "F"

	return {
		"traversal_score": round(total, 1),
		"traversal_grade": grade,
		"traversal_subscores": {
			"path_efficiency": round(path_eff, 1),
			"energy_economy": round(energy_eco, 1),
			"illumination": round(illumination, 1),
			"meteor_safety": round(meteor_safety, 1),
			"rover_traction_match": round(traction_match, 1),
			"rover_power_match": round(power_match, 1),
		},
	}


def _sanitize_float(v: float) -> float:
	"""Replace non-finite floats with safe sentinels for JSON serialization."""
	if np.isnan(v):
		return 0.0
	if np.isposinf(v):
		return 1e308
	if np.isneginf(v):
		return -1e308
	return float(v)


def _sanitize_stats(stats: dict) -> dict:
	sanitized = {}
	for k, v in stats.items():
		if isinstance(v, str):
			sanitized[k] = v
		elif isinstance(v, dict):
			sanitized[k] = {sk: _sanitize_float(sv) if isinstance(sv, (int, float)) else sv for sk, sv in v.items()}
		elif isinstance(v, (int, float)):
			sanitized[k] = _sanitize_float(float(v))
		elif v is None:
			sanitized[k] = 0.0
		else:
			# bool, list, etc. — pass through as-is
			sanitized[k] = v
	return sanitized


def run_simulation(
	site_name: str,
	path_xy: list[list[float]],
	rover: RoverSettings,
) -> dict[str, float]:
	"""Run full simulation stats + rover dynamics for a path on a site."""
	t0 = time.perf_counter()
	path_label = f"site={site_name} pts={len(path_xy)} rover=(μ={rover.wheel_friction_coeff} P={rover.power_hp} Crr={rover.rolling_resistance_coeff})"

	rasters = load_site_rasters(site_name)
	if rasters is None:
		raise ValueError(f"Site '{site_name}' not found or has no elevation data")

	points_array = np.array(path_xy)

	stats = calculate_path_stats(
		points_array,
		rasters["elevation"],
		rasters["elevation_meta"]["transform"],
		slope_map=rasters.get("slope"),
		temperature_map=rasters.get("temperature"),
		temperature_transform=rasters["temperature_meta"]["transform"] if rasters.get("temperature_meta") else None,
		illumination_map=rasters.get("illumination"),
		illumination_transform=rasters["illumination_meta"]["transform"] if rasters.get("illumination_meta") else None,
		meteor_map=rasters.get("meteor"),
		meteor_transform=rasters["meteor_meta"]["transform"] if rasters.get("meteor_meta") else None,
	)

	dynamics = compute_traversal_dynamics(
		waypoints_xyz=points_array,
		elevation_map=rasters["elevation"],
		transform=rasters["elevation_meta"]["transform"],
		illumination_map=rasters.get("illumination"),
		illumination_transform=rasters["illumination_meta"]["transform"] if rasters.get("illumination_meta") else None,
		rover=rover,
	)

	stats.update(dynamics)
	stats["rover_mass_kg"] = rover.mass_kg
	stats["rover_power_hp"] = rover.power_hp
	stats["rover_mu"] = rover.wheel_friction_coeff
	stats["rover_crr"] = rover.rolling_resistance_coeff

	score = compute_traversal_score(stats)
	stats.update(score)

	elapsed = time.perf_counter() - t0
	feasible = stats.get("traverse_feasible", 0)
	print(f"[TIMER] Simulation {elapsed:.1f}s | {path_label} feasible={feasible}")

	return _sanitize_stats(stats)
