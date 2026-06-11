from __future__ import annotations

import base64
import io
import os
import re
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.windows import from_bounds

HERE = Path(__file__).resolve().parent.parent.parent
CYNTHIUM_DATA_DIR = Path(os.environ.get("CYNTHIUM_DATA_DIR", ""))
COARSE_ELEVATION_PATH = HERE / "data" / "elevation.tif"
ILLUMINATION_PATH = HERE / "data" / "illumination.tif"
METEOR_PATH = HERE / "data" / "meteor_energy.tif"
SUMMER_TEMP_PATH = HERE / "data" / "summer-temp.tif"
WINTER_TEMP_PATH = HERE / "data" / "winter-temp.tif"

SITE_PRESET_FILES: dict[str, str] = {
    "Haworth": "Haworth_5mpp_surf.tif",
    "Shoemaker": "Shoemaker_5mpp_surf.tif",
    "Amundsen rim": "DM1_5mpp_surf.tif",
    "Nobile rim 2": "DM2_5mpp_surf.tif",
    "Shackleton rim B": "LM1_5mpp_surf.tif",
    "Shoemaker rim A": "LM2_5mpp_surf.tif",
    "Shoemaker rim B": "LM3_5mpp_surf.tif",
    "Shoemaker rim C": "LM4_5mpp_surf.tif",
    "Shoemaker rim D": "LM5_5mpp_surf.tif",
    "Shoemaker rim E": "LM6_5mpp_surf.tif",
    "Faustini rim A": "LM7_5mpp_surf.tif",
    "Shoemaker rim F": "LM8_5mpp_surf.tif",
    "Cabeus exterior wall 1": "NPA_5mpp_surf.tif",
    "Amundsen 1": "NPB_5mpp_surf.tif",
    "Idel'son L crater 1": "NPC_5mpp_surf.tif",
    "Malapert crater 1": "NPD_5mpp_surf.tif",
    "Connecting ridge": "Site01_5mpp_surf.tif",
    "Shackleton rim": "Site04_5mpp_surf.tif",
    "Nobile rim 1": "Site06_5mpp_surf.tif",
    "Peak near Shackleton": "Site07_5mpp_surf.tif",
    "de Gerlache rim": "Site11_5mpp_surf.tif",
    "de Gerlache rim 2": "SL2_5mpp_surf.tif",
    "Leibnitz beta plateau": "Site20_5mpp_surf.tif",
    "Leibnitz beta plateau, extended": "Site20v2_5mpp_surf.tif",
    "Malapert massif": "Site23_5mpp_surf.tif",
    "de Gerlache-Kocher massif": "Site42_5mpp_surf.tif",
}

MAP_TYPE_KEYS = {
    "elevation",
    "slope",
    "hillshade",
    "solar_illumination_yr_avg",
    "solar_illumination_day_avg",
    "meteor_flux",
    "average_temperature",
}

_site_bounds_cache: dict[str, dict] | None = None

_STERE_CRS = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m"
_LONGLAT_CRS = "+proj=longlat +a=1737400 +b=1737400"
_to_lonlat = Transformer.from_crs(_STERE_CRS, _LONGLAT_CRS, always_xy=True)


def get_site_center_lonlat(site_name: str) -> tuple[float, float] | None:
	"""Return (lon, lat) of the site center in selenographic degrees."""
	bounds = _load_site_bounds()
	if site_name not in bounds:
		return None
	b = bounds[site_name]
	cx = (b["left"] + b["right"]) / 2.0
	cy = (b["bottom"] + b["top"]) / 2.0
	lon, lat = _to_lonlat.transform(cx, cy)
	return float(lon), float(lat)


def _normalize_key(key: str) -> str:
    key = key.strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    return re.sub(r"_+", "_", key).strip("_")


def _load_site_bounds() -> dict[str, dict]:
    global _site_bounds_cache
    if _site_bounds_cache is not None:
        return _site_bounds_cache

    bounds: dict[str, dict] = {}
    for name, filename in SITE_PRESET_FILES.items():
        path = CYNTHIUM_DATA_DIR / filename
        if not path.exists():
            continue
        with rasterio.open(str(path)) as src:
            b = src.bounds
            bounds[name] = {
                "left": float(b.left),
                "right": float(b.right),
                "bottom": float(b.bottom),
                "top": float(b.top),
                "width_m": float(b.right - b.left),
                "height_m": float(b.top - b.bottom),
                "tile_shape": list(src.shape),
                "tile_res": list(src.res),
            }
    _site_bounds_cache = bounds
    return bounds


def list_sites() -> list[dict]:
    bounds = _load_site_bounds()
    sites = []
    for name, b in bounds.items():
        sites.append({"name": name, **b})
    sites.sort(key=lambda s: s["name"])
    return sites


def _crop_raster(source_path: Path, bounds: dict) -> tuple[np.ndarray, dict] | None:
    """Crop a raster to the site bounds. Returns (data, meta) or None."""
    crop_bounds = (bounds["left"], bounds["bottom"], bounds["right"], bounds["top"])
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

        transform = src.window_transform(window)
        meta = {"transform": transform, "crs": src.crs, "bounds": src.bounds}
    return data, meta


def _hillshade(data: np.ndarray, az: float = 315, alt: float = 45) -> np.ndarray:
    """Compute hillshade from elevation data."""
    # Fill nodata for gradient computation
    filled = np.where(np.isfinite(data), data, np.nan)

    # Pad to handle edges
    padded = np.pad(filled, 1, mode="edge")
    x, y = np.gradient(padded, 40.0, 40.0)  # 40m resolution
    x = x[1:-1, 1:-1]
    y = y[1:-1, 1:-1]

    az_rad = np.radians(az)
    alt_rad = np.radians(alt)

    # Hillshade formula
    slope = np.arctan(np.sqrt(x**2 + y**2))
    aspect = np.arctan2(-x, y)

    shaded = np.sin(alt_rad) * np.cos(slope) + np.cos(alt_rad) * np.sin(slope) * np.cos(
        az_rad - aspect
    )
    shaded = np.clip(shaded, 0, 1)
    shaded[~np.isfinite(data)] = 0
    return (shaded * 255).astype(np.uint8)


def _slope_deg(data: np.ndarray) -> np.ndarray:
    """Compute slope in degrees from elevation data."""
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
    """Convert a 2D array to a base64 PNG.

    If colormap is True, use the terrain colormap.
    If False, treat data as uint8 grayscale.
    """
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
    """Crop the appropriate raster to the site bounds and return display data.

    Returns:
      - image_data: base64 PNG
      - value_range: [min, max] for the data
      - shape: [rows, cols]
      - bounds: crop bounds
      - label: human-readable layer name
    """
    bounds = _load_site_bounds()
    if site_name not in bounds:
        return None

    b = bounds[site_name]
    map_key = _normalize_key(map_type)

    # Determine which raster to use
    if map_key == "elevation":
        cropped = _crop_raster(COARSE_ELEVATION_PATH, b)
        if cropped is None:
            return None
        data, meta = cropped
        label = "Elevation"
        png = _data_to_png(data, colormap=True)
        # Downsample for 3D mesh
        h, w = data.shape
        target = 200
        stride = max(1, int(max(h, w) / target))
        ds = data[::stride, ::stride].copy()
        ds[~np.isfinite(ds)] = float(np.nanmin(ds)) if np.any(np.isfinite(ds)) else 0

    elif map_key == "slope":
        cropped = _crop_raster(COARSE_ELEVATION_PATH, b)
        if cropped is None:
            return None
        elev, _ = cropped
        data = _slope_deg(elev)
        label = "Slope (deg)"
        png = _data_to_png(data, colormap=True)

    elif map_key == "hillshade":
        cropped = _crop_raster(COARSE_ELEVATION_PATH, b)
        if cropped is None:
            return None
        elev, _ = cropped
        data = _hillshade(elev).astype(np.float32)
        label = "Hillshade"
        png = _data_to_png(data, colormap=False)

    elif map_key in ("solar_illumination_yr_avg", "solar_illumination"):
        cropped = _crop_raster(ILLUMINATION_PATH, b)
        if cropped is None:
            return None
        data, meta = cropped
        label = "Solar Illumination"
        png = _data_to_png(data, colormap=True)

    elif map_key in ("solar_illumination_day_avg",):
        # Use yearly avg as fallback for now
        cropped = _crop_raster(ILLUMINATION_PATH, b)
        if cropped is None:
            return None
        data, meta = cropped
        label = "Solar Illumination (day avg.)"
        png = _data_to_png(data, colormap=True)

    elif map_key == "meteor_flux":
        cropped = _crop_raster(METEOR_PATH, b)
        if cropped is None:
            return None
        data, meta = cropped
        label = "Meteor Flux"
        png = _data_to_png(data, colormap=True)

    elif map_key == "average_temperature":
        summer = _crop_raster(SUMMER_TEMP_PATH, b)
        winter = _crop_raster(WINTER_TEMP_PATH, b)
        if summer is None and winter is None:
            return None
        s_data = summer[0] if summer else None
        w_data = winter[0] if winter else None
        if s_data is not None and w_data is not None:
            data = (s_data + w_data) / 2.0
        elif s_data is not None:
            data = s_data
        else:
            data = w_data
        label = "Avg Temperature"
        png = _data_to_png(data, colormap=True)

    else:
        return None

    mask = np.isfinite(data)
    dmin = float(np.min(data[mask])) if np.any(mask) else 0
    dmax = float(np.max(data[mask])) if np.any(mask) else 0

    payload: dict = {
        "image_data": png,
        "value_range": [dmin, dmax],
        "shape": list(data.shape),
        "bounds": {
            "left": b["left"],
            "bottom": b["bottom"],
            "right": b["right"],
            "top": b["top"],
        },
        "label": label,
        "map_type": map_type,
    }

    # Always include terrain height data (cropped from elevation.tif)
    elev_cropped = _crop_raster(COARSE_ELEVATION_PATH, b)
    if elev_cropped is not None:
        elev_data, _ = elev_cropped
        h, w = elev_data.shape
        target = 200
        stride = max(1, int(max(h, w) / target))
        ds = elev_data[::stride, ::stride].copy()
        mask = np.isfinite(ds)
        if np.any(mask):
            fill_val = float(np.nanmin(ds[mask]))
        else:
            fill_val = 0.0
        ds[~mask] = fill_val
        payload["height_data"] = ds.tolist()
        payload["downsampled_shape"] = list(ds.shape)
        payload["min_elev"] = float(np.min(ds))
        payload["max_elev"] = float(np.max(ds))

    return payload
