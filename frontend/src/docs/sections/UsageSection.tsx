import { Section, SubSection, P, InlineCode, Note, List } from "../primitives";

export function UsageSection() {
	return (
		<Section id="usage" title="Usage">
			<P>
				Start the backend and frontend as described in{" "}
				<a className="docs-link" href="#getting-started">
					Getting started
				</a>
				, then open <InlineCode>http://localhost:5173</InlineCode> in a browser.
			</P>

			<SubSection title="Workflow overview">
				<List
					ordered
					items={[
						<>Select a lunar site.</>,
						<>Choose a map layer.</>,
						<>Place waypoints on the 2D map.</>,
						<>Configure rover settings (preset or custom).</>,
						<>Run autodesign for an AI comparison (optional).</>,
						<>Run simulation.</>,
						<>Compare scores and inspect the 3D terrain view.</>,
						<>Play the game mode to compete against the AI.</>,
					]}
				/>
			</SubSection>

			<SubSection title="1. Select a site">
				<P>
					Use the site dropdown in the left panel. A colour-mapped elevation
					layer loads automatically in the 2D map view, and a Three.js
					terrain mesh appears in the 3D view.
				</P>
			</SubSection>

			<SubSection title="2. Select a map layer">
				<List
					items={[
						<><InlineCode>Elevation</InlineCode>: raw DEM, colour-mapped from low (blue) to high (red).</>,
						<><InlineCode>Slope</InlineCode>: terrain steepness in degrees, derived from the elevation.</>,
						<><InlineCode>Hillshade</InlineCode>: shaded relief for a synthetic sun angle.</>,
						<><InlineCode>Solar Illumination (yr. avg.)</InlineCode> and <InlineCode>Solar Illumination (day avg.)</InlineCode>: pre-computed solar exposure.</>,
						<><InlineCode>Meteor Flux</InlineCode>: modelled meteorite impact flux.</>,
						<><InlineCode>Average Temperature</InlineCode>: mean of the summer and winter surface temperature rasters.</>,
					]}
				/>
				<Note>
					Hillshade is a visual aid only. It is computed from a fixed
					synthetic light source and does not represent accurate shadows.
					Both illumination map types are currently served from the same
					pre-computed annual illumination raster; they are not temporally
					distinct products.
				</Note>
			</SubSection>

			<SubSection title="3. Plan a path">
				<List
					ordered
					items={[
						<>Click on the 2D map to place waypoints. The planned route is drawn between them.</>,
						<>Remove or reorder waypoints from the planning panel.</>,
						<>Click <InlineCode>Autodesign</InlineCode> to compute the AI route. It plans between successive waypoint pairs (segment mode) or from the first to the last waypoint (direct mode), then validates the result with a physics simulation, retrying with blocked cells if the rover cannot physically complete the route (up to 10 attempts).</>,
						<>The AI path is overlaid on the map for direct comparison with your manual route.</>,
					]}
				/>
				<P>Autodesign weights (from the planning panel):</P>
				<List
					items={[
						<><InlineCode>Slope weight</InlineCode> (default 0.3): how strongly uphill terrain is penalised.</>,
						<><InlineCode>Sun weight</InlineCode> (default 0.3): how strongly shadowed cells are penalised.</>,
						<><InlineCode>Meteor weight</InlineCode> (default 0.05): how strongly high-flux cells are penalised.</>,
					]}
				/>
			</SubSection>

			<SubSection title="4. Configure the rover">
				<P>
					Set mass, power, wheel friction, rolling resistance, battery
					capacity, idle drain, cruise speed, and max brake deceleration in
					the rover settings panel. The game mode uses the fixed{" "}
					<InlineCode>Artemis SR</InlineCode> preset; the planning mode also
					ships a <InlineCode>Curiosity</InlineCode> preset.
				</P>
			</SubSection>

			<SubSection title="5. Run a simulation">
				<List
					ordered
					items={[
						<>The path is sampled from the elevation raster.</>,
						<>The rover drives along the path with a PID speed controller, accumulating solar energy from the illumination raster at each timestep.</>,
						<>Battery energy is consumed (drive power plus constant idle drain).</>,
						<>The result reports feasibility, velocity, time, battery stats, and a 0-1000 traversal score with an S/A/B/C/D/F letter grade.</>,
					]}
				/>
				<P>Result sub-scores (total 1000): path efficiency, energy economy, illumination, meteor safety, rover traction match, and rover power match.</P>
				<Note>
					If the rover gets stuck or its battery is depleted, a red marker
					appears at the exact failure location with a text reason (for
					example "Insufficient traction for slope" or "Battery depleted").
					The manual path and the autopath each have their own marker.
				</Note>
			</SubSection>

			<SubSection title="6. Inspect in 3D">
				<P>
					Switch to the 3D terrain view to see the path draped over the
					digital elevation model. The view supports orbit, pan, and zoom
					controls.
				</P>
			</SubSection>

			<SubSection title="7. Game mode">
				<P>
					Click <InlineCode>Start Game</InlineCode> in the menu bar. Each
					round picks a site from a game definition file and generates
					required waypoints. Place waypoints that connect the required
					markers, then finish the path. The app simulates both your route
					and an AI-optimised route, awarding scores out of 1000 per round.
					Complete all rounds for a final scorecard.
				</P>
				<P>
					Game definitions live in <InlineCode>backend/data/games/*.json</InlineCode>{" "}
					and are listed by <InlineCode>GET /api/sites/games</InlineCode>.
				</P>
			</SubSection>
		</Section>
	);
}
