export const MAP_TYPES = [
	"Elevation",
	"Slope",
	"Hillshade",
	"Solar Illumination (yr. avg.)",
	"Solar Illumination (day avg.)",
	"Meteor Flux",
	"Average Temperature",
];

// Scoring constants — must match backend simulation.py values
// Max points per sub-score category (total should sum to 1000)
export const SCORE_MAX_PATH_EFFICIENCY = 150;
export const SCORE_MAX_ENERGY_ECONOMY = 300;
export const SCORE_MAX_ILLUMINATION = 350;
export const SCORE_MAX_METEOR_SAFETY = 50;
export const SCORE_MAX_TRACTION_MATCH = 100;
export const SCORE_MAX_POWER_MATCH = 50;

export const SITE_PRESETS: Record<string, string> = {
	"Haworth": "Haworth_5mpp_surf.tif",
	"Shoemaker": "Shoemaker_5mpp_surf.tif",
	"Amundsen rim": "DM1_5mpp_surf.tif",
	"Nobile rim 2": "DM2_5mpp_surf.tif",
	"Shackleton rim B": "LM1_5mpp_surf.tif",
	"Shoemaker rim A": "LM2_5mpp_surf.tif",
	"Shoemaker rim B": "LM3_5mpp_surf.tif",
	"Shoemaker rim C": "LM4_5mpp_surf.tif",
	"Shoemaker rim D": "LM5_5mpp_surf.tif",
	"Shoemaker rim E": "LM6_5mpp_surf.tif",
	"Faustini rim A": "LM7_5mpp_surf.tif",
	"Shoemaker rim F": "LM8_5mpp_surf.tif",
	"Cabeus exterior wall 1": "NPA_5mpp_surf.tif",
	"Amundsen 1": "NPB_5mpp_surf.tif",
	"Idel'son L crater 1": "NPC_5mpp_surf.tif",
	"Malapert crater 1": "NPD_5mpp_surf.tif",
	"Connecting ridge": "Site01_5mpp_surf.tif",
	"Shackleton rim": "Site04_5mpp_surf.tif",
	"Nobile rim 1": "Site06_5mpp_surf.tif",
	"Peak near Shackleton": "Site07_5mpp_surf.tif",
	"de Gerlache rim": "Site11_5mpp_surf.tif",
	"de Gerlache rim 2": "SL2_5mpp_surf.tif",
	"Leibnitz beta plateau": "Site20_5mpp_surf.tif",
	"Leibnitz beta plateau, extended": "Site20v2_5mpp_surf.tif",
	"Malapert massif": "Site23_5mpp_surf.tif",
	"de Gerlache-Kocher massif": "Site42_5mpp_surf.tif",
};
