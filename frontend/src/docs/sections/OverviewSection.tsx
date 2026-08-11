import { Section, SubSection, P, InlineCode, Table, CodeBlock, List } from "../primitives";

export function OverviewSection() {
	return (
		<Section id="overview" title="Overview">
			<P>
				Cynthium Web is a browser-based lunar rover route planning and
				simulation tool for sites around the Moon's south pole. A FastAPI
				backend serves pre-processed terrain rasters and runs pathfinding
				and physics simulation; a React frontend provides the 2D/3D
				planning interface.
			</P>

			<SubSection title="Features">
				<List
					items={[
						<>2D and 3D map views: a Canvas 2D map for waypoint editing plus a Three.js 3D terrain view.</>,
						<>Pre-processed per-site rasters: elevation, slope, hillshade, solar illumination, meteor flux, and temperature loaded from <InlineCode>.npy</InlineCode> files.</>,
						<>A* autodesign over a weighted cost raster, validated by a full physics simulation with retries.</>,
						<>Physics-based rover simulation with a PID speed controller, battery drain, traction limits, and solar energy accumulation.</>,
						<>0-1000 traversal score with an S/A/B/C/D/F letter grade and per-category sub-scores.</>,
						<>SPICE-based sun azimuth/elevation for any UTC date at the site centre.</>,
						<>Curiosity and Artemis SR rover presets plus fully custom rover configuration.</>,
						<>Game mode where you compete against the AI across multiple rounds.</>,
						<>Failure markers: if a traverse fails, a red marker appears at the exact failure point with a text reason.</>,
					]}
				/>
			</SubSection>

			<SubSection title="Architecture">
				<P>The application is split into a FastAPI backend and a React frontend.</P>
				<Table
					headers={["Package / Directory", "Responsibility"]}
					rows={[
						[<InlineCode>app.api</InlineCode>, "REST routes: sites, site maps, autodesign, simulate, games."],
						[<InlineCode>app.services</InlineCode>, "Core algorithms: pathfinding (A*), rover simulation, scoring, sun position (SPICE), site raster loading and PNG generation."],
						[<InlineCode>app.core</InlineCode>, "Application configuration (pydantic settings)."],
						[<InlineCode>frontend/src/components</InlineCode>, "React UI: 2D map, 3D terrain, sidebar panels, dialogs."],
						[<InlineCode>frontend/src/game</InlineCode>, "Game mode state machine, API calls, rover presets."],
						[<InlineCode>scripts</InlineCode>, "Offline data preprocessing: GeoTIFFs to per-site .npy rasters (run locally, not on Vercel)."],
					]}
				/>
			</SubSection>

			<SubSection title="Request flow">
				<CodeBlock
					code={`Browser (React SPA)
  /api/sites/{site}/map        -> base64 PNG layer + 3D height data
  /api/sites/{site}/autodesign -> A* path + physics validation
  /api/sites/{site}/simulate   -> physics stats + score + grade
  /api/sites/games             -> game definitions

FastAPI backend
  app.services.site_rasters  -> load .npy, render PNG, hillshade/slope
  app.services.pathfinding   -> A* on cost raster
  app.services.simulation    -> rover physics + scoring
  app.services.sun_position  -> SPICE sun position`}
				/>
				<P>
					During development the frontend proxies <InlineCode>/api/*</InlineCode> to
					the backend. In production Vercel rewrites <InlineCode>/api/*</InlineCode> to
					the deployed backend URL.
				</P>
			</SubSection>
		</Section>
	);
}
