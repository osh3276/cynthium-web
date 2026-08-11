import { Section, SubSection, P, InlineCode, CodeBlock, Note, Table, List } from "../primitives";

const MAP_TYPES = [
	"Elevation",
	"Slope",
	"Hillshade",
	"Solar Illumination (yr. avg.)",
	"Solar Illumination (day avg.)",
	"Meteor Flux",
	"Average Temperature",
];

export function ApiSection() {
	return (
		<Section id="api" title="API reference">
			<P>
				All endpoints are prefixed with <InlineCode>/api</InlineCode>. The
				backend runs at <InlineCode>http://localhost:8000</InlineCode> in
				development; the frontend proxies <InlineCode>/api/*</InlineCode>
				automatically. Interactive docs are available at{" "}
				<InlineCode>http://localhost:8000/docs</InlineCode>.
			</P>

			<Table
				headers={["Endpoint", "Purpose"]}
				rows={[
					[<InlineCode>GET /api/sites</InlineCode>, "List sites with bounds and resolution metadata"],
					[<InlineCode>{"GET /api/sites/{site}/map"}</InlineCode>, "Map layer PNG, value range, and 3D height data"],
					[<InlineCode>{"POST /api/sites/{site}/autodesign"}</InlineCode>, "A* path between waypoints, physics-validated"],
					[<InlineCode>{"POST /api/sites/{site}/simulate"}</InlineCode>, "Physics simulation stats, score, and grade for a path"],
					[<InlineCode>GET /api/sites/games</InlineCode>, "List available game definition files"],
					[<InlineCode>{"GET /api/sites/games/{filename}"}</InlineCode>, "Load one game definition"],
					[<InlineCode>GET /api/hello</InlineCode>, "Health check"],
					[<InlineCode>GET /api/items</InlineCode>, "Sample CRUD endpoints (template code)"],
				]}
			/>

			<SubSection title="GET /api/sites">
				<P>Returns the list of available lunar sites with their bounds, resolution, and tile metadata:</P>
				<CodeBlock
					code={`{
  "sites": [
    {
      "name": "Haworth",
      "left": -75000, "right": -25000,
      "bottom": 70000, "top": 120000,
      "width_m": 50000, "height_m": 50000,
      "tile_shape": [5000, 5000],
      "tile_res": [10.0, 10.0]
    }
  ]
}`}
				/>
			</SubSection>

			<SubSection title="GET /api/sites/{site_name}/map">
				<P>
					Query parameters: <InlineCode>map_type</InlineCode> (default{" "}
					<InlineCode>Elevation</InlineCode>) and an optional{" "}
					<InlineCode>date</InlineCode> (e.g. <InlineCode>2026-05-13</InlineCode>) that
					attaches the sun azimuth/elevation for the site centre.
				</P>
				<P>Map types:</P>
				<List
					items={MAP_TYPES.map((t) => <InlineCode key={t}>{t}</InlineCode>)}
				/>
				<P>Response:</P>
				<CodeBlock
					code={`{
  "image_data": "<base64 PNG>",
  "value_range": [-2900, 1100],
  "shape": [5000, 5000],
  "bounds": { "left": -75000, "bottom": 70000, "right": -25000, "top": 120000 },
  "label": "Elevation",
  "map_type": "Elevation",
  "height_data": [[...]],          // 3D mesh heights
  "downsampled_shape": [5000, 5000],
  "min_elev": -2900,
  "max_elev": 1100,
  "sun_azimuth": 92.5,             // only when date is provided
  "sun_elevation": 3.2
}`}
				/>
			</SubSection>

			<SubSection title="POST /api/sites/{site_name}/autodesign">
				<P>Computes an optimal path through the given waypoints using A* on a weighted cost raster, then validates it with a physics simulation. Body:</P>
				<CodeBlock
					code={`{
  "waypoints_xy": [[x1, y1], [x2, y2], ...],
  "slope_weight": 0.3,
  "sun_weight": 0.3,
  "meteor_weight": 0.05,
  "path_mode": "segment",
  "rover_mass_kg": 150.0,
  "rover_power_hp": 0.2,
  "rover_friction_coeff": 0.6,
  "rover_crr": 0.1,
  "rover_battery_capacity_wh": 500.0,
  "rover_idle_drain_w": 10.0,
  "rover_target_cruise_speed_mps": 2.0,
  "rover_max_brake_decel_mps2": 1.0,
  "max_attempts": 10
}`}
				/>
				<P>
					<InlineCode>path_mode</InlineCode> is <InlineCode>segment</InlineCode> (plan
					between successive waypoint pairs) or <InlineCode>direct</InlineCode> (plan from
					the first to the last waypoint). Response:
				</P>
				<CodeBlock
					code={`{
  "path_xy": [[x1, y1], [x2, y2], ...],
  "total_cost": 0.0,
  "expanded": 0,
  "simulation": { ... }   // only when all attempts failed: last sim result
}`}
				/>
				<Note>
					If the autodesigner cannot find a physically feasible route after{" "}
					<InlineCode>max_attempts</InlineCode>, it still returns the last path
					with its <InlineCode>simulation</InlineCode> result attached so the UI
					can display the failure point and reason.
				</Note>
			</SubSection>

			<SubSection title="POST /api/sites/{site_name}/simulate">
				<P>Runs the physics-based rover simulation along a given path. Body:</P>
				<CodeBlock
					code={`{
  "path_xy": [[x1, y1], [x2, y2], ...],
  "rover_mass_kg": 150.0,
  "rover_power_hp": 0.2,
  "rover_friction_coeff": 0.6,
  "rover_crr": 0.1,
  "rover_battery_capacity_wh": 500.0,
  "rover_idle_drain_w": 10.0,
  "rover_target_cruise_speed_mps": 2.0,
  "rover_max_brake_decel_mps2": 1.0
}`}
				/>
				<P>Response includes traversal metrics, score, grade, and sub-scores:</P>
				<CodeBlock
					code={`{
  "traversal_score": 823.4,
  "traversal_grade": "A",
  "traversal_subscores": {
    "path_efficiency": 135.0,
    "energy_economy": 250.0,
    "illumination": 290.0,
    "meteor_safety": 45.0,
    "rover_traction_match": 80.0,
    "rover_power_match": 40.0
  },
  "total_distance_travelled": 3120.5,
  "total_displacement": 2900.0,
  "total_elevation_gain": 180.2,
  "average_slope": 3.4,
  "max_slope": 14.2,
  "percent_illumination": 86.0,
  "average_meteor_flux": 320.0,
  "average_temperature": 180.0,
  "average_velocity_mps": 1.4,
  "max_velocity_mps": 2.0,
  "traversal_time_s": 2140.0,
  "traverse_feasible": 1.0,
  "max_climbable_slope_deg": 25.6,
  "required_wheel_friction_coeff": 0.42,
  "battery_energy_used_j": 180000.0,
  "battery_remaining_pct": 90.0,
  "battery_capacity_wh": 500.0,
  "rover_mass_kg": 150.0,
  "rover_power_hp": 0.2,
  "rover_mu": 0.6,
  "rover_crr": 0.1,
  "failure_reason": null,
  "failure_xy": null,
  "path_velocity_profile": [[x, y, v_mps], ...]
}`}
				/>
				<P>
					On failure, <InlineCode>traverse_feasible</InlineCode> is 0,
					<InlineCode>failure_reason</InlineCode> explains why, and{" "}
					<InlineCode>failure_xy</InlineCode> gives the location where the rover
					got stuck.
				</P>
			</SubSection>

			<SubSection title="Games">
				<P>
					<InlineCode>GET /api/sites/games</InlineCode> lists the game definition
					files found in <InlineCode>backend/data/games/</InlineCode>:
				</P>
				<CodeBlock
					code={`{
  "games": [
    { "filename": "beginners.json", "name": "Beginner's Luck", "description": "...", "roundCount": 3 }
  ]
}`}
				/>
				<P>
					<InlineCode>{"GET /api/sites/games/{filename}"}</InlineCode> returns one game
					definition. Filenames are validated against path traversal. Example:
				</P>
				<CodeBlock
					code={`{
  "name": "Beginner's Luck",
  "description": "Three straightforward traverses across Haworth and Amundsen.",
  "rounds": [
    {
      "siteName": "Haworth",
      "mapType": "Elevation",
      "waypoints": [
        { "x": -36000, "y": 92000 },
        { "x": -33000, "y": 89000 },
        { "x": -35000, "y": 86000 }
      ]
    }
  ]
}`}
				/>
			</SubSection>

			<SubSection title="Errors">
				<List
					items={[
						<>404 with <InlineCode>detail</InlineCode> when a site, map type, or game file does not exist.</>,
						<>400 with <InlineCode>detail</InlineCode> when a path is too short, waypoints are outside the site, the rover settings are invalid, or autodesign cannot find a route.</>,
					]}
				/>
			</SubSection>
		</Section>
	);
}
