

import { GridCell, SimulationConfig, PhysicsParams, OceanStreamline, StreamlinePoint, OceanImpact, OceanDiagnosticLog } from '../../types';

interface Agent {
  id: number;
  active: boolean;
  x: number; // Float grid coordinate
  y: number; // Float grid coordinate
  vx: number;
  vy: number;
  strength: number;
  age: number;
  type: 'ECC' | 'EC_N' | 'EC_S';
  hasTriggeredImpact?: boolean; // For ECC to avoid multiple triggers
}

interface ImpactPointTemp {
  x: number;
  y: number;
  lat: number;
  lon: number;
}

export const computeOceanCurrents = (
  grid: GridCell[],
  itczLines: number[][],
  phys: PhysicsParams,
  config: SimulationConfig
): { streamlines: OceanStreamline[][], impacts: OceanImpact[][], diagnostics: OceanDiagnosticLog[] } => {
  const streamlinesByMonth: OceanStreamline[][] = [];
  const impactsByMonth: OceanImpact[][] = [];
  const diagnostics: OceanDiagnosticLog[] = [];
  const targetMonths = [0, 6]; // Jan and Jul
  
  const rows = config.resolutionLat;
  const cols = config.resolutionLon;
  
  // Helpers
  const getIdx = (c: number, r: number) => {
    let cc = ((c % cols) + cols) % cols;
    let rr = Math.max(0, Math.min(rows - 1, r));
    return Math.floor(rr) * cols + Math.floor(cc);
  };
  
  const getLatFromRow = (r: number) => 90 - (r / (rows - 1)) * 180;
  const getRowFromLat = (lat: number) => (90 - lat) / 180 * (rows - 1);
  const getLonFromCol = (c: number) => -180 + (c / cols) * 360;

  // --- STEP 2.0: Generate Collision Field ---
  // Same logic as before: Buffered distance map + Smoothing
  
  let collisionField = new Float32Array(rows * cols);
  for(let i=0; i<grid.length; i++) {
      collisionField[i] = grid[i].distCoast + phys.oceanCollisionBuffer;
  }

  // Smooth Field
  for(let iter=0; iter<phys.oceanSmoothing; iter++) {
      const nextField = new Float32Array(rows * cols);
      for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
              let sum = 0;
              let count = 0;
              for(let dr=-1; dr<=1; dr++) {
                  for(let dc=-1; dc<=1; dc++) {
                      const nr = Math.min(Math.max(r+dr, 0), rows-1);
                      const nc = ((c+dc) % cols + cols) % cols;
                      sum += collisionField[nr*cols + nc];
                      count++;
                  }
              }
              nextField[r*cols + c] = sum / count;
          }
      }
      collisionField = nextField;
  }

  // Store for Visualization
  for(let i=0; i<grid.length; i++) {
      grid[i].collisionMask = collisionField[i];
  }
  
  // Compute Gradients
  const distGradX = new Float32Array(rows * cols);
  const distGradY = new Float32Array(rows * cols);
  
  for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
          const idx = r*cols + c;
          const idxLeft = getIdx(c-1, r);
          const idxRight = getIdx(c+1, r);
          const idxUp = getIdx(c, r-1);
          const idxDown = getIdx(c, r+1);
          
          distGradX[idx] = (collisionField[idxRight] - collisionField[idxLeft]) * 0.5;
          distGradY[idx] = (collisionField[idxDown] - collisionField[idxUp]) * 0.5; 
      }
  }

  const getEnvironment = (x: number, y: number) => {
      const c = Math.floor(x);
      const r = Math.floor(y);
      const fx = x - c;
      const fy = y - r;
      
      const idx00 = getIdx(c, r);
      const idx10 = getIdx(c+1, r);
      const idx01 = getIdx(c, r+1);
      const idx11 = getIdx(c+1, r+1);
      
      const interpolate = (v00: number, v10: number, v01: number, v11: number) => 
        v00*(1-fx)*(1-fy) + v10*fx*(1-fy) + v01*(1-fx)*fy + v11*fx*fy;

      return { 
          dist: interpolate(collisionField[idx00], collisionField[idx10], collisionField[idx01], collisionField[idx11]),
          gx: interpolate(distGradX[idx00], distGradX[idx10], distGradX[idx01], distGradX[idx11]),
          gy: interpolate(distGradY[idx00], distGradY[idx10], distGradY[idx01], distGradY[idx11])
      };
  };

  // --- Simulation Loop ---

  for (const m of targetMonths) {
    const itcz = itczLines[m];
    const finishedLines: OceanStreamline[] = [];
    const impactResults: OceanImpact[] = [];
    const impactPointsTemp: ImpactPointTemp[] = [];
    
    // ** Spatial Pruning Grid **
    const flowGridU = new Float32Array(rows * cols).fill(0);
    const flowGridV = new Float32Array(rows * cols).fill(0);
    const flowGridCount = new Uint8Array(rows * cols).fill(0);

    const updateAndCheckPruning = (x: number, y: number, vx: number, vy: number): boolean => {
        const idx = getIdx(Math.round(x), Math.round(y));
        const count = flowGridCount[idx];
        
        if (count === 0) {
            flowGridU[idx] = vx;
            flowGridV[idx] = vy;
            flowGridCount[idx] = 1;
            return false; 
        }

        const ex = flowGridU[idx];
        const ey = flowGridV[idx];
        const dot = vx * ex + vy * ey;
        const len1 = Math.sqrt(vx*vx + vy*vy);
        const len2 = Math.sqrt(ex*ex + ey*ey);
        const sim = dot / (len1 * len2 + 0.0001);

        if (sim > 0.9) return true; 
        return false;
    };

    // --- PASS 1: Equatorial Counter Current (ECC) ---
    
    let eccAgents: Agent[] = [];
    let nextAgentId = 0;
    const gapFillInterval = Math.floor(cols / 64); 

    for (let c = 0; c < cols; c++) {
      const itczLat = itcz[c];
      const r = getRowFromLat(itczLat);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      
      // Spawn in safe zone
      if (env.dist > -50) continue; 

      const westIdx = getIdx(c - 1, Math.round(r));
      const westIsWall = collisionField[westIdx] > 0;

      let shouldSpawn = false;
      if (westIsWall) shouldSpawn = true;
      else if (c % gapFillInterval === 0) shouldSpawn = true;

      if (shouldSpawn) {
          eccAgents.push({
              id: nextAgentId++,
              active: true,
              x: c,
              y: r,
              vx: phys.oceanBaseSpeed, 
              vy: 0.0,
              strength: 2.0,
              age: 0,
              type: 'ECC'
          });
      }
    }

    const MAX_STEPS = phys.oceanStreamlineSteps;
    const DT = 0.5; 
    
    let agentPoints: StreamlinePoint[][] = eccAgents.map(a => [{
        x: a.x, y: a.y,
        lon: getLonFromCol(a.x),
        lat: getLatFromRow(a.y),
        vx: a.vx, vy: a.vy
    }]);

    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = eccAgents.filter(a => a.active);
        if (activeAgents.length === 0) break;

        for (const agent of activeAgents) {
            agent.age++;
            const { dist, gx, gy } = getEnvironment(agent.x, agent.y);
            
            if (agent.age > 10) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false;
                     continue; 
                 }
            }

            // Physics
            const baseAx = phys.oceanBaseSpeed * 0.05; 
            const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
            const targetLat = itcz[lonIdx];
            const targetY = getRowFromLat(targetLat);
            const distY = targetY - agent.y;
            const ayItcz = distY * phys.oceanPatternForce;

            let nvx = agent.vx + baseAx;
            let nvy = agent.vy + ayItcz;
            
            // Wall Sliding
            if (dist > 0) {
                const len = Math.sqrt(gx*gx + gy*gy);
                if (len > 0.0001) {
                    const nx = gx / len;
                    const ny = gy / len;
                    const dot = nvx * nx + nvy * ny;
                    
                    if (dot > 0) {
                        nvx = nvx - dot * nx;
                        nvy = nvy - dot * ny;
                        
                        if (!agent.hasTriggeredImpact) {
                             agent.hasTriggeredImpact = true;
                             const impact = { 
                                 x: agent.x, y: agent.y, 
                                 lat: getLatFromRow(agent.y),
                                 lon: getLonFromCol(agent.x)
                             };
                             impactPointsTemp.push(impact);
                             impactResults.push({...impact, type: 'ECC'});
                        }

                        if (nvx < -0.1) {
                            agent.active = false;
                            continue;
                        }
                    }
                }
                if (dist > 50.0) {
                     if (!agent.hasTriggeredImpact) {
                         agent.hasTriggeredImpact = true;
                         const impact = { 
                             x: agent.x, y: agent.y, 
                             lat: getLatFromRow(agent.y),
                             lon: getLonFromCol(agent.x)
                         };
                         impactPointsTemp.push(impact);
                         impactResults.push({...impact, type: 'ECC'});
                     }
                     agent.active = false;
                     continue;
                }
            }

            const speed = Math.sqrt(nvx*nvx + nvy*nvy);
            const maxSpeed = phys.oceanBaseSpeed * 2.0; 
            if (speed > maxSpeed) {
                nvx = (nvx / speed) * maxSpeed;
                nvy = (nvy / speed) * maxSpeed;
            }

            if (speed < 0.01) {
                agent.active = false;
                continue;
            }

            agent.vx = nvx;
            agent.vy = nvy;
            const nextX = agent.x + agent.vx * DT;
            const nextY = agent.y + agent.vy * DT;
            
            const nextLonIdx = Math.floor(((nextX % cols) + cols) % cols);
            const nextItczLat = itcz[nextLonIdx];
            const nextLat = getLatFromRow(nextY);
            
            if (Math.abs(nextLat - nextItczLat) > phys.oceanDeflectLat) {
                 agent.active = false; 
                 continue; 
            }

            agent.x = nextX;
            agent.y = nextY;
            
            agentPoints[agent.id].push({
                x: nextX, y: nextY,
                lon: getLonFromCol(nextX),
                lat: getLatFromRow(nextY),
                vx: nvx, vy: nvy
            });
        }
    }

    for(const agent of eccAgents) {
        if (agentPoints[agent.id].length > 5) {
            finishedLines.push({ points: agentPoints[agent.id], strength: agent.strength, type: 'main' });
        }
    }

    // --- PASS 2: Equatorial Current (EC) ---
    
    let ecAgents: Agent[] = [];
    nextAgentId = 0; 

    for (const ip of impactPointsTemp) {
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x, y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5,
            vy: -phys.oceanEcPolewardDrift, 
            strength: 2.0, age: 0, type: 'EC_N'
        });
        
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x, y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5,
            vy: phys.oceanEcPolewardDrift,
            strength: 2.0, age: 0, type: 'EC_S'
        });
    }

    const ecSeparation = phys.oceanEcLatGap;

    let ecPoints: StreamlinePoint[][] = ecAgents.map(a => [{
        x: a.x, y: a.y,
        lon: getLonFromCol(a.x),
        lat: getLatFromRow(a.y),
        vx: a.vx, vy: a.vy
    }]);

    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = ecAgents.filter(a => a.active);
        if (activeAgents.length === 0) break;

        for (const agent of activeAgents) {
            agent.age++;
            const { dist, gx, gy } = getEnvironment(agent.x, agent.y);

            // Pruning
            if (agent.age > 10) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false;
                     continue; 
                 }
            }

            // Physics
            let baseAx = -phys.oceanBaseSpeed * 0.05;
            const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
            const baseItczLat = itcz[lonIdx];
            
            let targetLat = baseItczLat;
            if (agent.type === 'EC_N') targetLat += ecSeparation; 
            else targetLat -= ecSeparation; 
            
            const targetY = getRowFromLat(targetLat);
            const errorY = targetY - agent.y; 
            
            const k = phys.oceanEcPatternForce;
            const criticalDamping = 2.0 * Math.sqrt(k);
            let currentDamping = phys.oceanEcDamping;
            
            if (Math.abs(errorY) < 3.0) { 
                 const factor = (3.0 - Math.abs(errorY)) / 3.0; 
                 const targetDamping = Math.max(currentDamping, criticalDamping * 1.5);
                 currentDamping = currentDamping * (1 - factor) + targetDamping * factor;
            }

            const pTerm = errorY * k;
            const dTerm = -agent.vy * currentDamping;
            const ayControl = pTerm + dTerm;
            const currentLat = getLatFromRow(agent.y);
            const latDiff = Math.abs(currentLat - targetLat);
            
            if (dist > -100 && latDiff > 2.5) {
                 baseAx *= 0.1; 
            }

            let nvx = agent.vx + baseAx;
            let nvy = agent.vy + ayControl;

            // Wall Sliding & Impact Detection for EC
            if (dist > 0) {
                const len = Math.sqrt(gx*gx + gy*gy);
                if (len > 0.0001) {
                    const nx = gx / len;
                    const ny = gy / len;
                    const dot = nvx * nx + nvy * ny;
                    if (dot > 0) {
                        nvx = nvx - dot * nx;
                        nvy = nvy - dot * ny;
                        
                        // EC Impact Logic: 
                        // If hitting wall while moving West, record impact
                        if (!agent.hasTriggeredImpact) {
                             agent.hasTriggeredImpact = true;
                             impactResults.push({
                                 x: agent.x, y: agent.y,
                                 lat: getLatFromRow(agent.y),
                                 lon: getLonFromCol(agent.x),
                                 type: 'EC'
                             });
                        }

                        nvx *= 0.99;
                        nvy *= 0.99;
                        
                        if (nvx > 0.1) {
                            agent.active = false;

                            // DIAGNOSTIC: Infant Death Detection
                            // If EC dies very young due to wall collision, it means spawn was bad.
                            if (agent.age < 12) {
                                const currentSpeed = Math.sqrt(nvx*nvx + nvy*nvy);
                                diagnostics.push({
                                    type: 'EC_INFANT_DEATH',
                                    x: agent.x, y: agent.y,
                                    lat: getLatFromRow(agent.y),
                                    lon: getLonFromCol(agent.x),
                                    age: agent.age,
                                    message: `Immediate Wall Collision (Speed=${currentSpeed.toFixed(2)}, Vx=${nvx.toFixed(2)})`
                                });
                            }

                            continue;
                        }
                    }
                }
                if (dist > 50.0) {
                     agent.active = false;
                     // DIAGNOSTIC: Deep Inland Death
                     if (agent.age < 12) {
                        diagnostics.push({
                            type: 'EC_INFANT_DEATH',
                            x: agent.x, y: agent.y,
                            lat: getLatFromRow(agent.y),
                            lon: getLonFromCol(agent.x),
                            age: agent.age,
                            message: `Spawned Deep Inland (Dist=${dist.toFixed(1)})`
                        });
                    }
                     continue;
                }
            }
            
            const speed = Math.sqrt(nvx*nvx + nvy*nvy);
            const maxSpeed = phys.oceanBaseSpeed * 2.0;
            if (speed > maxSpeed) {
                nvx = (nvx / speed) * maxSpeed;
                nvy = (nvy / speed) * maxSpeed;
            }
            if (speed < 0.001) {
                agent.active = false;
                continue;
            }

            agent.vx = nvx;
            agent.vy = nvy;
            const nextX = agent.x + agent.vx * DT;
            const nextY = agent.y + agent.vy * DT;
            const nextLat = getLatFromRow(nextY);
            if (Math.abs(nextLat) > 85) { agent.active = false; continue; }

            agent.x = nextX;
            agent.y = nextY;
            
            ecPoints[agent.id].push({
                x: nextX, y: nextY,
                lon: getLonFromCol(nextX),
                lat: getLatFromRow(nextY),
                vx: nvx, vy: nvy
            });
        }
    }

    for(const agent of ecAgents) {
        if (ecPoints[agent.id].length > 5) {
            finishedLines.push({ points: ecPoints[agent.id], strength: agent.strength, type: agent.type === 'EC_N' ? 'split_n' : 'split_s' });
        }
    }

    streamlinesByMonth[m] = finishedLines;
    impactsByMonth[m] = impactResults;
  }
  
  for(let m=0; m<12; m++) {
      if (m!==0 && m!==6) {
          streamlinesByMonth[m] = [];
          impactsByMonth[m] = [];
      }
  }

  return { streamlines: streamlinesByMonth, impacts: impactsByMonth, diagnostics };
};
