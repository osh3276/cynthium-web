# Cynthium Web

Lunar rover route planning and simulation. Plan paths across the Moon's south pole, run physics-based simulations, and compare your routes against an A*-based autodesigner. Also includes a game mode where you compete against the AI across multiple sites.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Three.js (3D terrain), Canvas 2D (map overlay) |
| Backend | Python, FastAPI, NumPy, SciPy, Pillow, pyproj, spiceypy |
| Data | Pre-processed `.npy` rasters (elevation, slope, illumination, meteor flux, temperature) |
| Deployment | Vercel (frontend + backend as separate projects) |

## Project structure

```
cynthium-web/
├── frontend/                    # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapSelectionPanel.tsx     # site picker + map layer chooser
│   │   │   ├── MapView.tsx               # 2D canvas map with waypoint editing
│   │   │   ├── TerrainView.tsx           # 3D Three.js terrain renderer
│   │   │   ├── ViewContainer.tsx         # toggles between 2D/3D views
│   │   │   ├── Sidebar.tsx               # right sidebar hub
│   │   │   ├── PlanningPanel.tsx         # waypoint list + autodesign trigger
│   │   │   ├── RoverSettingsPanel.tsx    # rover mass/power/friction config
│   │   │   ├── SimulationResultsPanel.tsx# simulation score breakdown
│   │   │   ├── MenuBar.tsx              # top bar with game start
│   │   │   ├── GameResultDialog.tsx     # round result modal
│   │   │   └── GameFinishDialog.tsx     # game-over summary modal
│   │   ├── App.tsx                       # main app state + API calls
│   │   ├── App.css
│   │   ├── constants.ts                  # map types, scoring params, site presets
│   │   ├── types.ts                      # TypeScript interfaces
│   │   ├── main.tsx                      # entry point
│   │   └── vite-env.d.ts
│   ├── vite.config.ts                    # dev proxy: /api → backend
│   ├── vercel.json                       # prod rewrites: /api → backend
│   ├── package.json
│   ├── tsconfig.json
│   └── eslint.config.js
├── backend/                     # FastAPI app
│   ├── app/
│   │   ├── main.py                       # FastAPI app, CORS, root route
│   │   ├── core/config.py                # pydantic settings
│   │   ├── api/main.py                   # router aggregation
│   │   ├── api/routes/
│   │   │   ├── sites.py                  # /api/sites endpoints
│   │   │   └── items.py                  # sample CRUD endpoints
│   │   ├── services/
│   │   │   ├── site_rasters.py           # .npy loading, PNG generation, hillshade/slope
│   │   │   ├── pathfinding.py            # A* (Dijkstra) autodesign on cost rasters
│   │   │   ├── simulation.py             # physics-based rover traversal scoring
│   │   │   ├── rover_settings.py         # rover dataclass + validation
│   │   │   └── sun_position.py           # SPICE-based sun azimuth/elevation
│   │   └── templates/index.html          # legacy FastAPI-served page
│   ├── data/
│   │   ├── sites.json                    # site metadata (bounds, resolution)
│   │   └── sites/                        # per-site .npy rasters + meta JSON
│   │       ├── amundsen_1/
│   │       ├── amundsen_rim/
│   │       ├── cabeus_exterior_wall_1/
│   │       ├── connecting_ridge/
│   │       ├── de_gerlache_kocher_massif/
│   │       ├── de_gerlache_rim/
│   │       ├── de_gerlache_rim_2/
│   │       ├── faustini_rim_a/
│   │       ├── haworth/
│   │       ├── idel_son_l_crater_1/
│   │       ├── leibnitz_beta_plateau/
│   │       ├── leibnitz_beta_plateau_extended/
│   │       ├── malapert_crater_1/
│   │       ├── malapert_massif/
│   │       ├── nobile_rim_1/
│   │       ├── nobile_rim_2/
│   │       ├── peak_near_shackleton/
│   │       ├── shackleton_rim/
│   │       ├── shackleton_rim_b/
│   │       ├── shoemaker/
│   │       ├── shoemaker_rim_a/
│   │       ├── shoemaker_rim_b/
│   │       ├── shoemaker_rim_c/
│   │       ├── shoemaker_rim_d/
│   │       ├── shoemaker_rim_e/
│   │       └── shoemaker_rim_f/
│   ├── requirements.txt                  # Python dependencies
│   └── scripts/                          # data processing scripts
└── README.md
```

## Getting started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at http://localhost:8000. Docs available at http://localhost:8000/docs (Swagger UI).

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The app runs at http://localhost:5173. During dev, Vite proxies `/api/*` requests to the backend, so no CORS issues.

## API endpoints

All endpoints are prefixed with `/api`.

### `GET /api/sites`

List all available lunar sites with their bounds and resolution metadata.

### `GET /api/sites/{site_name}/map?map_type={type}&date={date}`

Get a map layer for a site as a base64-encoded PNG plus value range, bounds, and downsampled 3D height data.

**Map types:** `Elevation`, `Slope`, `Hillshade`, `Solar Illumination (yr. avg.)`, `Solar Illumination (day avg.)`, `Meteor Flux`, `Average Temperature`

Optional `date` parameter (e.g. `2026-05-13`) computes sun azimuth/elevation for the site center.

### `POST /api/sites/{site_name}/autodesign`

Compute an optimal path through given waypoints using A* (Dijkstra) on a weighted cost raster.

**Body:**
```json
{
	"waypoints_xy": [[x1, y1], [x2, y2], ...],
	"slope_weight": 0.3,
	"sun_weight": 0.3,
	"meteor_weight": 0.05,
	"path_mode": "segment",
	"rover_mass_kg": 150.0,
	"rover_power_hp": 0.2,
	"rover_friction_coeff": 0.6,
	"rover_crr": 0.1
}
```

`path_mode`: `"segment"` plans between successive waypoint pairs, `"direct"` plans from first to last waypoint.

### `POST /api/sites/{site_name}/simulate`

Run a physics-based rover simulation along a given path. Returns traversal metrics and a letter grade (S/A/B/C/D/F).

**Body:**
```json
{
	"path_xy": [[x1, y1], [x2, y2], ...],
	"rover_mass_kg": 150.0,
	"rover_power_hp": 0.2,
	"rover_friction_coeff": 0.6,
	"rover_crr": 0.1
}
```

**Response includes:**
- `traversal_score` (0–1000)
- `traversal_grade` (S/A/B/C/D/F)
- `traversal_subscores` — breakdown: path efficiency, energy economy, illumination, meteor safety, traction match, power match
- `total_energy_kwh`, `avg_speed_mps`, `max_slope_deg`, etc.

### `GET /api/hello`

Health check — returns `{"message": "Hello from FastAPI 🚀"}`.

## Using the app

1. **Select a site** from the dropdown — the map and 3D terrain load automatically.
2. **Switch map layers** (elevation, slope, hillshade, illumination, etc.) to inspect terrain.
3. **Place waypoints** by clicking the map — the app draws your planned route.
4. **Configure rover settings** — mass, power, wheel friction, rolling resistance.
5. **Autodesign** — let the AI compute an optimal path between your waypoints (or use it as a comparison).
6. **Simulate** — run physics simulation on both your manual path and the AI path, then compare scores.

## Game mode

Click **"Start Game"** in the menu bar. Each round picks a random site and generates start/end points. Place waypoints connecting the markers and submit — the app simulates both your path and an AI-optimized path, awarding scores out of 1000. Complete 5 rounds for a final scorecard.

## Deployment

The frontend is deployed as a static Vite build on Vercel. The backend runs as a separate FastAPI serverless project on Vercel.

`frontend/vercel.json` rewrites `/api/*` requests to the backend URL in production. The backend CORS config allows the frontend origin.

To deploy your own:

```bash
# Frontend
cd frontend
pnpm build
# Deploy the dist/ folder to Vercel (set Framework Preset: Vite)

# Backend
cd backend
# Deploy app/main.py as a FastAPI serverless function on Vercel
# (or run it as a standalone uvicorn server)
```

## Data

Lunar site data is pre-processed into `.npy` rasters per site, covering:
- Elevation (m, relative to 1737400m sphere)
- Slope (degrees, computed from elevation)
- Hillshade (255-value grayscale)
- Solar illumination (annual and daily average)
- Meteor flux
- Surface temperature (summer and winter averages)

Coordinate system: stereographic projection centered on the lunar south pole (`+proj=stere +lat_0=-90 +lon_0=0 +a=1737400 +b=1737400 +units=m`).
