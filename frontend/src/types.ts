export interface SiteBounds {
	left: number;
	right: number;
	bottom: number;
	top: number;
	width_m: number;
	height_m: number;
	tile_shape: number[];
	tile_res: number[];
}

export interface SiteInfo extends SiteBounds {
	name: string;
}

export interface MapPayload {
	image_data: string; // base64 PNG
	value_range: [number, number]; // [min, max] displayed values
	shape: number[];
	bounds: {
		left: number;
		bottom: number;
		right: number;
		top: number;
	};
	label: string;
	map_type: string;
	// Only present for "Elevation" type
	height_data?: number[][];
	downsampled_shape?: number[];
	min_elev?: number;
	max_elev?: number;
}
