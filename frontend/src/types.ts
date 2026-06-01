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

export interface ElevationPayload {
	image_data: string; // base64 PNG
	height_data: number[][]; // 2D array
	shape: number[]; // [rows, cols] of cropped raster
	downsampled_shape: number[];
	bounds: {
		left: number;
		bottom: number;
		right: number;
		top: number;
	};
	min_elev: number;
	max_elev: number;
}
