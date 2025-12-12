

import { GridCell, SimulationConfig, PhysicsParams, DebugSimulationData, DebugFrame, DebugAgentSnapshot } from '../../types';

// Duplicate basic interfaces locally to avoid modifying global types too much for a temp file
interface Agent {
  id: number;
  active: boolean;
  x: number; 
  y: number; 
  vx: number;
  vy: number;
  type: 'ECC' | 'EC_N' | 'EC_S';
  age: number;
  stagnationCounter: number;
  lastX: number;
  lastY: number;
}

// Helper duplicated from ocean.ts to ensure independence
const getIdx = (c: number, r: number, cols: number, rows: number) => {
    let cc = ((c % cols) + cols) % cols;
    let rr = Math.max(0, Math.min(rows - 1, r));
    return Math.floor(rr) * cols + Math.floor(cc);
};
const getLatFromRow = (r: number, rows: number) => 90 - (r / (rows - 1)) * 180;
const getRowFromLat = (lat: number, rows: number) => (90 - lat) / 180 * (rows - 1);
const getLonFromCol = (c: number, cols: number) => -180 + (c / cols) * 360;

export const runDebugSimulation = (
  grid: GridCell[],
  itczLine: number[], // Single month ITCZ line (e.g., July)
  phys: PhysicsParams,
  config: SimulationConfig
): DebugSimulationData => {
  const rows = config.resolutionLat;
  const cols = config.resolutionLon;
  const frames: DebugFrame[] = [];

  // 1. Reconstruct Collision Field
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

  // Precompute Gradients
  const distGradX = new Float32Array(rows * cols);
  const distGradY = new Float32Array(rows * cols);
  for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
          const idx = r*cols + c;
          const idxLeft = getIdx(c-1, r, cols, rows);
          const idxRight = getIdx(c+1, r, cols, rows);
          const idxUp = getIdx(c, r-1, cols, rows);
          const idxDown = getIdx(c, r+1, cols, rows);
          distGradX[idx] = (collisionField[idxRight] - collisionField[idxLeft]) * 0.5;
          distGradY[idx] = (collisionField[idxDown] - collisionField[idxUp]) * 0.5; 
      }
  }

  const getEnvironment = (x: number, y: number) => {
      const c = Math.floor(x);
      const r = Math.floor(y);
      const fx = x - c;
      const fy = y - r;
      
      const idx00 = getIdx(c, r, cols, rows);
      const idx10 = getIdx(c+1, r, cols, rows);
      const idx01 = getIdx(c, r+1, cols, rows);
      const idx11 = getIdx(c+1, r+1, cols, rows);
      
      const interpolate = (v00: number, v10: number, v01: number, v11: number) => 
        v00*(1-fx)*(1-fy) + v10*fx*(1-fy) + v01*(1-fx)*fy + v11*fx*fy;

      return { 
          dist: interpolate(collisionField[idx00], collisionField[idx10], collisionField[idx01], collisionField[idx11]),
          gx: interpolate(distGradX[idx00], distGradX[idx10], distGradX[idx01], distGradX[idx11]),
          gy: interpolate(distGradY[idx00], distGradY[idx10], distGradY[idx01], distGradY[idx11])
      };
  };

  const findSafeSpawnX = (startX: number, y: number): number => {
      const maxSearch = 40; 
      let currX = startX;
      for(let i=0; i<maxSearch; i++) {
          const env = getEnvironment(currX, y);
          if (env.dist < -10.0) return currX - 1.0; 
          currX -= 0.5;
      }
      return startX - 10.0; 
  };

  // --- Agents Setup ---
  let agents: Agent[] = [];
  let nextAgentId = 0;
  const gapFillInterval = Math.floor(cols / 64); 

  // Initialize ECC Agents
  for (let c = 0; c < cols; c++) {
      const itczLat = itczLine[c];
      const r = getRowFromLat(itczLat, rows);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      if (env.dist > -20) continue; 

      const westIdx = getIdx(c - 1, Math.round(r), cols, rows);
      const westIsWall = collisionField[westIdx] > 0;
      let shouldSpawn = false;
      if (westIsWall) shouldSpawn = true;
      else if (c % gapFillInterval === 0) shouldSpawn = true;

      if (shouldSpawn) {
          agents.push({
              id: nextAgentId++, active: true, x: c, y: r, vx: phys.oceanBaseSpeed, vy: 0.0, 
              type: 'ECC', age: 0, stagnationCounter: 0, lastX: c, lastY: r
          });
      }
  }

  const MAX_STEPS = phys.oceanStreamlineSteps; // e.g. 500
  const SUB_STEPS = 10;
  const TOTAL_DT = 0.5; 
  const DT = TOTAL_DT / SUB_STEPS;
  
  // To handle Pass 2 (EC), we need to spawn them dynamically when ECC hits land.
  // We'll manage a unified list or process them in sequence. 
  // For debugging, a unified "Frame" approach is better, but physics logic is sequential in original code.
  // To visualize "Agents dying and spawning new ones", we will execute ECC first, record impacts, then spawn ECs.
  // BUT, to show them "playing out", we can simulate them all. 
  // However, EC depends on ECC impact points. 
  // Let's run ECC fully first, collecting spawn points, then run EC.
  // Then we "merge" the frames or just append EC frames after ECC? 
  // The user wants to see "The full process". 
  // Ideally: ECC runs -> hits wall -> EC spawns *immediately* in the visualizer?
  // Or just show ECC phase then EC phase. Let's do Phase 1 then Phase 2 appended.

  const allEcSpawns: {x:number, y:number}[] = [];

  // --- PHASE 1: ECC ---
  
  for(let step=0; step<MAX_STEPS; step++) {
      const frameSnapshot: DebugAgentSnapshot[] = [];
      const ecSpawns: {x:number, y:number}[] = [];

      for(const agent of agents) {
          if (!agent.active) continue;
          
          let causeOfDeath: string | undefined = undefined;
          let state: 'active' | 'dead' | 'stuck' | 'impact' = 'active';

          // Stagnation Check
          const moveDist = Math.abs(agent.x - agent.lastX) + Math.abs(agent.y - agent.lastY);
          if (moveDist < 0.05 * TOTAL_DT) agent.stagnationCounter++;
          else agent.stagnationCounter = 0;
          
          agent.lastX = agent.x;
          agent.lastY = agent.y;

          if (agent.stagnationCounter > 20) {
              causeOfDeath = "Stagnation (Low Velocity)";
              state = 'stuck';
              agent.active = false;
          }

          if (agent.active) {
            for(let ss=0; ss<SUB_STEPS; ss++) {
                // Physics (Duplicate of ocean.ts)
                const baseAx = phys.oceanBaseSpeed * 0.05; 
                const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                const targetLat = itczLine[lonIdx];
                const targetY = getRowFromLat(targetLat, rows);
                const distY = targetY - agent.y;
                const ayItcz = distY * phys.oceanPatternForce;

                let nvx = agent.vx + baseAx;
                let nvy = agent.vy + ayItcz;
                const nextX = agent.x + nvx * DT;
                const nextY = agent.y + nvy * DT;

                const { dist: distOld } = getEnvironment(agent.x, agent.y);
                const { dist: distNew, gx, gy } = getEnvironment(nextX, nextY);

                if (distNew > 0 && distOld <= 0) {
                    // Impact Logic
                    let tLow = 0, tHigh = 1;
                    let hitX = agent.x, hitY = agent.y;
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
                    
                    if (vDotN > 0.05) {
                        // Hard Impact
                        state = 'impact';
                        causeOfDeath = "Coastal Impact";
                        agent.active = false;
                        
                        // Queue EC Spawn
                        const safeSpawnX = findSafeSpawnX(hitX, hitY);
                        ecSpawns.push({ x: safeSpawnX, y: hitY });
                        break; 
                    } else {
                        // Slide
                        nvx = nvx - vDotN * nx;
                        nvy = nvy - vDotN * ny;
                        const epsilon = 0.1;
                        agent.x = hitX - nx * epsilon;
                        agent.y = hitY - ny * epsilon;
                    }
                } else if (distNew > 0) {
                     // Recovery
                    const gradLen = Math.sqrt(gx*gx + gy*gy);
                    if (gradLen > 0.0001) {
                        const nx = gx / gradLen;
                        const ny = gy / gradLen;
                        const pushFactor = distNew + 0.1; 
                        agent.x -= nx * pushFactor;
                        agent.y -= ny * pushFactor;
                    }
                } else {
                    agent.x = nextX;
                    agent.y = nextY;
                }

                // Speed Limit
                const speed = Math.sqrt(nvx*nvx + nvy*nvy);
                const maxSpeed = phys.oceanBaseSpeed * 2.5; 
                if (speed > maxSpeed) { nvx = (nvx/speed)*maxSpeed; nvy = (nvy/speed)*maxSpeed; }
                if (speed < 0.01) {
                     state = 'stuck'; causeOfDeath = "Zero Velocity"; agent.active = false; break;
                }
                agent.vx = nvx; agent.vy = nvy;
                
                const nextLat = getLatFromRow(agent.y, rows);
                if (Math.abs(nextLat - itczLine[lonIdx]) > phys.oceanDeflectLat * 1.5) {
                     state = 'dead'; causeOfDeath = "Deflected too far"; agent.active = false; break; 
                }
            }
          }

          frameSnapshot.push({
              id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
              state, cause: causeOfDeath
          });
      }

      // Add Spawns to the NEXT batch of agents (actually we queue them for Phase 2)
      // But to visualize them, we will add them to a separate list for Phase 2
      if (ecSpawns.length > 0) {
           // We can't easily mix phases in one loop if we want to follow the algorithm strictly.
           // So we just collect spawns.
           for(const s of ecSpawns) {
                // We'll spawn these in Phase 2
                // Store them in a static list? 
                // Using a closure variable `allEcSpawns`
                allEcSpawns.push(s);
           }
      }

      frames.push({ step, agents: frameSnapshot });
      if (agents.filter(a => a.active).length === 0) break;
  }
  
  // Retroactively collect spawns from frames to be sure (since logic above pushes to allEcSpawns)
  // Actually, the loop above pushed to `ecSpawns` then `allEcSpawns`.
  
  // --- PHASE 2: EC ---
  // Clear agents, load EC agents
  agents = [];
  // nextAgentId continues incrementing
  
  for(const sp of allEcSpawns) {
      agents.push({
          id: nextAgentId++, active: true, x: sp.x, y: sp.y,
          vx: -phys.oceanBaseSpeed * 0.5, vy: -phys.oceanEcPolewardDrift,
          type: 'EC_N', age: 0, stagnationCounter: 0, lastX: sp.x, lastY: sp.y
      });
      agents.push({
          id: nextAgentId++, active: true, x: sp.x, y: sp.y,
          vx: -phys.oceanBaseSpeed * 0.5, vy: phys.oceanEcPolewardDrift,
          type: 'EC_S', age: 0, stagnationCounter: 0, lastX: sp.x, lastY: sp.y
      });
  }

  const startStepPhase2 = frames.length;
  
  for(let step=0; step<MAX_STEPS; step++) {
      const frameSnapshot: DebugAgentSnapshot[] = [];
      const globalStep = startStepPhase2 + step;
      const ecSeparation = phys.oceanEcLatGap;

      for(const agent of agents) {
          if (!agent.active) continue;
          let causeOfDeath: string | undefined = undefined;
          let state: 'active' | 'dead' | 'stuck' | 'impact' = 'active';

           // Stagnation Check
          const moveDist = Math.abs(agent.x - agent.lastX) + Math.abs(agent.y - agent.lastY);
          if (moveDist < 0.05 * TOTAL_DT) agent.stagnationCounter++;
          else agent.stagnationCounter = 0;
          agent.lastX = agent.x; agent.lastY = agent.y;
          if (agent.stagnationCounter > 20) {
              causeOfDeath = "Stagnation"; state = 'stuck'; agent.active = false;
          }

          if (agent.active) {
            for(let ss=0; ss<SUB_STEPS; ss++) {
                // Physics EC
                let baseAx = -phys.oceanBaseSpeed * 0.05;
                const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                const baseItczLat = itczLine[lonIdx];
                let targetLat = baseItczLat;
                if (agent.type === 'EC_N') targetLat += ecSeparation; else targetLat -= ecSeparation; 
                
                const targetY = getRowFromLat(targetLat, rows);
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

                if (distNew > -50) { 
                    const gradLen = Math.sqrt(gx*gx + gy*gy);
                    if (gradLen > 0.0001) {
                        const nx = gx / gradLen; const ny = gy / gradLen;
                        const repulsion = 0.8 * (1.0 - (distNew / -50)); 
                        nvx -= nx * repulsion; nvy -= ny * repulsion;
                    }
                }

                if (distNew > 0 && distOld <= 0) {
                    // Collision EC
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
                    
                    if (vDotN > 0.05) {
                         // Hard Impact (EC death or turn) - usually just slide or die if hit hard
                         // For EC, hitting West coast means arrival.
                         state = 'dead';
                         causeOfDeath = "West Coast Arrival";
                         agent.active = false;
                         break;
                    } else {
                        nvx = nvx - vDotN * nx; nvy = nvy - vDotN * ny;
                        agent.x = hitX - nx * 0.1; agent.y = hitY - ny * 0.1;
                    }
                } else if (distNew > 0) {
                    const gradLen = Math.sqrt(gx*gx + gy*gy);
                    if (gradLen > 0.0001) {
                        const nx = gx / gradLen; const ny = gy / gradLen;
                        const pushOut = distNew + 0.1;
                        agent.x -= nx * pushOut; agent.y -= ny * pushOut;
                    } else {
                        state = 'stuck'; causeOfDeath = "Trapped in Land"; agent.active = false; break;
                    }
                } else {
                     agent.x = nextX; agent.y = nextY;
                }
                
                const speed = Math.sqrt(nvx*nvx + nvy*nvy);
                const maxSpeed = phys.oceanBaseSpeed * 2.0;
                if (speed > maxSpeed) { nvx = (nvx/speed)*maxSpeed; nvy = (nvy/speed)*maxSpeed; }
                if (speed < 0.01) { state = 'stuck'; causeOfDeath = "Zero Velocity"; agent.active = false; break; }

                agent.vx = nvx; agent.vy = nvy;
                if (Math.abs(getLatFromRow(agent.y, rows)) > 85) { 
                    state = 'dead'; causeOfDeath = "Polar Exit"; agent.active = false; break; 
                }
            }
          }

          frameSnapshot.push({
              id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
              state, cause: causeOfDeath
          });
      }
      
      frames.push({ step: globalStep, agents: frameSnapshot });
      if (agents.filter(a => a.active).length === 0) break;
  }

  return {
      frames,
      collisionField,
      width: cols,
      height: rows,
      itczLine
  };
};
