from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from services.site_rasters import get_site_elevation, list_sites

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


@app.get("/api/sites/{site_name}/elevation")
async def site_elevation(site_name: str):
	payload = get_site_elevation(site_name)
	if payload is None:
		raise HTTPException(status_code=404, detail=f"Site '{site_name}' not found")
	return payload
