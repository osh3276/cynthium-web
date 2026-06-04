from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.pathfinding import compute_autopath
from services.rover_settings import RoverSettings
from services.simulation import run_simulation
from services.site_rasters import get_site_center_lonlat, get_site_map, list_sites
from services.sun_position import sun_position

app = FastAPI(title="Cynthium API")

app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:5173"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


class AutopathRequest(BaseModel):
	waypoints_xy: list[list[float]]
	min_slope_deg: float = 0.0
	max_slope_deg: float = 20.0
	slope_weight: float = 1.0
	sun_weight: float = 0.5


class SimulateRequest(BaseModel):
	path_xy: list[list[float]]
	rover_mass_kg: float = 150.0
	rover_power_hp: float = 0.2
	rover_friction_coeff: float = 0.6
	rover_crr: float = 0.1


@app.get("/api/hello")
async def hello():
	return {"message": "Hello from FastAPI 🚀"}


@app.get("/api/sites")
async def sites():
	return {"sites": list_sites()}


@app.get("/api/sites/{site_name}/map")
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


@app.post("/api/sites/{site_name}/autopath")
async def site_autopath(site_name: str, req: AutopathRequest):
	result = compute_autopath(
		site_name,
		req.waypoints_xy,
		min_slope_deg=req.min_slope_deg,
		max_slope_deg=req.max_slope_deg,
		slope_weight=req.slope_weight,
		sun_weight=req.sun_weight,
	)
	if "error" in result:
		raise HTTPException(status_code=400, detail=result["error"])
	return result


@app.post("/api/sites/{site_name}/simulate")
async def site_simulate(site_name: str, req: SimulateRequest):
	if len(req.path_xy) < 2:
		raise HTTPException(status_code=400, detail="Need at least 2 path points")
	try:
		rover = RoverSettings(
			mass_kg=req.rover_mass_kg,
			power_hp=req.rover_power_hp,
			wheel_friction_coeff=req.rover_friction_coeff,
			rolling_resistance_coeff=req.rover_crr,
		)
		rover.validate()
		stats = run_simulation(site_name, req.path_xy, rover)
		return stats
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))
