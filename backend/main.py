from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.pathfinding import compute_autopath
from services.site_rasters import get_site_map, list_sites

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
):
	payload = get_site_map(site_name, map_type)
	if payload is None:
		raise HTTPException(status_code=404, detail=f"Site '{site_name}' or map type '{map_type}' not found")
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
	if result is None:
		raise HTTPException(status_code=400, detail="Autopath failed")
	return result
