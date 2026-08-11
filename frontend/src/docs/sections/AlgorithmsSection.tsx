import { Section, SubSection, P, InlineCode, CodeBlock, Table, List } from "../primitives";

export function AlgorithmsSection() {
	return (
		<Section id="algorithms" title="Algorithms">
			<SubSection title="Pathfinding">
				<P>
					Cynthium Web uses A* over a 16-connected grid (8 cardinal + 8
					knight-move directions). There is no line-of-sight shortcutting:
					every step follows a concrete grid edge, so the grade limit is
					enforced on every individual transition. The Euclidean distance to
					the goal is used as the heuristic. The search runs inside a cropped
					window around the start and goal (bounded to about 500k cells),
					with stride downsampling when the window is too large.
				</P>
				<P>
					The cost of a step from cell a to cell b has two components: a base
					cost that integrates a per-cell cost raster along the segment, and
					an uphill grade penalty:
				</P>
				<CodeBlock
					code={`cost(a -> b) = integral(C_cell ds) + w_slope * (theta / theta_max)^2 * ds

C_cell = 1.0 + w_sun * (1.0 - I_norm)^2 + w_flux * F_norm^2

theta = atan((z_b - z_a) / ds_horiz)   (signed; uphill only)
theta_max = max(1.0, atan(mu))          (from rover wheel friction)

I_norm  = normalised solar illumination (0 = dark, 1 = full sun)
F_norm  = normalised meteor flux (0 = low, 1 = high)
w_sun   = sun weight (default 0.3)
w_flux  = meteor weight (default 0.05)
w_slope = slope weight (default 0.3)`}
				/>
				<P>
					Only uphill segments incur a grade penalty; downhill segments add
					no grade cost. Cells with non-finite elevation or slope are given
					a huge cost (1e6) so the path avoids them.
				</P>

				<SubSection title="Simulation validation loop">
					<P>
						The autodesign workflow validates every candidate path with a
						full physics simulation. If a path fails physics, its cells are
						blocked and the pathfinder finds the next-best route. After all
						attempts, the last path is returned together with the simulation
						result so the UI can show the failure point and reason.
					</P>
					<CodeBlock
						code={`for attempt in range(max_attempts):   # default 10
    path = pathfind(start, goal, ...)
    stats = simulate(path, rover, ...)
    if stats["traverse_feasible"]:
        return path
    # Block every cell on the failed path and retry`}
					/>
				</SubSection>
			</SubSection>

			<SubSection title="Simulation">
				<P>
					The simulation models the rover as a point-mass vehicle moving
					along a 3D polyline sampled from the elevation raster. A PID speed
					controller (Kp 8.0, Ki 0.4, Kd 0.6) maps speed error to throttle
					(0-1) or brake deceleration. Lunar gravity is 1.625 m/s^2.
				</P>
				<Table
					headers={["Quantity", "Formula"]}
					rows={[
						["Flat-terrain reference speed", "v_ref = P / (m * g * C_rr), capped at 10 m/s"],
						["Max climbable slope", "theta_max = atan(mu - C_rr)"],
						["Battery energy", "E = integral(P_drive + P_idle) dt"],
						["Solar energy", "E_solar = sum(I * dt)  (J/m^2)"],
					]}
				/>
				<P>
					The traverse is feasible only if the rover reaches the final
					waypoint. Failure conditions:
				</P>
				<List
					items={[
						<>Battery depleted mid-run (<InlineCode>failure_reason = "Battery depleted"</InlineCode>).</>,
						<>Stagnation, reported as "Insufficient traction or power to make progress".</>,
						<>A bisection search over mu computes the minimum wheel friction required for the route; if it exceeds the configured mu, the reason reports the required value.</>,
					]}
				/>
			</SubSection>

			<SubSection title="Scoring">
				<P>
					The traversal score is a weighted sum of six sub-scores, capped to
					0-1000:
				</P>
				<Table
					headers={["Sub-score", "Max points", "Basis"]}
					rows={[
						["Path efficiency", "150", "Displacement / distance travelled"],
						["Energy economy", "300", "Average velocity vs the power-limited reference speed"],
						["Illumination", "350", "0.7 x percent of path illuminated + 0.3 x solar intensity"],
						["Meteor safety", "50", "Linear falloff with average meteor flux (zero above 5000)"],
						["Rover traction match", "100", "Required mu vs configured mu (peak ratio 0.7)"],
						["Rover power match", "50", "Average velocity vs 95% of the reference speed"],
					]}
				/>
				<P>
					An expense penalty subtracts <InlineCode>100 * (power_hp + mu^2 - C_rr^2)</InlineCode>{" "}
					for powerful, high-traction, low-resistance rovers, keeping the
					game balanced. If the traverse is infeasible, the score is
					hard-capped at 0.
				</P>
				<Table
					headers={["Grade", "Score range"]}
					rows={[
						["S", "900 or more"],
						["A", "750 to 899"],
						["B", "600 to 749"],
						["C", "450 to 599"],
						["D", "300 to 449"],
						["F", "Below 300"],
					]}
				/>
			</SubSection>

			<SubSection title="Sun position">
				<P>
					The backend uses NASA SPICE (via <InlineCode>spiceypy</InlineCode>) to
					compute the Sun's azimuth and elevation at a lunar site centre for
					a given UTC date. Kernels are loaded from <InlineCode>backend/data/</InlineCode>:
				</P>
				<Table
					headers={["File", "Role"]}
					rows={[
						[<InlineCode>naif0012.tls</InlineCode>, "Leapseconds kernel (UTC to ET conversion)"],
						[<InlineCode>de432s.bsp</InlineCode>, "Planet and lunar ephemeris"],
						[<InlineCode>moon_pa_de440_200625.bpc</InlineCode>, "High-accuracy lunar orientation (DE440)"],
						[<InlineCode>moon_de440_250416.tf</InlineCode>, "Lunar body-fixed reference frames"],
						[<InlineCode>pck00011.tpc</InlineCode>, "Planetary constants (Moon radii)"],
					]}
				/>
				<P>Workflow: convert UTC to ephemeris time, compute the Sun-to-Moon vector with <InlineCode>spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")</InlineCode>, normalise it, build the local up/east/north basis at the site's selenographic coordinates, and project the Sun vector onto that basis. When a <InlineCode>date</InlineCode> query parameter is supplied to the map endpoint, the resulting <InlineCode>sun_azimuth</InlineCode> and <InlineCode>sun_elevation</InlineCode> are attached to the payload.</P>
			</SubSection>

			<SubSection title="Coordinate systems">
				<Table
					headers={["Space", "Description"]}
					rows={[
						["Pixel (r, c)", "Row/column indices into the NumPy rasters. Used by pathfinding and sampling."],
						["Projected (m)", "Easting/northing in metres on the lunar south polar stereographic projection: +proj=stere +lat_0=-90 +lon_0=0 +k=1 +a=1737400 +b=1737400 +units=m"],
						["Geographic", "Selenographic latitude/longitude on a 1737400 m sphere, used for sun position."],
					]}
				/>
				<P>
					Conversions between pixel and projected space use the affine
					transform stored in each raster's <InlineCode>*_meta.json</InlineCode>.
				</P>
			</SubSection>
		</Section>
	);
}
