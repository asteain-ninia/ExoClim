

import { GridCell, SimulationConfig, PhysicsParams, OceanStreamline, StreamlinePoint } from '../../types';

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

interface ImpactPoint {
  x: number;
  y: number;
  lat: number;
}

export const computeOceanCurrents = (
  grid: GridCell[],
  itczLines: number[][],
  phys: PhysicsParams,
  config: SimulationConfig
): OceanStreamline[][] => {
  const streamlinesByMonth: OceanStreamline[][] = [];
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

  // --- STEP 2.0: Generate Collision Field ---
  // 1. Create Buffered Map
  // distCoast: +Land, -Ocean.
  // We want to shift the wall "outwards" into the ocean by oceanCollisionBuffer.
  // New Wall at: distCoast = -buffer.
  // Effective Distance = distCoast + buffer.
  // Collision > 0. Safe < 0.
  
  let collisionField = new Float32Array(rows * cols);
  for(let i=0; i<grid.length; i++) {
      collisionField[i] = grid[i].distCoast + phys.oceanCollisionBuffer;
  }

  // 2. Smooth Field
  for(let iter=0; iter<phys.oceanSmoothing; iter++) {
      const nextField = new Float32Array(rows * cols);
      for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
              let sum = 0;
              let count = 0;
              // 3x3 Box Blur
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
  
  // 3. Compute Gradients from Smoothed Field
  const distGradX = new Float32Array(rows * cols);
  const distGradY = new Float32Array(rows * cols);
  
  for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
          const idx = r*cols + c;
          const idxLeft = getIdx(c-1, r);
          const idxRight = getIdx(c+1, r);
          const idxUp = getIdx(c, r-1);
          const idxDown = getIdx(c, r+1);
          
          const left = collisionField[idxLeft];
          const right = collisionField[idxRight];
          const up = collisionField[idxUp]; 
          const down = collisionField[idxDown];
          
          distGradX[idx] = (right - left) * 0.5;
          distGradY[idx] = (down - up) * 0.5; 
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
      
      const d00 = collisionField[idx00];
      const d10 = collisionField[idx10];
      const d01 = collisionField[idx01];
      const d11 = collisionField[idx11];
      
      const dist = 
        d00 * (1-fx)*(1-fy) +
        d10 * fx * (1-fy) +
        d01 * (1-fx) * fy +
        d11 * fx * fy;
        
      const gx = 
        distGradX[idx00] * (1-fx)*(1-fy) +
        distGradX[idx10] * fx * (1-fy) +
        distGradX[idx01] * (1-fx) * fy +
        distGradX[idx11] * fx * fy;

      const gy = 
        distGradY[idx00] * (1-fx)*(1-fy) +
        distGradY[idx10] * fx * (1-fy) +
        distGradY[idx01] * (1-fx) * fy +
        distGradY[idx11] * fx * fy;
        
      return { dist, gx, gy };
  };

  for (const m of targetMonths) {
    const itcz = itczLines[m];
    const finishedLines: OceanStreamline[] = [];
    const impactPoints: ImpactPoint[] = [];
    
    // --- PASS 1: Equatorial Counter Current (ECC) ---
    // Flows West -> East (+U)
    // Starts deep ocean, dies at continent.
    
    let eccAgents: Agent[] = [];
    let nextAgentId = 0;
    const gapFillInterval = Math.floor(cols / 24); 

    // Spawn ECC
    for (let c = 0; c < cols; c++) {
      const itczLat = itcz[c];
      const r = getRowFromLat(itczLat);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      
      // Spawn in safe zone (dist < 0)
      if (env.dist > -50) continue; 

      const westIdx = getIdx(c - 1, Math.round(r));
      const westIsWall = collisionField[westIdx] > 0; // Check smoothed wall

      let shouldSpawn = false;
      if (westIsWall) shouldSpawn = true;
      else if (c % gapFillInterval === 0) shouldSpawn = true;

      if (shouldSpawn) {
          eccAgents.push({
              id: nextAgentId++,
              active: true,
              x: c,
              y: r,
              vx: phys.oceanBaseSpeed, // Initial Eastward flow
              vy: 0.0,
              strength: 2.0,
              age: 0,
              type: 'ECC'
          });
      }
    }

    const MAX_STEPS = phys.oceanStreamlineSteps;
    const DT = 0.5; 
    
    // Run ECC Simulation
    let agentPoints: StreamlinePoint[][] = eccAgents.map(a => [{
        x: a.x, y: a.y,
        lon: -180 + (a.x % cols) / cols * 360,
        lat: getLatFromRow(a.y),
        vx: a.vx, vy: a.vy
    }]);

    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = eccAgents.filter(a => a.active);
        if (activeAgents.length === 0) break;

        for (const agent of activeAgents) {
            agent.age++;
            const { dist, gx, gy } = getEnvironment(agent.x, agent.y);
            
            // 1. Eastward Drive
            const baseAx = phys.oceanBaseSpeed * 0.05; 

            // 2. ITCZ Attraction
            const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
            const targetLat = itcz[lonIdx];
            const targetY = getRowFromLat(targetLat);
            const distY = targetY - agent.y;
            const ayItcz = distY * phys.oceanPatternForce;

            let nvx = agent.vx + baseAx;
            let nvy = agent.vy + ayItcz;
            
            // 3. Wall Sliding (Impact Detection)
            // Collision threshold is 0 in the buffered/smoothed field
            if (dist > 0) {
                const len = Math.sqrt(gx*gx + gy*gy);
                if (len > 0.0001) {
                    const nx = gx / len;
                    const ny = gy / len;
                    const dot = nvx * nx + nvy * ny;
                    
                    if (dot > 0) {
                        // Project onto tangent
                        nvx = nvx - dot * nx;
                        nvy = nvy - dot * ny;
                        
                        // ECC IMPACT LOGIC:
                        if (!agent.hasTriggeredImpact) {
                             agent.hasTriggeredImpact = true;
                             impactPoints.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y) });
                        }

                        // If the wall forces us to turn back West (vx < 0), this agent is "done" as an ECC.
                        if (nvx < -0.1) {
                            agent.active = false;
                            continue;
                        }
                    }
                }
                
                // Hard stop deep inside wall
                if (dist > 50.0) {
                     if (!agent.hasTriggeredImpact) {
                         impactPoints.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y) });
                     }
                     agent.active = false;
                     continue;
                }
            }

            // Cap Speed
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
            
            // Boundary / Divergence check
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
                lon: -180 + (nextX % cols) / cols * 360,
                lat: getLatFromRow(nextY),
                vx: nvx, vy: nvy
            });
        }
    }

    // Save ECC Lines
    for(const agent of eccAgents) {
        if (agentPoints[agent.id].length > 5) {
            finishedLines.push({ points: agentPoints[agent.id], strength: agent.strength, type: 'main' });
        }
    }

    // --- PASS 2: Equatorial Current (EC) ---
    
    let ecAgents: Agent[] = [];
    nextAgentId = 0; 

    for (const ip of impactPoints) {
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x,
            y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5,
            vy: -phys.oceanEcPolewardDrift, 
            strength: 2.0,
            age: 0,
            type: 'EC_N'
        });
        
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x,
            y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5,
            vy: phys.oceanEcPolewardDrift,
            strength: 2.0,
            age: 0,
            type: 'EC_S'
        });
    }

    const ecSeparation = phys.oceanEcLatGap;

    let ecPoints: StreamlinePoint[][] = ecAgents.map(a => [{
        x: a.x, y: a.y,
        lon: -180 + (a.x % cols) / cols * 360,
        lat: getLatFromRow(a.y),
        vx: a.vx, vy: a.vy
    }]);

    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = ecAgents.filter(a => a.active);
        if (activeAgents.length === 0) break;

        for (const agent of activeAgents) {
            agent.age++;
            const { dist, gx, gy } = getEnvironment(agent.x, agent.y);

            // 1. Westward Drive
            let baseAx = -phys.oceanBaseSpeed * 0.05;

            // 2. Attraction to Separated Latitude
            const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
            const baseItczLat = itcz[lonIdx];
            
            let targetLat = baseItczLat;
            if (agent.type === 'EC_N') targetLat += ecSeparation; // North
            else targetLat -= ecSeparation; // South
            
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

            // Coastal Crawl
            const currentLat = getLatFromRow(agent.y);
            const latDiff = Math.abs(currentLat - targetLat);
            
            // "Buffer Crawl": If inside buffer but trying to separate
            if (dist > -100 && latDiff > 2.5) {
                 baseAx *= 0.1; 
            }

            let nvx = agent.vx + baseAx;
            let nvy = agent.vy + ayControl;

            // 3. Wall Sliding
            if (dist > 0) {
                const len = Math.sqrt(gx*gx + gy*gy);
                if (len > 0.0001) {
                    const nx = gx / len;
                    const ny = gy / len;
                    const dot = nvx * nx + nvy * ny;
                    if (dot > 0) {
                        nvx = nvx - dot * nx;
                        nvy = nvy - dot * ny;
                        
                        // Light friction
                        nvx *= 0.99;
                        nvy *= 0.99;
                        
                        if (nvx > 0.1) {
                            agent.active = false;
                            continue;
                        }
                    }
                }
                if (dist > 50.0) {
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
                lon: -180 + (nextX % cols) / cols * 360,
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
  }
  
  for(let m=0; m<12; m++) {
      if (m!==0 && m!==6) streamlinesByMonth[m] = [];
  }

  return streamlinesByMonth;
};