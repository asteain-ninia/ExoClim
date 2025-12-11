

import { PlanetParams, AtmosphereParams, SimulationConfig, PhysicsParams } from './types';

export const EARTH_PARAMS: PlanetParams = {
  radius: 6371,
  gravity: 9.81,
  rotationPeriod: 24,
  obliquity: 23.44,
  eccentricity: 0.0167,
  semiMajorAxis: 1.0,
  solarLuminosity: 1.0,
  perihelionAngle: 283.0, // Approx Jan 3 (relative to Vernal Equinox)
  isRetrograde: false, // Prograde by default
  orbitalPeriod: 8760, // 365 * 24
};

export const EARTH_ATMOSPHERE: AtmosphereParams = {
  surfacePressure: 1.0,
  greenhouseFactor: 1.0,
  albedoLand: 0.28,
  albedoOcean: 0.06,
  albedoIce: 0.55,
  lapseRate: 6.5,
  heatCapacityOcean: 1.0,
  meridionalTransport: 35.0,
};

export const DEFAULT_PHYSICS_PARAMS: PhysicsParams = {
  // ITCZ Algorithm Constants
  itczSaturationDist: 2000.0,
  itczAltitudeLimit: 5.0,
  itczRefPressure: 1013.0,
  itczRefYear: 8760.0,
  itczRefDay: 24.0,
  itczInertiaExp: 0.5,
  itczBaseSeaRatio: 0.2,
  itczBaseLandRatio: 0.9,
  itczKernelAngle: 15.0,
  itczKernelMax: 60.0,

  // Ocean Currents
  oceanShelfAngle: 70.0, // Angle of incidence. Larger = Splits more easily (70 means even glancing blows split)
  oceanDeflectLat: 15.0, // degrees. Max deviation from ITCZ. Also determines EC separation (DeflectLat / 2).
  oceanStreamlineSteps: 500, 
  oceanSplitOffset: 3.0,
  
  // New Tuning Params
  oceanBaseSpeed: 1.0,
  oceanPatternForce: 0.1, // Updated default as requested
  oceanCoastDist: 300.0, // km
  oceanCoastRepulse: 0.3,
  oceanWestwardAttractionFactor: 0.05, // Weak attraction when moving West to allow detours
  
  // 2.2 EC Tuning
  oceanEcPatternForce: 0.15, // Attraction force for EC towards separated target latitude (Spring constant P)
  oceanEcDamping: 0.2, // Damping factor (Derivative gain D) to reduce overshoot
  oceanEcPolewardDrift: 1.5, // Initial poleward kick strength
  oceanEcLatGap: 7.5, // Separation between ITCZ and EC lines
  
  // 2.0 Collision Tuning
  oceanCollisionBuffer: 200.0, // km
  oceanSmoothing: 2.0, // iterations
};

// Removed standalone ITCZ_PARAMS to ensure usage of mutable PhysicsParams

export const RESOLUTION_PRESETS = [
    { label: '低解像度 (90x180)', lat: 90, lon: 180 },
    { label: '中解像度 (180x360)', lat: 180, lon: 360 },
    { label: '高解像度 (360x720)', lat: 360, lon: 720 },
];

export const DEFAULT_CONFIG: SimulationConfig = {
  resolutionLat: 180, // Default to Medium for performance
  resolutionLon: 360, 
  startingMap: 'PROCEDURAL',
  zoom: 1.0
};

export const KOPPEN_COLORS: Record<string, string> = {
  // A: Tropical
  'Af': '#0000FF',
  'Am': '#0077FF',
  'Aw': '#44AAFF',
  'As': '#44AAFF',
  
  // B: Arid
  'BWh': '#FF0000',
  'BWk': '#FF99AA',
  'BSh': '#FFAA00',
  'BSk': '#FFDD66',
  
  // C: Temperate
  'Csa': '#FFFF00',
  'Csb': '#C6C600',
  'Csc': '#969600',
  'Cwa': '#AAFF00',
  'Cwb': '#88DD00',
  'Cwc': '#669900',
  'Cfa': '#00FF00',
  'Cfb': '#66FF66',
  'Cfc': '#99FF99',
  
  // D: Continental
  'Dsa': '#FF00FF',
  'Dsb': '#CC00CC',
  'Dsc': '#990099',
  'Dsd': '#660066',
  'Dwa': '#AA00AA',
  'Dwb': '#8800AA',
  'Dwc': '#6600AA',
  'Dwd': '#4400AA',
  'Dfa': '#00AAAA',
  'Dfb': '#55CCCC',
  'Dfc': '#007777',
  'Dfd': '#004444',
  
  // E: Polar
  'ET': '#B2B2B2',
  'EF': '#FFFFFF',
  
  // Special
  'H':  '#78909C',
  'Oc': '#000066',
};

export const CURRENT_COLORS = {
  WARM: '#FF4400',
  COLD: '#0044FF',
  NEUTRAL: '#00000000'
};