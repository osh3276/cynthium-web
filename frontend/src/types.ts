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
	image_data: string;
	value_range: [number, number];
	shape: number[];
	bounds: {
		left: number;
		bottom: number;
		right: number;
		top: number;
	};
	label: string;
	map_type: string;
	height_data?: number[][];
	downsampled_shape?: number[];
	min_elev?: number;
	max_elev?: number;
}

export interface Waypoint {
	x: number;
	y: number;
}

export interface AutopathResult {
	path_xy: number[][];
	total_cost: number;
	expanded: number;
}

export interface AutopathConfig {
	min_slope_deg: number;
	max_slope_deg: number;
	slope_weight: number;
	sun_weight: number;
}
