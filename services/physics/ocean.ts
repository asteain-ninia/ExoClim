
import { GridCell, SimulationConfig, PhysicsParams, OceanStreamline, StreamlinePoint, OceanImpact, OceanDiagnosticLog, DebugSimulationData, DebugFrame, DebugAgentSnapshot, PlanetParams } from '../../types';

// Extended Agent Interface for Physics & Debugging
interface Agent {
  id: number;
  active: boolean;
  x: number; // Float grid coordinate
  y: number; // Float grid coordinate
  vx: number;
  vy: number;
  strength: number;
  type: 'ECC' | 'EC_N' | 'EC_S';
  
  // Lifecycle / Debug State
  state: 'active' | 'dead' | 'stuck' | 'impact' | 'crawling';
  cause?: string;
  age: number;
  
  // Stagnation Detection
  history: {x: number, y: number}[]; // Store past positions
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
  config: SimulationConfig,
  planet: PlanetParams,
  debugMonth?: number // Optional: If provided, generates DebugSimulationData for this month
): { streamlines: OceanStreamline[][], impacts: OceanImpact[][], diagnostics: OceanDiagnosticLog[], debugData?: DebugSimulationData } => {
  const streamlinesByMonth: OceanStreamline[][] = [];
  const impactsByMonth: OceanImpact[][] = [];
  const diagnostics: OceanDiagnosticLog[] = [];
  
  // If debugMonth is specified, we focus logic on that month for detailed capture
  const targetMonths = debugMonth !== undefined ? [debugMonth] : [0, 6]; 
  
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
      // Increase buffer slightly to allow smoother sliding
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

  // Store for Visualization (Main App)
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

  const findSafeSpawnX = (startX: number, y: number): number => {
      // Configured offset in km
      const offsetKm = phys.oceanSpawnOffset || 1000.0; 
      
      // Calculate km per cell at this latitude
      const latDeg = getLatFromRow(y);
      const latRad = (latDeg * Math.PI) / 180;
      const planetCircumference = 2 * Math.PI * planet.radius * Math.cos(latRad);
      const kmPerCell = Math.max(0.1, planetCircumference / cols); // Avoid div by zero
      
      // Convert km to cells
      const offsetCells = offsetKm / kmPerCell;
      
      // Backtrack West until safe
      const maxSearch = 60; 
      let currX = startX;
      for(let i=0; i<maxSearch; i++) {
          const env = getEnvironment(currX, y);
          // If we found deep ocean
          if (env.dist < -30.0) return currX - offsetCells; 
          currX -= 1.0;
      }
      return startX - offsetCells;
  };

  // --- Debug Data Holder ---
  let collectedDebugData: DebugSimulationData | undefined = undefined;

  // --- Simulation Loop ---

  for (const m of targetMonths) {
    const isDebugRun = (debugMonth === m);
    const debugFrames: DebugFrame[] = [];
    
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

        if (sim > 0.95) return true; 
        return false;
    };

    // --- Time Stepping Config ---
    const BASE_MAX_STEPS = phys.oceanStreamlineSteps || 500;
    const SUB_STEPS = 10; 
    const TOTAL_DT = 0.5; 
    const DT = TOTAL_DT / SUB_STEPS;
    
    // Stagnation Config
    const HISTORY_SIZE = 12; // Check position from ~12 frames ago
    const STAGNATION_THRESHOLD = 0.3; // Distance in grid cells

    // --- PASS 1: Equatorial Counter Current (ECC) ---
    
    let eccAgents: Agent[] = [];
    let nextAgentId = 0;
    const gapFillInterval = Math.floor(cols / 64); 

    for (let c = 0; c < cols; c++) {
      const itczLat = itcz[c];
      const r = getRowFromLat(itczLat);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      if (env.dist > -20) continue; 

      const westIdx = getIdx(c - 1, Math.round(r));
      const westIsWall = collisionField[westIdx] > 0;

      let shouldSpawn = false;
      if (westIsWall) shouldSpawn = true;
      else if (c % gapFillInterval === 0) shouldSpawn = true;

      if (shouldSpawn) {
          eccAgents.push({
              id: nextAgentId++, active: true, x: c, y: r, vx: phys.oceanBaseSpeed, vy: 0.0, strength: 2.0, type: 'ECC',
              state: 'active', age: 0, 
              history: []
          });
      }
    }
    
    let agentPoints: StreamlinePoint[][] = eccAgents.map(a => [{
        x: a.x, y: a.y, lon: getLonFromCol(a.x), lat: getLatFromRow(a.y), vx: a.vx, vy: a.vy
    }]);

    // ================= ECC LOOP =================
    let stepsUsedECC = 0;
    for (let step = 0; step < BASE_MAX_STEPS; step++) {
        stepsUsedECC++;
        const activeAgents = eccAgents.filter(a => a.active);
        const frameSnapshot: DebugAgentSnapshot[] = [];

        // Early exit: Break immediately if everyone is dead, even in debug mode
        if (activeAgents.length === 0) break;

        for (const agent of eccAgents) {
            if (!agent.active && !isDebugRun) continue; 
            if (!agent.active && isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
                continue;
            }

            // --- Robust Stagnation Check ---
            // Update History
            agent.history.push({ x: agent.x, y: agent.y });
            if (agent.history.length > HISTORY_SIZE) {
                agent.history.shift();
            }

            // Check against historical position
            let isStuck = false;
            if (agent.history.length === HISTORY_SIZE) {
                const oldPos = agent.history[0];
                const dx = Math.abs(agent.x - oldPos.x);
                const dy = Math.abs(agent.y - oldPos.y);
                // Handle wrap-around for X distance
                const dxWrap = Math.min(dx, cols - dx);
                
                const totalDist = dxWrap + dy;
                
                if (totalDist < STAGNATION_THRESHOLD) {
                    isStuck = true;
                }
            }
            
            if (isStuck) {
                 const { dist } = getEnvironment(agent.x, agent.y);
                 
                 // Treat stagnation as impact to ensure continuity of flow
                 agent.active = false; 
                 agent.state = 'impact'; 
                 agent.cause = `Stagnation (Hist: ${HISTORY_SIZE}, Dist: ${dist.toFixed(0)})`;

                 // Register as Impact
                 impactResults.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y), lon: getLonFromCol(agent.x), type: 'ECC' });
                 
                 // Spawn EC from here
                 const safeSpawnX = findSafeSpawnX(agent.x, agent.y);
                 impactPointsTemp.push({ x: safeSpawnX, y: agent.y, lat: getLatFromRow(agent.y), lon: getLonFromCol(safeSpawnX) });
                 
                 if (agent.type === 'ECC') {
                     diagnostics.push({ 
                         type: 'ECC_STUCK', 
                         x: agent.x, y: agent.y, 
                         lat: getLatFromRow(agent.y), 
                         lon: getLonFromCol(agent.x), 
                         age: agent.age, 
                         message: `ECC Stagnated at Dist ${dist.toFixed(1)} -> Triggered Impact Logic` 
                     });
                 }
                 continue;
            }

            if (agent.active && agentPoints[agent.id].length > 5) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false; agent.state = 'dead'; agent.cause = "Merged/Pruned";
                 }
            }

            if (agent.active) {
                for(let ss=0; ss<SUB_STEPS; ss++) {
                    const baseAx = phys.oceanBaseSpeed * 0.05; 
                    const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                    const targetLat = itcz[lonIdx];
                    const targetY = getRowFromLat(targetLat);
                    const distY = targetY - agent.y;
                    const ayItcz = distY * phys.oceanPatternForce;

                    let nvx = agent.vx + baseAx;
                    let nvy = agent.vy + ayItcz;
                    const nextX = agent.x + nvx * DT;
                    const nextY = agent.y + nvy * DT;

                    const { dist: distOld } = getEnvironment(agent.x, agent.y);
                    const { dist: distNew, gx, gy } = getEnvironment(nextX, nextY);

                    // --- ECC IMPACT CHECK ---
                    if (distNew > 0 && distOld <= 0) {
                        // Impact detected. 
                        let tLow = 0, tHigh = 1; let hitX = agent.x, hitY = agent.y;
                        for(let k=0; k<4; k++) {
                            const tMid = (tLow + tHigh) * 0.5;
                            const mx = agent.x + (nextX - agent.x) * tMid;
                            const my = agent.y + (nextY - agent.y) * tMid;
                            const mEnv = getEnvironment(mx, my);
                            if (mEnv.dist > 0) tHigh = tMid; else tLow = tMid;
                            hitX = mx; hitY = my;
                        }
                        const { gx: hgx, gy: hgy } = getEnvironment(hitX, hitY);
                        const gradLen = Math.sqrt(hgx*hgx + hgy*hgy);
                        const nx = gradLen > 0 ? hgx / gradLen : 0;
                        const ny = gradLen > 0 ? hgy / gradLen : 0;
                        const vDotN = nvx * nx + nvy * ny;

                        const isHeadOn = (nvx > 0 && hgx > -0.2); 

                        if (isHeadOn && vDotN > 0.05) {
                            // Valid Impact
                            impactResults.push({ x: hitX, y: hitY, lat: getLatFromRow(hitY), lon: getLonFromCol(hitX), type: 'ECC' });
                            const safeSpawnX = findSafeSpawnX(hitX, hitY);
                            impactPointsTemp.push({ x: safeSpawnX, y: hitY, lat: getLatFromRow(hitY), lon: getLonFromCol(safeSpawnX) });

                            agent.active = false; agent.state = 'impact'; agent.cause = "Coastal Impact";
                            break; 
                        } else {
                            // Slide
                            nvx = nvx - vDotN * nx; nvy = nvy - vDotN * ny;
                            const epsilon = 0.1;
                            agent.x = hitX - nx * epsilon; agent.y = hitY - ny * epsilon;
                        }
                    } else if (distNew > 0) {
                        // Recovery
                        const gradLen = Math.sqrt(gx*gx + gy*gy);
                        if (gradLen > 0.0001) {
                            const nx = gx / gradLen; const ny = gy / gradLen;
                            const pushFactor = distNew + 0.1; 
                            agent.x -= nx * pushFactor; agent.y -= ny * pushFactor;
                        }
                    } else {
                        agent.x = nextX; agent.y = nextY;
                    }
                    agent.vx = nvx; agent.vy = nvy;
                }
            }
            
            agent.age++;
            if (agent.active && agentPoints[agent.id]) {
                agentPoints[agent.id].push({
                    x: agent.x, y: agent.y, lon: getLonFromCol(agent.x), lat: getLatFromRow(agent.y), vx: agent.vx, vy: agent.vy
                });
            }

            if (isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
            }
        }
        if (isDebugRun) debugFrames.push({ step, agents: frameSnapshot });
        if (eccAgents.every(a => !a.active)) break;
    }

    // Save Streamlines for ECC
    for(const agent of eccAgents) {
        if (agentPoints[agent.id] && agentPoints[agent.id].length > 5) {
            finishedLines.push({ points: agentPoints[agent.id], strength: agent.strength, type: 'main' });
        }
    }

    // --- PASS 2: Equatorial Current (EC) ---
    
    let ecAgents: Agent[] = [];
    
    for (const ip of impactPointsTemp) {
        const spawnSpeed = phys.oceanBaseSpeed * 0.8;
        ecAgents.push({
            id: nextAgentId++, active: true, x: ip.x, y: ip.y,
            vx: 0, vy: -spawnSpeed, strength: 2.0, type: 'EC_N',
            state: 'active', age: 0, history: []
        });
        ecAgents.push({
            id: nextAgentId++, active: true, x: ip.x, y: ip.y,
            vx: 0, vy: spawnSpeed, strength: 2.0, type: 'EC_S',
            state: 'active', age: 0, history: []
        });
    }

    let ecPoints: StreamlinePoint[][] = []; 
    for(const a of ecAgents) {
        ecPoints[a.id] = [{
            x: a.x, y: a.y, lon: getLonFromCol(a.x), lat: getLatFromRow(a.y), vx: a.vx, vy: a.vy
        }];
    }

    const startStepPhase2 = debugFrames.length;
    const stepsRemaining = BASE_MAX_STEPS - stepsUsedECC;
    const MAX_STEPS_EC = BASE_MAX_STEPS + stepsRemaining;

    // ================= EC LOOP =================
    for (let step = 0; step < MAX_STEPS_EC; step++) {
        const activeAgents = ecAgents.filter(a => a.active);
        const frameSnapshot: DebugAgentSnapshot[] = [];

        if (activeAgents.length === 0) break;

        for (const agent of ecAgents) {
            if (!agent.active && !isDebugRun) continue;
            if (!agent.active && isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
                continue;
            }

            if (agentPoints[agent.id] && agentPoints[agent.id].length > 5 && !isDebugRun) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false; agent.state = 'dead'; agent.cause = "Merged/Pruned";
                 }
            }

             // --- Robust Stagnation Check ---
            agent.history.push({ x: agent.x, y: agent.y });
            if (agent.history.length > HISTORY_SIZE) {
                agent.history.shift();
            }

            let isStuck = false;
            if (agent.history.length === HISTORY_SIZE) {
                const oldPos = agent.history[0];
                const dx = Math.abs(agent.x - oldPos.x);
                const dy = Math.abs(agent.y - oldPos.y);
                const dxWrap = Math.min(dx, cols - dx);
                const totalDist = dxWrap + dy;
                
                if (totalDist < STAGNATION_THRESHOLD) {
                    isStuck = true;
                }
            }
            
            if (isStuck) {
                const { dist } = getEnvironment(agent.x, agent.y);
                
                agent.active = false; 
                agent.state = 'impact'; // Treat stagnation as arrival/impact
                agent.cause = `Stagnation (Hist: ${HISTORY_SIZE}, Dist: ${dist.toFixed(0)})`;
                
                // Add to visual impacts
                impactResults.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y), lon: getLonFromCol(agent.x), type: 'EC' });
                continue;
            }

            if (agent.active) {
                for(let ss=0; ss<SUB_STEPS; ss++) {
                    const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                    const baseItczLat = itcz[lonIdx];
                    const ecSeparation = phys.oceanEcLatGap; 
                    
                    let targetLat = baseItczLat;
                    if (agent.type === 'EC_N') targetLat += ecSeparation; 
                    else targetLat -= ecSeparation; 
                    
                    const targetY = getRowFromLat(targetLat);
                    const currentLat = getLatFromRow(agent.y);
                    const latDiff = Math.abs(currentLat - targetLat);

                    const { dist: currentDist, gx: currentGx, gy: currentGy } = getEnvironment(agent.x, agent.y);
                    const isNearCoast = currentDist > -60;
                    const isFarFromTarget = latDiff > 2.0;
                    const isTrappedOnWestCoast = isNearCoast && currentGx > -0.2; 

                    let ax = 0;
                    let ay = 0;

                    if (isTrappedOnWestCoast && isFarFromTarget) {
                        agent.state = 'crawling';
                        const gradLen = Math.sqrt(currentGx*currentGx + currentGy*currentGy);
                        if (gradLen > 0.0001) {
                            const nx = currentGx / gradLen;
                            const ny = currentGy / gradLen;
                            const tx1 = -ny; const ty1 = nx;
                            const tx2 = ny;  const ty2 = -nx;
                            
                            const dy1 = targetY - agent.y;
                            const dot1 = ty1 * (dy1 > 0 ? 1 : -1); 
                            const dot2 = ty2 * (dy1 > 0 ? 1 : -1);
                            
                            const bestTx = dot1 > dot2 ? tx1 : tx2;
                            const bestTy = dot1 > dot2 ? ty1 : ty2;
                            
                            const crawlSpeed = phys.oceanBaseSpeed * 1.2;
                            ax = (bestTx * crawlSpeed - agent.vx) * 0.2; 
                            ay = (bestTy * crawlSpeed - agent.vy) * 0.2;
                            
                            ax -= nx * 0.1; 
                            ay -= ny * 0.1;
                        } else {
                            ay = (targetY - agent.y) * 0.05;
                        }

                    } else {
                        agent.state = 'active'; // Flowing
                        const baseWestwardSpeed = -phys.oceanBaseSpeed * 1.0;
                        ax = (baseWestwardSpeed - agent.vx) * 0.05;

                        const k = phys.oceanEcPatternForce;
                        const errorY = targetY - agent.y;
                        const damping = phys.oceanEcDamping;
                        const ayControl = errorY * k - agent.vy * damping;
                        ay = ayControl;

                        if (isNearCoast) {
                            const gradLen = Math.sqrt(currentGx*currentGx + currentGy*currentGy);
                            if (gradLen > 0.0001) {
                                const nx = currentGx / gradLen;
                                const ny = currentGy / gradLen;
                                const repulseStrength = 0.5 * (1.0 - (currentDist / -60));
                                ax -= nx * repulseStrength;
                                ay -= ny * repulseStrength;
                            }
                        }
                    }

                    let nvx = agent.vx + ax;
                    let nvy = agent.vy + ay;
                    const nextX = agent.x + nvx * DT;
                    const nextY = agent.y + nvy * DT;

                    const { dist: distNew, gx: newGx, gy: newGy } = getEnvironment(nextX, nextY);

                    if (distNew > 0) {
                        const gradLen = Math.sqrt(newGx*newGx + newGy*newGy);
                        const nx = gradLen > 0 ? newGx / gradLen : 0;
                        const ny = gradLen > 0 ? newGy / gradLen : 0;
                        
                        const isArrival = (nvx < -0.1 && nx < -0.2); 

                        if (isArrival) {
                            if (Math.random() < 0.2) { 
                                impactResults.push({ x: nextX, y: nextY, lat: getLatFromRow(nextY), lon: getLonFromCol(nextX), type: 'EC' });
                            }
                            agent.active = false; agent.state = 'dead'; agent.cause = "Arrival (West Coast)";
                            
                            if (agent.age < 20) {
                                diagnostics.push({ type: 'EC_INFANT_DEATH', x: agent.x, y: agent.y, lat: getLatFromRow(agent.y), lon: getLonFromCol(agent.x), age: agent.age, message: "Early Arrival (Check Spawn/Gap)" });
                            }
                            break;
                        } else {
                            const vDotN = nvx * nx + nvy * ny;
                            nvx = nvx - vDotN * nx; 
                            nvy = nvy - vDotN * ny;
                            
                            nvx *= 0.9; nvy *= 0.9;
                            
                            const pushOut = 0.1;
                            agent.x = nextX - nx * pushOut;
                            agent.y = nextY - ny * pushOut;
                            
                            agent.vx = nvx; agent.vy = nvy;
                            continue; 
                        }
                    } else {
                        agent.x = nextX; agent.y = nextY;
                        agent.vx = nvx; agent.vy = nvy;
                    }

                    const speed = Math.sqrt(agent.vx*agent.vx + agent.vy*agent.vy);
                    const maxSpeed = phys.oceanBaseSpeed * 3.0;
                    if (speed > maxSpeed) {
                        agent.vx = (agent.vx / speed) * maxSpeed;
                        agent.vy = (agent.vy / speed) * maxSpeed;
                    }
                    
                    if (Math.abs(getLatFromRow(agent.y)) > 88) {
                        agent.active = false; agent.state = 'dead'; agent.cause = "Polar Exit"; break;
                    }
                }
            }

            agent.age++;
            if (agent.active && ecPoints[agent.id]) {
                ecPoints[agent.id].push({
                    x: agent.x, y: agent.y, lon: getLonFromCol(agent.x), lat: getLatFromRow(agent.y), vx: agent.vx, vy: agent.vy
                });
            }

            if (isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
            }
        }
        
        if (isDebugRun) debugFrames.push({ step: startStepPhase2 + step, agents: frameSnapshot });
        if (ecAgents.every(a => !a.active)) break;
    }

    for(const agent of ecAgents) {
        if (ecPoints[agent.id] && ecPoints[agent.id].length > 5) {
            finishedLines.push({ points: ecPoints[agent.id], strength: agent.strength, type: agent.type === 'EC_N' ? 'split_n' : 'split_s' });
        }
    }

    if (isDebugRun) {
        collectedDebugData = {
            frames: debugFrames,
            collisionField: collisionField,
            width: cols,
            height: rows,
            itczLine: itcz
        };
    }

    streamlinesByMonth[m] = finishedLines;
    impactsByMonth[m] = impactResults;
  }
  
  for(let m=0; m<12; m++) {
      if (!streamlinesByMonth[m]) {
          streamlinesByMonth[m] = [];
          impactsByMonth[m] = [];
      }
  }

  return { streamlines: streamlinesByMonth, impacts: impactsByMonth, diagnostics, debugData: collectedDebugData };
};
