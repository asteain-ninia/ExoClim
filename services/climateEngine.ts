
import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, SimulationResult, PhysicsParams } from '../types';
import { computeCirculation } from './physics/circulation';
import { computeWindBelts } from './physics/windBelts';
import { computeOceanCurrents } from './physics/ocean';
import { computeAirflowDetailed } from './physics/airflow';
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
  for (const cell of grid) {
      // Clear Data
      cell.insolation = new Array(12).fill(0);
      cell.tempZonal = new Array(12).fill(0);
      cell.oceanCurrent = 0;
      cell.temp = new Array(12).fill(0);
      cell.pressure = new Array(12).fill(1013);
      cell.windU = new Array(12).fill(0);
      cell.windV = new Array(12).fill(0);
      cell.uplift = new Array(12).fill(0);
      cell.hadleyCell = new Array(12).fill(0);
      cell.moisture = new Array(12).fill(0);
      cell.precip = new Array(12).fill(0);
      cell.heatMapVal = 0; 
      cell.collisionMask = 0; 
      cell.climateClass = cell.isLand ? '?' : 'Oc';
  }

  await new Promise(r => setTimeout(r, 50));

  // --- Step 1: ITCZ & Circulation ---
  onProgress(20, "Step 1: Calculating ITCZ...", 'step1');
  const circulationRes = computeCirculation(grid, planet, atm, phys, config);
  
  await new Promise(r => setTimeout(r, 50));

  // --- Step 2: Wind Belts ---
  onProgress(40, "Step 2: Calculating Wind Belts...", 'step2');
  const windRes = computeWindBelts(grid, circulationRes, planet, atm, phys, config);
  
  await new Promise(r => setTimeout(r, 50));

  // --- Step 3: Ocean Currents ---
  onProgress(60, "Step 3.0: Ocean Collision Field...", 'step3');
  await new Promise(r => setTimeout(r, 50));
  
  onProgress(80, "Step 3.1: Ocean Currents...", 'step3');
  // Unit G: Pass derived gap for alignment
  const physForOcean = { ...phys, oceanEcLatGap: windRes.oceanEcLatGapDerived };
  const oceanRes = computeOceanCurrents(grid, circulationRes.itczLines, physForOcean, config, planet);

  await new Promise(r => setTimeout(r, 50));

  // --- Step 4: Airflow Detailed ---
  onProgress(95, "Step 4: Refining Airflow...", 'step4');
  computeAirflowDetailed(grid, circulationRes, windRes, oceanRes, planet, atm, phys, config);
  await new Promise(r => setTimeout(r, 50));

  onProgress(100, "Ready", undefined);
  
  return {
      grid,
      globalTemp: 0,
      maxTemp: 0,
      minTemp: 0,
      hadleyWidth: circulationRes.hadleyWidth, 
      cellCount: circulationRes.cellCount,
      itczLats: new Array(12).fill(0), 
      itczLines: circulationRes.itczLines,
      wind: windRes,
      oceanStreamlines: oceanRes.streamlines,
      impactPoints: oceanRes.impacts,
      diagnostics: oceanRes.diagnostics,
      implementationStatus: {
          thermoModel: 'not_implemented',
          hydroModel: 'not_implemented',
          climateClassification: 'not_implemented'
      }
  };
};
