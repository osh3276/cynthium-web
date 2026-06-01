import { useCallback, useRef, useState } from "react";
import MapView from "./MapView";
import TerrainView from "./TerrainView";
import type { ElevationPayload } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	elevation: ElevationPayload | null;
	status: LoadStatus;
	errorMsg: string;
}

export default function ViewContainer({ elevation, status }: Props) {
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
				<MapView elevation={elevation} status={status} />
			</div>
			<div className="view-handle" onMouseDown={handleMouseDown} />
			<div className="view-pane" style={{ width: `${100 - splitPos}%` }}>
				<TerrainView elevation={elevation} status={status} />
			</div>
		</div>
	);
}
