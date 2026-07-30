import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.pathfinding import compute_autodesign
from app.services.rover_settings import RoverSettings
from app.services.simulation import run_simulation
from app.services.site_rasters import get_site_center_lonlat, get_site_map, list_sites
from app.services.sun_position import sun_position

router = APIRouter(prefix="/sites", tags=["sites"])

GAMES_DIR = Path(__file__).resolve().parents[3] / "data" / "games"


@router.get("/games")
async def list_games():
    """List available game definition files."""
    if not GAMES_DIR.is_dir():
        return {"games": []}
    files = []
    for f in sorted(GAMES_DIR.glob("*.json")):
        try:
            with open(f) as fh:
                data = json.load(fh)
            files.append({
                "filename": f.name,
                "name": data.get("name", f.stem),
                "description": data.get("description", ""),
                "roundCount": len(data.get("rounds", [])),
            })
        except Exception:
            pass
    return {"games": files}


@router.get("/games/{filename}")
async def get_game(filename: str):
    """Load a specific game definition file."""
    # Prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = GAMES_DIR / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail=f"Game '{filename}' not found")
    try:
        with open(filepath) as f:
            data = json.load(f)
        return data
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Invalid JSON in '{filename}'")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AutodesignRequest(BaseModel):
			waypoints_xy: list[list[float]]
			slope_weight: float = 0.3
			sun_weight: float = 0.3
			meteor_weight: float = 0.05
			path_mode: str = "segment"
			rover_mass_kg: float = 150.0
			rover_power_hp: float = 0.2
			rover_friction_coeff: float = 0.6
			rover_crr: float = 0.1
			rover_battery_capacity_wh: float = 500.0
			rover_idle_drain_w: float = 10.0
			rover_target_cruise_speed_mps: float = 2.0
			rover_max_brake_decel_mps2: float = 1.0
			max_attempts: int = 10


class SimulateRequest(BaseModel):
		path_xy: list[list[float]]
		rover_mass_kg: float = 150.0
		rover_power_hp: float = 0.2
		rover_friction_coeff: float = 0.6
		rover_crr: float = 0.1
		rover_battery_capacity_wh: float = 500.0
		rover_idle_drain_w: float = 10.0
		rover_target_cruise_speed_mps: float = 2.0
		rover_max_brake_decel_mps2: float = 1.0


@router.get("")
async def sites():
	return {"sites": list_sites()}


@router.get("/{site_name}/map")
async def site_map(
	site_name: str,
	map_type: str = Query("Elevation", description="Map layer type"),
	date: str | None = Query(None, description="Date for sun position, e.g. 2026-05-13"),
):
	payload = get_site_map(site_name, map_type)
	if payload is None:
		raise HTTPException(status_code=404, detail=f"Site '{site_name}' or map type '{map_type}' not found")

	if date:
		ll = get_site_center_lonlat(site_name)
		if ll:
			try:
				utc = f"{date}T00:00:00"
				az, el = sun_position(ll[1], ll[0], utc)
				payload["sun_azimuth"] = az
				payload["sun_elevation"] = el
			except Exception:
				pass

	return payload


@router.post("/{site_name}/autodesign")
async def site_autodesign(site_name: str, req: AutodesignRequest):
	print(f"[API] Autodesign request: site={site_name} wps={len(req.waypoints_xy)} mode={req.path_mode} mu={req.rover_friction_coeff}")
	result = compute_autodesign(
	    site_name,
	    req.waypoints_xy,
	    slope_weight=req.slope_weight,
	    sun_weight=req.sun_weight,
	    meteor_weight=req.meteor_weight,
	    path_mode=req.path_mode,
	    rover_mass_kg=req.rover_mass_kg,
	    rover_power_hp=req.rover_power_hp,
	    rover_friction_coeff=req.rover_friction_coeff,
	    rover_crr=req.rover_crr,
	rover_battery_capacity_wh=req.rover_battery_capacity_wh,
	rover_idle_drain_w=req.rover_idle_drain_w,
	rover_target_cruise_speed_mps=req.rover_target_cruise_speed_mps,
	rover_max_brake_decel_mps2=req.rover_max_brake_decel_mps2,
	    max_attempts=req.max_attempts,
	)
	if "error" in result:
		print(f"[API] Autodesign error: {result['error']}")
		raise HTTPException(status_code=400, detail=result["error"])
	print(f"[API] Autodesign success: pts={len(result['path_xy'])}")
	return result


@router.post("/{site_name}/simulate")
async def site_simulate(site_name: str, req: SimulateRequest):
	if len(req.path_xy) < 2:
		raise HTTPException(status_code=400, detail="Need at least 2 path points")
	print(f"[API] Simulate request: site={site_name} pts={len(req.path_xy)}")
	try:
		rover = RoverSettings(
			mass_kg=req.rover_mass_kg,
			power_hp=req.rover_power_hp,
			wheel_friction_coeff=req.rover_friction_coeff,
			rolling_resistance_coeff=req.rover_crr,
			battery_capacity_wh=req.rover_battery_capacity_wh,
			idle_drain_w=req.rover_idle_drain_w,
			target_cruise_speed_mps=req.rover_target_cruise_speed_mps,
			max_brake_decel_mps2=req.rover_max_brake_decel_mps2,
		)
		rover.validate()
		stats = run_simulation(site_name, req.path_xy, rover)
		return stats
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))
