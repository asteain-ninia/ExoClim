

import { GridCell, SimulationConfig, PhysicsParams, OceanStreamline, StreamlinePoint, OceanImpact, OceanDiagnosticLog } from '../../types';

interface Agent {
  id: number;
  active: boolean;
  x: number; // Float grid coordinate
  y: number; // Float grid coordinate
  vx: number;
  vy: number;
  strength: number;
  type: 'ECC' | 'EC_N' | 'EC_S';
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
  
  let collisionField = new Float32Array(rows * cols);
  for(let i=0; i<grid.length; i++) {
      // Positive = Land/Wall, Negative = Ocean
      // We add a small buffer inside the physics, but for raw field we keep it close to geometry
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
  
  // Compute Gradients (Point TOWARDS higher values = Land)
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

  // Safe Spawn Search: Raycast Westwards to find open water
  const findSafeSpawnX = (startX: number, y: number): number => {
      const maxSearch = 40; 
      let currX = startX;
      for(let i=0; i<maxSearch; i++) {
          const env = getEnvironment(currX, y);
          // Look for deep water
          if (env.dist < -10.0) {
              return currX - 1.0; 
          }
          currX -= 0.5; // Finer step
      }
      return startX - 10.0; 
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

        if (sim > 0.95) return true; // Stricter pruning
        return false;
    };

    // --- Time Stepping Config ---
    const MAX_STEPS = phys.oceanStreamlineSteps;
    const SUB_STEPS = 10; // High precision sub-stepping
    const TOTAL_DT = 0.5; 
    const DT = TOTAL_DT / SUB_STEPS;

    // --- PASS 1: Equatorial Counter Current (ECC) ---
    
    let eccAgents: Agent[] = [];
    let nextAgentId = 0;
    const gapFillInterval = Math.floor(cols / 64); 

    for (let c = 0; c < cols; c++) {
      const itczLat = itcz[c];
      const r = getRowFromLat(itczLat);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      
      // Strict open water spawn
      if (env.dist > -20) continue; 

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
              type: 'ECC'
          });
      }
    }
    
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
            
            // Pruning
            if (agentPoints[agent.id].length > 5) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false;
                     continue; 
                 }
            }

            let isDead = false;

            for(let ss=0; ss<SUB_STEPS; ss++) {
                // Pre-calc Physics Forces
                const baseAx = phys.oceanBaseSpeed * 0.05; 
                const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                const targetLat = itcz[lonIdx];
                const targetY = getRowFromLat(targetLat);
                const distY = targetY - agent.y;
                const ayItcz = distY * phys.oceanPatternForce;

                // Candidate Velocity
                let nvx = agent.vx + baseAx;
                let nvy = agent.vy + ayItcz;

                // Proposed Position
                const nextX = agent.x + nvx * DT;
                const nextY = agent.y + nvy * DT;

                // --- Improved Collision Detection (Raycast) ---
                const { dist: distOld } = getEnvironment(agent.x, agent.y);
                const { dist: distNew, gx, gy } = getEnvironment(nextX, nextY);

                if (distNew > 0 && distOld <= 0) {
                    // Crossed Boundary!
                    
                    // 1. Binary Search for Intersection Point (Hit)
                    let tLow = 0, tHigh = 1;
                    let hitX = agent.x, hitY = agent.y;
                    
                    for(let k=0; k<4; k++) {
                        const tMid = (tLow + tHigh) * 0.5;
                        const mx = agent.x + (nextX - agent.x) * tMid;
                        const my = agent.y + (nextY - agent.y) * tMid;
                        const mEnv = getEnvironment(mx, my);
                        if (mEnv.dist > 0) tHigh = tMid;
                        else tLow = tMid;
                        hitX = mx; hitY = my;
                    }

                    // 2. Calculate Wall Normal at Hit
                    const { gx: hgx, gy: hgy } = getEnvironment(hitX, hitY);
                    const gradLen = Math.sqrt(hgx*hgx + hgy*hgy);
                    const nx = gradLen > 0 ? hgx / gradLen : 0;
                    const ny = gradLen > 0 ? hgy / gradLen : 0;

                    // 3. Impact Detection
                    // Gradient points INTO wall. Velocity entering wall means dot(v, n) > 0
                    const vDotN = nvx * nx + nvy * ny;
                    
                    if (vDotN > 0.05) {
                        // Hard Impact
                        // Record precise hit point for visualization
                        impactResults.push({
                            x: hitX, 
                            y: hitY,
                            lat: getLatFromRow(hitY),
                            lon: getLonFromCol(hitX),
                            type: 'ECC'
                        });

                        // Calculate Safe Spawn for next pass (Backtrack from hit)
                        const safeSpawnX = findSafeSpawnX(hitX, hitY);
                        impactPointsTemp.push({
                            x: safeSpawnX, 
                            y: hitY,
                            lat: getLatFromRow(hitY),
                            lon: getLonFromCol(safeSpawnX)
                        });

                        agent.active = false;
                        isDead = true;
                        break; 
                    } else {
                        // Glancing Blow / Slide
                        // Project velocity to slide along wall tangent
                        nvx = nvx - vDotN * nx;
                        nvy = nvy - vDotN * ny;
                        
                        // Push slightly out (epsilon) from hit point
                        const epsilon = 0.1;
                        agent.x = hitX - nx * epsilon;
                        agent.y = hitY - ny * epsilon;
                    }
                } else if (distNew > 0) {
                    // Already inside wall (Recovery)
                    const gradLen = Math.sqrt(gx*gx + gy*gy);
                    if (gradLen > 0.0001) {
                        const nx = gx / gradLen;
                        const ny = gy / gradLen;
                        // Soft Push Out
                        const pushFactor = distNew + 0.1; 
                        agent.x -= nx * pushFactor;
                        agent.y -= ny * pushFactor;
                    }
                } else {
                    // Clear path
                    agent.x = nextX;
                    agent.y = nextY;
                }

                // Speed Limit
                const speed = Math.sqrt(nvx*nvx + nvy*nvy);
                const maxSpeed = phys.oceanBaseSpeed * 2.5; 
                if (speed > maxSpeed) {
                    nvx = (nvx / speed) * maxSpeed;
                    nvy = (nvy / speed) * maxSpeed;
                }
                
                if (speed < 0.01) {
                    agent.active = false;
                    isDead = true;
                    break;
                }

                agent.vx = nvx;
                agent.vy = nvy;
                
                // Bounds Check
                const nextLat = getLatFromRow(agent.y);
                if (Math.abs(nextLat - itcz[lonIdx]) > phys.oceanDeflectLat * 1.5) {
                     agent.active = false; 
                     isDead = true;
                     break; 
                }
            }
            
            if (isDead) continue;

            agentPoints[agent.id].push({
                x: agent.x, y: agent.y,
                lon: getLonFromCol(agent.x),
                lat: getLatFromRow(agent.y),
                vx: agent.vx, vy: agent.vy
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
            strength: 2.0, type: 'EC_N'
        });
        
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x, y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5,
            vy: phys.oceanEcPolewardDrift,
            strength: 2.0, type: 'EC_S'
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
            
            if (agentPoints[agent.id] && agentPoints[agent.id].length > 5) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false;
                     continue; 
                 }
            }

            let isDead = false;
            for(let ss=0; ss<SUB_STEPS; ss++) {

                // Physics: Control towards Target Latitude
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

                let nvx = agent.vx + baseAx;
                let nvy = agent.vy + ayControl;

                const { dist: distOld } = getEnvironment(agent.x, agent.y);
                const nextX = agent.x + nvx * DT;
                const nextY = agent.y + nvy * DT;
                const { dist: distNew, gx, gy } = getEnvironment(nextX, nextY);

                // Force Field Repulsion (Soft)
                if (distNew > -50) { 
                    const gradLen = Math.sqrt(gx*gx + gy*gy);
                    if (gradLen > 0.0001) {
                        const nx = gx / gradLen;
                        const ny = gy / gradLen;
                        const repulsion = 0.8 * (1.0 - (distNew / -50)); 
                        nvx -= nx * repulsion;
                        nvy -= ny * repulsion;
                    }
                }

                // Hard Collision
                if (distNew > 0 && distOld <= 0) {
                     // Ray-marching hit detection
                    let tLow = 0, tHigh = 1;
                    let hitX = agent.x, hitY = agent.y;
                    for(let k=0; k<4; k++) {
                        const tMid = (tLow + tHigh) * 0.5;
                        const mx = agent.x + (nextX - agent.x) * tMid;
                        const my = agent.y + (nextY - agent.y) * tMid;
                        const mEnv = getEnvironment(mx, my);
                        if (mEnv.dist > 0) tHigh = tMid;
                        else tLow = tMid;
                        hitX = mx; hitY = my;
                    }

                    const { gx: hgx, gy: hgy } = getEnvironment(hitX, hitY);
                    const gradLen = Math.sqrt(hgx*hgx + hgy*hgy);
                    const nx = gradLen > 0 ? hgx / gradLen : 0;
                    const ny = gradLen > 0 ? hgy / gradLen : 0;
                    
                    const vDotN = nvx * nx + nvy * ny;
                    
                    if (vDotN > 0.05) {
                        // Impact Recording for EC
                        if (Math.random() < 0.1) {
                             impactResults.push({
                                 x: hitX, y: hitY,
                                 lat: getLatFromRow(hitY),
                                 lon: getLonFromCol(hitX),
                                 type: 'EC'
                             });
                        }
                        
                        // Slide with friction
                        nvx = nvx - vDotN * nx;
                        nvy = nvy - vDotN * ny;
                        nvx *= 0.9;
                        nvy *= 0.9;
                        
                        agent.x = hitX - nx * 0.1;
                        agent.y = hitY - ny * 0.1;

                    } else {
                        // Just Slide
                        nvx = nvx - vDotN * nx;
                        nvy = nvy - vDotN * ny;
                        agent.x = hitX - nx * 0.1;
                        agent.y = hitY - ny * 0.1;
                    }
                } else if (distNew > 0) {
                     // Inside recovery
                    const gradLen = Math.sqrt(gx*gx + gy*gy);
                    if (gradLen > 0.0001) {
                        const nx = gx / gradLen;
                        const ny = gy / gradLen;
                        const pushOut = distNew + 0.1;
                        agent.x -= nx * pushOut;
                        agent.y -= ny * pushOut;
                    } else {
                        agent.active = false;
                        isDead = true;
                        break;
                    }
                } else {
                     agent.x = nextX;
                     agent.y = nextY;
                }
                
                const speed = Math.sqrt(nvx*nvx + nvy*nvy);
                const maxSpeed = phys.oceanBaseSpeed * 2.0;
                if (speed > maxSpeed) {
                    nvx = (nvx / speed) * maxSpeed;
                    nvy = (nvy / speed) * maxSpeed;
                }
                
                if (speed < 0.01) {
                    agent.active = false;
                    isDead = true;
                    break;
                }

                agent.vx = nvx;
                agent.vy = nvy;

                if (Math.abs(getLatFromRow(agent.y)) > 85) { 
                    agent.active = false; 
                    isDead = true;
                    break; 
                }
            }
            
            if (isDead) continue;
            
            ecPoints[agent.id].push({
                x: agent.x, y: agent.y,
                lon: getLonFromCol(agent.x),
                lat: getLatFromRow(agent.y),
                vx: agent.vx, vy: agent.vy
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
