

// 1. Inputs: Planet, Orbit, Star
export interface PlanetParams {
  radius: number; // km
  gravity: number; // m/s^2
  rotationPeriod: number; // hours
  obliquity: number; // degrees
  eccentricity: number; // 0 to 1
  semiMajorAxis: number; // AU
  solarLuminosity: number; // relative to Sun
  perihelionAngle: number; // degrees, Angle relative to Vernal Equinox
  isRetrograde: boolean; // Rotation direction
  orbitalPeriod: number; // hours (Year length)
}

// 1-2. Atmosphere & Ocean
export interface AtmosphereParams {
  surfacePressure: number; // bar
  greenhouseFactor: number; 
  albedoLand: number;
  albedoOcean: number;
  albedoIce: number;
  lapseRate: number; // K/km (Standard ~6.5)
  heatCapacityOcean: number; // Relative factor
  meridionalTransport: number; // Heat diffusion efficiency (Watt/K per cell)
}

// 1-3. Physics / Magic Numbers Tuning
export interface PhysicsParams {
  // 1.2 HeatMap
  itczSaturationDist: number; // km
  itczAltitudeLimit: number; // km

  // 1.3 Coefficients
  itczRefPressure: number; // hPa
  itczRefYear: number; // hours
  itczRefDay: number; // hours
  itczInertiaExp: number; // exponent

  // 1.3 Movement Ratios
  itczBaseSeaRatio: number; // 0.0 - 1.0
  itczBaseLandRatio: number; // 0.0 - 1.0

  // 1.4 Smoothing
  itczKernelAngle: number; // degrees
  itczKernelMax: number; // degrees

  // 2.1 Ocean Currents (New)
  oceanShelfAngle: number; // degrees. Angle of incidence to trigger split.
  oceanDeflectLat: number; // degrees. Max deviation from ITCZ. Also determines EC separation (DeflectLat / 2).
  oceanStreamlineSteps: number; // Max steps for a current line
  oceanSplitOffset: number; // Grid cells to jump when splitting
  
  // New Tuning Params
  oceanBaseSpeed: number; // Base flow speed multiplier
  oceanPatternForce: number; // Strength of ITCZ attraction (Spring constant) for ECC
  oceanCoastDist: number; // Distance in km to start repelling from coast
  oceanCoastRepulse: number; // Strength of coastline repulsion
  oceanWestwardAttractionFactor: number; // 0.0 - 1.0. Multiplier for ITCZ attraction when flowing West.
  
  // 2.2 EC Tuning
  oceanEcPatternForce: number; // Attraction force for EC towards separated target latitude (Spring Constant P)
  oceanEcDamping: number; // Damping factor to reduce oscillation (Derivative Gain D)
  oceanEcPolewardDrift: number; // Initial drift speed towards poles after split.
  oceanEcLatGap: number; // Degrees. Separation between ITCZ and EC lines.
  oceanSpawnOffset: number; // km. Distance to spawn EC agents away from the coast impact point.

  // 2.0 Collision Tuning
  oceanCollisionBuffer: number; // km. Distance from coast to trigger collision.
  oceanSmoothing: number; // Iterations. Smoothing steps for collision map.
}

// 1-4. Grid & Map
export interface GridCell {
  lat: number;
  lon: number;
  elevation: number; // meters
  isLand: boolean;
  
  // Step 0: Geography
  distCoast: number; // Distance in km. Negative=Ocean distance from land, Positive=Land distance from ocean. 0=Coast.

  // Step 1: ITCZ
  heatMapVal: number; // -1.0 (Ocean) to +1.0 (Land) for ITCZ calculation

  // Step 2.0: Ocean Collision
  collisionMask: number; // -X (Safe) to +X (Wall). Smoothed distance field.

  // Placeholders for removed logic
  insolation: number[]; 
  tempZonal: number[]; 
  windU: number[]; 
  windV: number[]; 
  pressure: number[]; 
  uplift: number[]; 
  hadleyCell: number[]; 
  oceanCurrent: number; 
  temp: number[]; 
  moisture: number[]; 
  precip: number[]; 
  climateClass: string; 
}

export interface CustomMapData {
  elevation: number[];
  isLand: boolean[];
  width: number;
  height: number;
}

export interface SimulationConfig {
  resolutionLat: number;
  resolutionLon: number;
  startingMap: 'PROCEDURAL' | 'CUSTOM' | 'EARTH' | 'VIRTUAL_CONTINENT'; 
  customMap?: CustomMapData;
  zoom: number; // Map zoom level (1.0 - X.X)
}

export interface StreamlinePoint {
  x: number; // Grid Column (float)
  y: number; // Grid Row (float)
  lon: number;
  lat: number;
  vx: number; // Velocity X for coloring
  vy: number; // Velocity Y for coloring
}

export interface OceanStreamline {
  points: StreamlinePoint[];
  type: 'main' | 'split_n' | 'split_s';
  strength: number; // 0.0 - 1.0 (For thickness/opacity)
}

export interface OceanImpact {
  x: number;
  y: number;
  lat: number;
  lon: number;
  type: 'ECC' | 'EC'; // ECC = Pass 1 (Warm/Eastward), EC = Pass 2 (Cold/Westward)
}

export interface OceanDiagnosticLog {
    type: 'EC_INFANT_DEATH' | 'ECC_STUCK';
    x: number;
    y: number;
    lat: number;
    lon: number;
    age: number;
    message: string;
}

// --- DEBUGGING TYPES ---
export interface DebugAgentSnapshot {
    id: number;
    type: 'ECC' | 'EC_N' | 'EC_S';
    x: number;
    y: number;
    vx: number;
    vy: number;
    state: 'active' | 'dead' | 'stuck' | 'impact' | 'crawling';
    cause?: string;
}

export interface DebugFrame {
    step: number;
    agents: DebugAgentSnapshot[];
}

export interface DebugSimulationData {
    frames: DebugFrame[];
    collisionField: Float32Array;
    width: number;
    height: number;
    itczLine: number[];
}

export interface SimulationResult {
  grid: GridCell[];
  globalTemp: number;
  maxTemp: number;
  minTemp: number;
  hadleyWidth: number;
  cellCount: number; // Number of circulation cells per hemisphere
  itczLats: number[]; 
  itczLines: number[][]; // [Month][LonIndex] -> Lat
  oceanStreamlines: OceanStreamline[][]; // [Month (0=Jan, 6=Jul)][LineIndex]
  impactPoints: OceanImpact[][]; // [Month][ImpactIndex]
  diagnostics: OceanDiagnosticLog[]; // Debug logs from physics engine
  debugData?: DebugSimulationData; // Optional full debug history
}