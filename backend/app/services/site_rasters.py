"""Pre-processed site rasters — loads per-site .npy files instead of raw GeoTIFFs."""

from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path

import numpy as np
from affine import Affine
from PIL import Image
from pyproj import Transformer

HERE = Path(__file__).resolve().parent.parent.parent
SITES_DATA_DIR = HERE / "data" / "sites"
SITES_JSON_PATH = HERE / "data" / "sites.json"

MAP_TYPE_KEYS = {
	"elevation",
	"slope",
	"hillshade",
	"solar_illumination_yr_avg",
	"solar_illumination_day_avg",
	"meteor_flux",
	"average_temperature",
}

_site_bounds_cache: list[dict] | None = None

_STERE_CRS = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m"
_LONGLAT_CRS = "+proj=longlat +a=1737400 +b=1737400"
_to_lonlat = Transformer.from_crs(_STERE_CRS, _LONGLAT_CRS, always_xy=True)


def get_site_center_lonlat(site_name: str) -> tuple[float, float] | None:
	"""Return (lon, lat) of the site center in selenographic degrees."""
	bounds = _load_site_bounds()
	for s in bounds:
		if s["name"] == site_name:
			cx = (s["left"] + s["right"]) / 2.0
			cy = (s["bottom"] + s["top"]) / 2.0
			lon, lat = _to_lonlat.transform(cx, cy)
			return float(lon), float(lat)
	return None


def _normalize_key(key: str) -> str:
	key = key.strip().lower()
	key = re.sub(r"[^a-z0-9]+", "_", key)
	return re.sub(r"_+", "_", key).strip("_")


def _load_site_bounds() -> list[dict]:
	"""Load site list from pre-processed sites.json."""
	global _site_bounds_cache
	if _site_bounds_cache is not None:
		return _site_bounds_cache

	if not SITES_JSON_PATH.exists():
		_site_bounds_cache = []
		return _site_bounds_cache

	with open(str(SITES_JSON_PATH)) as f:
		loaded = json.load(f)
		_site_bounds_cache = loaded if loaded is not None else []
	assert _site_bounds_cache is not None
	return _site_bounds_cache


def list_sites() -> list[dict]:
	return list(_load_site_bounds())


def _site_name_to_dir(site_name: str) -> Path | None:
	"""Get the data directory for a site by matching name."""
	norm = _normalize_key(site_name)
	d = SITES_DATA_DIR / norm
	if d.is_dir():
		return d
	# Fallback: scan all dirs for a match
	for child in SITES_DATA_DIR.iterdir():
		if child.is_dir() and _normalize_key(child.name) == norm:
			return child
	return None


def load_site_data(site_name: str) -> dict | None:
	"""Load all pre-processed data for a site.

	Returns dict with keys like:
	  elevation, elevation_meta, illumination, illumination_meta, ...

	Each data key is a np.ndarray, each _meta key is a dict with
	'transform' (Affine), 'shape', 'res'.
	"""
	site_dir = _site_name_to_dir(site_name)
	if site_dir is None:
		return None

	layers = ["elevation", "illumination", "meteor", "summer_temp", "winter_temp"]
	result = {}
	for layer in layers:
		npy = site_dir / f"{layer}.npy"
		meta = site_dir / f"{layer}_meta.json"
		if npy.exists() and meta.exists():
			data = np.load(str(npy))
			with open(str(meta)) as f:
				m = json.load(f)
			m["transform"] = Affine(*m["transform"])
			result[layer] = data
			result[f"{layer}_meta"] = m
		else:
			result[layer] = None
			result[f"{layer}_meta"] = None

	return result


def _hillshade(data: np.ndarray, az: float = 315, alt: float = 45) -> np.ndarray:
	"""Compute hillshade from elevation data."""
	filled = np.where(np.isfinite(data), data, np.nan)
	padded = np.pad(filled, 1, mode="edge")
	x, y = np.gradient(padded, 40.0, 40.0)
	x = x[1:-1, 1:-1]
	y = y[1:-1, 1:-1]

	az_rad = np.radians(az)
	alt_rad = np.radians(alt)

	slope = np.arctan(np.sqrt(x**2 + y**2))
	aspect = np.arctan2(-x, y)

	shaded = np.sin(alt_rad) * np.cos(slope) + np.cos(alt_rad) * np.sin(slope) * np.cos(az_rad - aspect)
	shaded = np.clip(shaded, 0, 1)
	shaded[~np.isfinite(data)] = 0
	return (shaded * 255).astype(np.uint8)


def _slope_deg(data: np.ndarray) -> np.ndarray:
	filled = np.where(np.isfinite(data), data, 0)
	padded = np.pad(filled, 1, mode="edge")
	x, y = np.gradient(padded, 40.0, 40.0)
	x = x[1:-1, 1:-1]
	y = y[1:-1, 1:-1]
	slope = np.degrees(np.arctan(np.sqrt(x**2 + y**2)))
	slope[~np.isfinite(data)] = 0
	return slope


_TERRAIN_STOPS = np.array([
	[0.00, 0.05, 0.20, 0.40],
	[0.25, 0.10, 0.40, 0.20],
	[0.50, 0.30, 0.60, 0.20],
	[0.70, 0.55, 0.40, 0.25],
	[0.85, 0.75, 0.65, 0.50],
	[1.00, 1.00, 1.00, 1.00],
])


def _apply_colormap(norm: np.ndarray) -> np.ndarray:
	pos = _TERRAIN_STOPS[:, 0]
	colors = _TERRAIN_STOPS[:, 1:]
	r = np.interp(norm, pos, colors[:, 0])
	g = np.interp(norm, pos, colors[:, 1])
	b = np.interp(norm, pos, colors[:, 2])
	rgb = np.stack([r, g, b], axis=-1)
	return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)


def _data_to_png(data: np.ndarray, colormap: bool = True) -> str:
	mask = np.isfinite(data)

	if colormap:
		dmin = float(np.min(data[mask])) if np.any(mask) else 0
		dmax = float(np.max(data[mask])) if np.any(mask) else 1
		drange = dmax - dmin if dmax > dmin else 1.0
		norm = np.clip((data - dmin) / drange, 0.0, 1.0)
		colored = _apply_colormap(norm)
		colored[~mask] = 0
		alpha = np.where(mask, 255, 0).astype(np.uint8)
		rgba = np.dstack((colored, alpha))
		img = Image.fromarray(rgba, "RGBA")
	else:
		gray = np.where(mask, data.astype(np.uint8), 0)
		alpha = np.where(mask, 255, 0).astype(np.uint8)
		rgba = np.dstack((gray, gray, gray, alpha))
		img = Image.fromarray(rgba, "RGBA")

	buf = io.BytesIO()
	img.save(buf, format="PNG")
	return base64.b64encode(buf.getvalue()).decode("ascii")


def get_site_map(site_name: str, map_type: str = "Elevation") -> dict | None:
	sites = _load_site_bounds()
	site = None
	for s in sites:
		if s["name"] == site_name:
			site = s
			break
	if site is None:
		return None

	site_data = load_site_data(site_name)
	if site_data is None:
		return None

	map_key = _normalize_key(map_type)

	# Determine which data and label to use
	if map_key == "elevation":
		elev = site_data.get("elevation")
		if elev is None:
			return None
		data = elev
		label = "Elevation"
		png = _data_to_png(data, colormap=True)
		# Downsample for 3D mesh
		h, w = data.shape
		target = 200
		stride = max(1, int(max(h, w) / target))
		ds = data[::stride, ::stride].copy()
		mask = np.isfinite(ds)
		ds[~mask] = float(np.nanmin(ds[mask])) if np.any(np.isfinite(ds)) else 0

	elif map_key == "slope":
		elev = site_data.get("elevation")
		if elev is None:
			return None
		data = _slope_deg(elev)
		label = "Slope (deg)"
		png = _data_to_png(data, colormap=True)

	elif map_key == "hillshade":
		elev = site_data.get("elevation")
		if elev is None:
			return None
		data = _hillshade(elev).astype(np.float32)
		label = "Hillshade"
		png = _data_to_png(data, colormap=False)

	elif map_key in ("solar_illumination_yr_avg", "solar_illumination"):
		illum = site_data.get("illumination")
		if illum is None:
			return None
		data = illum
		label = "Solar Illumination"
		png = _data_to_png(data, colormap=True)

	elif map_key in ("solar_illumination_day_avg",):
		illum = site_data.get("illumination")
		if illum is None:
			return None
		data = illum
		label = "Solar Illumination (day avg.)"
		png = _data_to_png(data, colormap=True)

	elif map_key == "meteor_flux":
		meteor = site_data.get("meteor")
		if meteor is None:
			return None
		data = meteor
		label = "Meteor Flux"
		png = _data_to_png(data, colormap=True)

	elif map_key == "average_temperature":
		s_data = site_data.get("summer_temp")
		w_data = site_data.get("winter_temp")
		if s_data is None and w_data is None:
			return None
		if s_data is not None and w_data is not None:
			data = (s_data + w_data) / 2.0
		elif s_data is not None:
			data = s_data
		else:
			assert w_data is not None
			data = w_data
		label = "Avg Temperature"
		png = _data_to_png(data, colormap=True)

	else:
		return None

	assert data is not None, "data should be set before reaching this point"
	mask = np.isfinite(data)
	dmin = float(np.min(data[mask])) if np.any(mask) else 0
	dmax = float(np.max(data[mask])) if np.any(mask) else 0

	payload: dict = {
		"image_data": png,
		"value_range": [dmin, dmax],
		"shape": list(data.shape),
		"bounds": {
			"left": site["left"],
			"bottom": site["bottom"],
			"right": site["right"],
			"top": site["top"],
		},
		"label": label,
		"map_type": map_type,
	}

	# Always include terrain height data
	elev = site_data.get("elevation")
	if elev is not None:
		h, w = elev.shape
		target = 200
		stride = max(1, int(max(h, w) / target))
		ds = elev[::stride, ::stride].copy()
		mask = np.isfinite(ds)
		fill_val = float(np.nanmin(ds[mask])) if np.any(mask) else 0.0
		ds[~mask] = fill_val
		payload["height_data"] = ds.tolist()
		payload["downsampled_shape"] = list(ds.shape)
		payload["min_elev"] = float(np.min(ds))
		payload["max_elev"] = float(np.max(ds))

	return payload
