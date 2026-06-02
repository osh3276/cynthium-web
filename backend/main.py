from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from services.site_rasters import get_site_map, list_sites

app = FastAPI(title="Cynthium API")

app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:5173"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


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
