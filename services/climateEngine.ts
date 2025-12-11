

import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, SimulationResult, PhysicsParams } from '../types';
import { computeCirculation } from './physics/circulation';
import { computeOceanCurrents } from './physics/ocean';
export { initializeGrid } from './geography';

export const runSimulation = async (
  grid: GridCell[],
  planet: PlanetParams,
  atm: AtmosphereParams,
  phys: PhysicsParams,
  config: SimulationConfig,
  onProgress: (progress: number, label?: string, stepId?: string) => void
): Promise<SimulationResult> => {

  onProgress(10, "Initializing Grid...", 'elevation');
  
  // Step 0: Geography is already set by initializeGrid (passed in as `grid`)
  // We just ensure all other fields are zeroed out or set to defaults.
  const rotationSign = planet.isRetrograde ? -1 : 1;

  for (const cell of grid) {
      // Clear Data
      cell.insolation = new Array(12).fill(0);
      cell.tempZonal = new Array(12).fill(0);
      cell.oceanCurrent = 0;
      cell.temp = new Array(12).fill(0);
      cell.pressure = new Array(12).fill(1013);
      
      // Calculate simple Zonal Wind based on latitude and rotation direction
      // 0-30: Easterlies (-), 30-60: Westerlies (+), 60+: Easterlies (-)
      // If Retrograde, flip sign.
      const latAbs = Math.abs(cell.lat);
      let baseU = 0;
      if (latAbs < 30) baseU = -5;
      else if (latAbs < 60) baseU = 8;
      else baseU = -2;
      
      const u = baseU * rotationSign;

      cell.windU = new Array(12).fill(u);
      cell.windV = new Array(12).fill(0);
      cell.uplift = new Array(12).fill(0);
      cell.hadleyCell = new Array(12).fill(0);
      cell.moisture = new Array(12).fill(0);
      cell.precip = new Array(12).fill(0);
      cell.heatMapVal = 0; // Reset Step 1
      cell.collisionMask = 0; // Reset Step 2.0
      
      // Default Climate Class (Unknown)
      cell.climateClass = cell.isLand ? '?' : 'Oc';
  }

  // Fake delay for UX
  await new Promise(r => setTimeout(r, 50));

  // --- Step 1: ITCZ & Circulation ---
  onProgress(20, "Step 1: Calculating ITCZ...", 'itcz_heatmap');
  const circulationRes = computeCirculation(grid, planet, atm, phys, config);
  
  // Update grid with dummy circulation data for now (removed logic placeholders)
  // But we retain the itczLines for the result
  
  await new Promise(r => setTimeout(r, 50));

  // --- Step 2: Ocean Currents ---
  onProgress(40, "Step 2: Ocean Collision Field...", 'ocean_collision');
  await new Promise(r => setTimeout(r, 50));
  
  onProgress(50, "Step 2.1: Ocean Currents...", 'oceanCurrent');
  const oceanStreamlines = computeOceanCurrents(grid, circulationRes.itczLines, phys, config);

  await new Promise(r => setTimeout(r, 50));

  onProgress(100, "Ready", undefined);
  
  return {
      grid,
      globalTemp: 0,
      maxTemp: 0,
      minTemp: 0,
      hadleyWidth: circulationRes.hadleyWidth, 
      cellCount: circulationRes.cellCount,
      itczLats: new Array(12).fill(0), // Deprecated simple array
      itczLines: circulationRes.itczLines,
      oceanStreamlines: oceanStreamlines
  };
};