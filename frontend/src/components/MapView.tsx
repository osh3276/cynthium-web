import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { MapPayload } from "../types";
import type { LoadStatus } from "../App";

interface Props {
	mapData: MapPayload | null;
	status: LoadStatus;
}

export default function MapView({ mapData, status }: Props) {
	const imgRef = useRef<HTMLImageElement | null>(null);
	const [imgLoaded, setImgLoaded] = useState(false);
	const imgSrc = useRef("");

	useEffect(() => {
		if (status === "loaded" && mapData) {
			const src = `data:image/png;base64,${mapData.image_data}`;
			if (src === imgSrc.current) return;
			imgSrc.current = src;
			setImgLoaded(false);
			const img = new Image();
			img.onload = () => {
				imgRef.current = img;
				setImgLoaded(true);
			};
			img.src = src;
		} else if (status === "loading") {
			imgRef.current = null;
			setImgLoaded(false);
		}
	}, [mapData, status]);

	return (
		<div className="map-view">
			{status === "idle" && (
				<div className="map-placeholder" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
					</svg>
					<span>Select a site and generate map</span>
				</div>
			)}
			{status === "loading" && (
				<div className="map-placeholder" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
					<span>Loading...</span>
				</div>
			)}
			{status === "loaded" && imgLoaded && imgRef.current && (
				<TransformWrapper
					initialScale={1}
					minScale={0.1}
					maxScale={20}
					centerOnInit
					wheel={{ step: 0.015 }}
				>
					{({ state }) => (
						<>
							<TransformComponent
								wrapperStyle={{ width: "100%", height: "100%" }}
								contentStyle={{ width: "auto", height: "auto" }}
							>
								<img
									src={imgSrc.current}
									alt={mapData?.label ?? "Map"}
									style={{ display: "block", maxWidth: "none" }}
									draggable={false}
								/>
							</TransformComponent>
							{mapData && (
								<div className="view-overlay top-left">
									{mapData.label} ({mapData.value_range[0].toFixed(1)} – {mapData.value_range[1].toFixed(1)}) · {state.scale.toFixed(1)}x
								</div>
							)}
						</>
					)}
				</TransformWrapper>
			)}
		</div>
	);
}
