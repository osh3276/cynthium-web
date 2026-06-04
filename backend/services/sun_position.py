"""Sun position calculator for lunar coordinates using SPICE."""

from pathlib import Path

import numpy as np
import spiceypy as spice

HERE = Path(__file__).resolve().parent.parent
DATA_DIR = HERE / "data"

KERNELS = [
	"naif0012.tls",
	"pck00011.tpc",
	"de430.bsp",
	"moon_de440_250416.tf",
	"moon_pa_de440_200625.bpc",
]

_loaded = False


def _ensure_loaded():
	global _loaded
	if _loaded:
		return
	for name in KERNELS:
		path = DATA_DIR / name
		if path.exists():
			spice.furnsh(str(path))
	_loaded = True


def sun_position(lat: float, lon: float, utc: str) -> tuple[float, float]:
	"""Return (azimuth_deg, elevation_deg) of the Sun at a lunar location and UTC time.

	lat, lon: selenographic degrees
	utc: ISO 8601 string, e.g. "2026-05-13T00:00:00"
	"""
	_ensure_loaded()
	et = spice.utc2et(utc)

	state, _ = spice.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")
	sun_pos = np.array(state, dtype=np.float64)
	sun_pos /= np.linalg.norm(sun_pos)

	lat_rad = np.radians(lat)
	lon_rad = np.radians(lon)

	up = np.array([
		np.cos(lat_rad) * np.cos(lon_rad),
		np.cos(lat_rad) * np.sin(lon_rad),
		np.sin(lat_rad),
	], dtype=np.float64)
	east = np.cross(np.array([0.0, 0.0, 1.0], dtype=np.float64), up)
	east /= np.linalg.norm(east)
	north = np.cross(up, east)

	elevation = np.degrees(np.arcsin(np.dot(sun_pos, up)))
	azimuth = np.degrees(np.arctan2(np.dot(sun_pos, east), np.dot(sun_pos, north))) % 360.0

	return float(azimuth), float(elevation)
