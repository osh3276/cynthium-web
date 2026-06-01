export default function TerrainView() {
	return (
		<div className="terrain-view">
			<div className="map-placeholder">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M4 15l4-4 5 5 5-5 2 2" />
					<path d="M2 4v16a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2z" />
				</svg>
				<span>3D Terrain View</span>
			</div>
			<div className="view-overlay top-left">Terrain</div>
		</div>
	);
}
