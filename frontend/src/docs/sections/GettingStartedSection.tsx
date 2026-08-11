import { Section, SubSection, P, InlineCode, CodeBlock, Note, Table, List } from "../primitives";

export function GettingStartedSection() {
	return (
		<Section id="getting-started" title="Getting started">
			<SubSection title="Prerequisites">
				<List
					items={[
						<>Python 3.11 or newer for the backend.</>,
						<>Node.js with pnpm for the frontend.</>,
					]}
				/>
			</SubSection>

			<SubSection title="Backend">
				<CodeBlock
					code={`cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload`}
				/>
				<P>
					The API runs at <InlineCode>http://localhost:8000</InlineCode> with interactive
					docs at <InlineCode>http://localhost:8000/docs</InlineCode> (Swagger UI).
					Running <InlineCode>python app/main.py</InlineCode> starts the same app on
					port 5001.
				</P>
			</SubSection>

			<SubSection title="Frontend">
				<CodeBlock
					code={`cd frontend
pnpm install
pnpm dev`}
				/>
				<P>The app runs at <InlineCode>http://localhost:5173</InlineCode>.</P>
				<Note>
					<InlineCode>frontend/vite.config.ts</InlineCode> proxies <InlineCode>/api/*</InlineCode>
					to the backend during development. By default it points at the deployed backend
					(<InlineCode>https://cynthium-server.vercel.app</InlineCode>); to use a local
					backend, uncomment the <InlineCode>http://localhost:8000</InlineCode> target instead.
				</Note>
			</SubSection>

			<SubSection title="Key dependencies">
				<Table
					headers={["Package", "Role"]}
					rows={[
						[<InlineCode>fastapi</InlineCode>, "REST API framework"],
						[<InlineCode>uvicorn</InlineCode>, "ASGI server"],
						[<InlineCode>numpy</InlineCode>, "Raster arrays and numerical computation"],
						[<InlineCode>scipy</InlineCode>, "Zoom/interpolation for raster windows in pathfinding"],
						[<InlineCode>Pillow</InlineCode>, "PNG encoding of map layers"],
						[<InlineCode>pyproj</InlineCode>, "Coordinate transformations (site centre to lon/lat)"],
						[<InlineCode>affine</InlineCode>, "Affine transforms for pixel / projected coordinate mapping"],
						[<InlineCode>spiceypy</InlineCode>, "NASA SPICE toolkit (sun position)"],
						[<InlineCode>pydantic-settings</InlineCode>, "Backend configuration (app.core.config)"],
						[<InlineCode>react</InlineCode>, "Frontend UI framework"],
						[<InlineCode>three</InlineCode>, "3D terrain rendering"],
						[<InlineCode>vite</InlineCode>, "Dev server and build tooling"],
					]}
				/>
			</SubSection>
		</Section>
	);
}
