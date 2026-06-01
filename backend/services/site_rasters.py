from __future__ import annotations

import base64
import io
import re
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import from_bounds

HERE = Path(__file__).resolve().parent.parent
CYNTHIUM_DATA_DIR = Path("/home/osh/Documents/code/cynthium/data")
COARSE_ELEVATION_PATH = HERE / "data" / "elevation.tif"

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

_site_bounds_cache: dict[str, dict] | None = None


def _load_site_bounds() -> dict[str, dict]:
    """Read bounds from the 5mpp tiles once and cache them."""
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
    """Return list of available sites with their bounds."""
    bounds = _load_site_bounds()
    sites = []
    for name, b in bounds.items():
        sites.append({"name": name, **b})
    sites.sort(key=lambda s: s["name"])
    return sites


def _normalize_key(name: str) -> str:
    key = name.strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    return re.sub(r"_+", "_", key).strip("_")


def get_site_elevation(site_name: str) -> dict | None:
    """Crop the coarse elevation map to the site bounds.

    Returns a dict with:
      - image_data: base64 PNG (color-mapped elevation)
      - height_data: downsampled 2D array for 3D mesh
      - shape: [rows, cols] of the cropped raster
      - bounds: the crop bounds
      - min_elev, max_elev: elevation range
    """
    bounds = _load_site_bounds()
    if site_name not in bounds:
        return None

    b = bounds[site_name]
    crop_bounds = (b["left"], b["bottom"], b["right"], b["top"])

    with rasterio.open(str(COARSE_ELEVATION_PATH)) as src:
        window = from_bounds(*crop_bounds, transform=src.transform)
        window = window.round_offsets().round_lengths()

        if window.width <= 0 or window.height <= 0:
            return None

        data = src.read(
            1,
            window=window,
            boundless=True,
            fill_value=src.nodata,
        ).astype(np.float32)

        transform = src.window_transform(window)
        out_bounds = rasterio.transform.array_bounds(
            data.shape[0], data.shape[1], transform
        )

    # Mask out nodata
    mask = np.isfinite(data)
    if not np.any(mask):
        return None

    elev_min = float(np.min(data[mask]))
    elev_max = float(np.max(data[mask]))
    elev_range = elev_max - elev_min if elev_max > elev_min else 1.0

    # --- Generate color-mapped PNG ---
    norm = np.clip((data - elev_min) / elev_range, 0.0, 1.0)
    colored = _apply_colormap(norm)

    # Overlay transparency for nodata
    colored[~mask] = 0
    alpha = np.where(mask, 255, 0).astype(np.uint8)
    rgba = np.dstack((colored, alpha))

    img = Image.fromarray(rgba, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    # --- Downsample height data for 3D mesh ---
    target = 200  # max dimension for mesh
    h, w = data.shape
    stride = max(1, int(max(h, w) / target))
    downsampled = data[::stride, ::stride].copy()
    downsampled[~np.isfinite(downsampled)] = elev_min  # fill nodata with min

    payload = {
        "image_data": png_b64,
        "height_data": downsampled.tolist(),
        "shape": list(data.shape),
        "downsampled_shape": list(downsampled.shape),
        "bounds": {
            "left": float(out_bounds[0]),
            "bottom": float(out_bounds[1]),
            "right": float(out_bounds[2]),
            "top": float(out_bounds[3]),
        },
        "min_elev": elev_min,
        "max_elev": elev_max,
    }
    return payload


_COLORMAP_CACHE: dict[str, np.ndarray] = {}


def _apply_colormap(norm: np.ndarray) -> np.ndarray:
    """Apply a terrain colormap (greens/browns/whites)."""
    # Simple multi-stop gradient: blueish -> green -> brown -> white
    stops = np.array([
        [0.00, 0.05, 0.20, 0.40],   # deep blue
        [0.25, 0.10, 0.40, 0.20],   # dark green
        [0.50, 0.30, 0.60, 0.20],   # tan/green
        [0.70, 0.55, 0.40, 0.25],   # brown
        [0.85, 0.75, 0.65, 0.50],   # light brown
        [1.00, 1.00, 1.00, 1.00],   # white
    ])
    pos = stops[:, 0]
    colors = stops[:, 1:]

    r = np.interp(norm, pos, colors[:, 0])
    g = np.interp(norm, pos, colors[:, 1])
    b = np.interp(norm, pos, colors[:, 2])
    rgb = np.stack([r, g, b], axis=-1)
    return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
