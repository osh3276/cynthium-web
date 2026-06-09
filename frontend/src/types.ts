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
	sun_azimuth?: number;
	sun_elevation?: number;
}

export interface Waypoint {
	x: number;
	y: number;
}

export interface AutodesignResult {
	path_xy: number[][];
	total_cost: number;
	expanded: number;
}

export interface AutodesignConfig {
	slope_weight: number;
	sun_weight: number;
	meteor_weight: number;
	path_mode: "segment" | "direct";
	rover_friction_coeff: number;
}

export interface RoverSettings {
	mass_kg: number;
	power_hp: number;
	wheel_friction_coeff: number;
	rolling_resistance_coeff: number;
}

export interface TraversalSubscores {
	path_efficiency: number;
	energy_economy: number;
	illumination: number;
	meteor_safety: number;
	rover_traction_match: number;
	rover_power_match: number;
}

export interface TraversalScore {
	traversal_score: number;
	traversal_grade: string;
	traversal_subscores: TraversalSubscores;
}

export interface SimulationStats {
	[key: string]: number | string;
}
