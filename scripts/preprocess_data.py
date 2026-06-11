"""
Pre-process global coarse GeoTIFFs into per-site lightweight .npy files.

Run this locally (not on Vercel) after downloading the raw data.
Requires: CYNTHIUM_DATA_DIR pointing to the high-res site rasters,
and the global rasters in backend-old/data/.

Output: backend/data/sites/ dir with per-site .npy + sites.json
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

# Paths — adjust if needed
CYNTHIUM_DATA_DIR = Path(os.environ.get(
	"CYNTHIUM_DATA_DIR",
	"/home/osh/Documents/code/cynthium/data",
))
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
OLD_DATA_DIR = Path(__file__).resolve().parent.parent / "backend-old" / "data"

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

# Global coarse raster paths
COARSE_RASTERS = {
	"elevation": OLD_DATA_DIR / "elevation.tif",
	"illumination": OLD_DATA_DIR / "illumination.tif",
	"meteor": OLD_DATA_DIR / "meteor_energy.tif",
	"summer_temp": OLD_DATA_DIR / "summer-temp.tif",
	"winter_temp": OLD_DATA_DIR / "winter-temp.tif",
}

PAD_CELLS = 500  # generous padding around site bounds


def _normalize_key(key: str) -> str:
	import re
	key = key.strip().lower()
	key = re.sub(r"[^a-z0-9]+", "_", key)
	return re.sub(r"_+", "_", key).strip("_")


def extract_site_bounds() -> dict[str, dict]:
	"""Read bounds from high-res site rasters."""
	bounds: dict[str, dict] = {}
	for name, filename in SITE_PRESET_FILES.items():
		path = CYNTHIUM_DATA_DIR / filename
		if not path.exists():
			print(f"  SKIP {name}: {path} not found")
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
				"normalized_name": _normalize_key(name),
			}
		print(f"  OK   {name}: {bounds[name]['width_m']:.0f}x{bounds[name]['height_m']:.0f}m")
	return bounds


def crop_and_save(site_name: str, site_bounds: dict, raster_key: str, raster_path: Path, out_dir: Path):
	"""Crop a coarse raster to site bounds + padding, save as .npy + meta."""
	if not raster_path.exists():
		print(f"  SKIP {raster_key}: {raster_path} not found")
		return

	normalized = _normalize_key(site_name)
	site_dir = out_dir / "data" / "sites" / normalized
	site_dir.mkdir(parents=True, exist_ok=True)

	npy_path = site_dir / f"{raster_key}.npy"
	meta_path = site_dir / f"{raster_key}_meta.json"

	# Use padded bounds
	padded_bounds = (
		site_bounds["left"] - PAD_CELLS * site_bounds["tile_res"][0],
		site_bounds["bottom"] - PAD_CELLS * site_bounds["tile_res"][1],
		site_bounds["right"] + PAD_CELLS * site_bounds["tile_res"][0],
		site_bounds["top"] + PAD_CELLS * site_bounds["tile_res"][1],
	)

	with rasterio.open(str(raster_path)) as src:
		window = from_bounds(*padded_bounds, transform=src.transform)
		window = window.round_offsets().round_lengths()
		if window.width <= 10 or window.height <= 10:
			print(f"  SKIP {raster_key}: window too small ({window.width}x{window.height})")
			return

		data = src.read(
			1,
			window=window,
			boundless=True,
			fill_value=src.nodata if src.nodata is not None else float("nan"),
		).astype(np.float32)

		transform = src.window_transform(window)
		meta = {
			"transform": [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
			"crs": str(src.crs) if src.crs else None,
			"shape": list(data.shape),
			"res": [float(transform.a), float(transform.e)],
			"padded_bounds": padded_bounds,
		}

	np.save(str(npy_path), data)
	with open(str(meta_path), "w") as f:
		json.dump(meta, f, indent=2)
	print(f"  SAVE {raster_key}: {data.shape} ({data.nbytes / 1024:.1f} KB)")


def main():
	out_dir = BACKEND_DIR
	print(f"Output: {out_dir}")
	print(f"Coarse data: {OLD_DATA_DIR}")
	print(f"High-res sites: {CYNTHIUM_DATA_DIR}")
	print()

	# Step 1: Extract site bounds from high-res rasters
	print("=== Extracting site bounds ===")
	site_bounds = extract_site_bounds()
	print(f"Found {len(site_bounds)} sites\n")

	if not site_bounds:
		print("ERROR: No sites found. Check CYNTHIUM_DATA_DIR.")
		sys.exit(1)

	# Step 2: Save sites.json
	print("=== Saving sites.json ===")
	sites_json_path = out_dir / "data" / "sites.json"
	sites_json_path.parent.mkdir(parents=True, exist_ok=True)

	sites_list = []
	for name, b in site_bounds.items():
		sites_list.append({"name": name, **b})
	sites_list.sort(key=lambda s: s["name"])

	with open(str(sites_json_path), "w") as f:
		json.dump(sites_list, f, indent=2)
	print(f"Saved {len(sites_list)} sites to {sites_json_path}\n")

	# Step 3: Crop coarse rasters per site
	print("=== Cropping coarse rasters per site ===")
	for name, bounds in site_bounds.items():
		print(f"\n--- {name} ---")
		for raster_key, raster_path in COARSE_RASTERS.items():
			crop_and_save(name, bounds, raster_key, raster_path, out_dir)

	print("\n=== Done ===")
	total_size = sum(
		f.stat().st_size
		for f in (out_dir / "data" / "sites").rglob("*")
		if f.is_file() and f.suffix in (".npy", ".json")
	)
	print(f"Total processed data: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
	main()
