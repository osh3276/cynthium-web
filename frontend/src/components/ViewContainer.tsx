import { useCallback, useRef, useState } from "react";
import MapView from "./MapView";
import TerrainView from "./TerrainView";
import type { MapPayload, Waypoint, AutodesignResult } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	mapData: MapPayload | null;
	status: LoadStatus;
	waypoints: Waypoint[];
	autodesignResult: AutodesignResult | null;
	onAddWaypoint: (wp: Waypoint) => void;
}

export default function ViewContainer({ mapData, status, waypoints, autodesignResult, onAddWaypoint }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [splitPos, setSplitPos] = useState(50);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			const startX = e.clientX;
			const startPos = splitPos;
			const onMove = (me: MouseEvent) => {
				const rect = containerRef.current?.getBoundingClientRect();
				if (!rect) return;
				const dx = me.clientX - startX;
				const pct = Math.max(10, Math.min(90, startPos + (dx / rect.width) * 100));
				setSplitPos(pct);
			};
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[splitPos],
	);

	return (
		<div ref={containerRef} className="view-container">
			<div className="view-pane" style={{ width: `${splitPos}%` }}>
				<MapView mapData={mapData} status={status} waypoints={waypoints} autodesignResult={autodesignResult} onAddWaypoint={onAddWaypoint} />
			</div>
			<div className="view-handle" onMouseDown={handleMouseDown} />
			<div className="view-pane" style={{ width: `${100 - splitPos}%` }}>
				<TerrainView mapData={mapData} status={status} waypoints={waypoints} autodesignResult={autodesignResult} />
			</div>
		</div>
	);
}
