import type { RoverSettings } from "../types";

export const CURIOSITY: RoverSettings = {
	mass_kg: 899.0,
	power_hp: 0.13,
	wheel_friction_coeff: 0.5,
	rolling_resistance_coeff: 0.02,
	battery_capacity_wh: 500.0,
	idle_drain_w: 10.0,
};

export const ARTEMIS_SR: RoverSettings = {
	mass_kg: 530,
	power_hp: 0.72,
	wheel_friction_coeff: 0.7,
	rolling_resistance_coeff: 0.15,
	battery_capacity_wh: 500.0,
	idle_drain_w: 10.0,
};
