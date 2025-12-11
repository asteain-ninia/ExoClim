

import { GridCell, CustomMapData } from '../types';
import { PriorityQueue } from './utils/PriorityQueue';
import { fbmSphere, ridgeSphere } from './utils/noise';

const toRad = (deg: number) => (deg * Math.PI) / 180;

// --- Earth Statistics Data (5-degree bands) ---
const EARTH_STATS = [
    { lat: -87.5, bins: [0.009136, 0.005815, 0.010033, 0.116746, 0.858269] },
    { lat: -82.5, bins: [0.182381, 0.054400, 0.074232, 0.194747, 0.492565] },
    { lat: -77.5, bins: [0.105328, 0.030922, 0.064255, 0.167538, 0.478696] },
    { lat: -72.5, bins: [0.066211, 0.026735, 0.041187, 0.105193, 0.351210] },
    { lat: -67.5, bins: [0.031472, 0.012559, 0.028720, 0.079115, 0.056712] },
    { lat: -62.5, bins: [0.001042, 0.000928, 0.000742, 0.000542, 0.000014] },
    { lat: -57.5, bins: [0.000577, 0.000235, 0.000088, 0.000001, 0.000000] },
    { lat: -52.5, bins: [0.008500, 0.005344, 0.001909, 0.000576, 0.000029] },
    { lat: -47.5, bins: [0.006720, 0.007734, 0.008397, 0.003197, 0.000090] },
    { lat: -42.5, bins: [0.009831, 0.008563, 0.010758, 0.008184, 0.000046] },
    { lat: -37.5, bins: [0.032157, 0.018558, 0.008091, 0.006136, 0.001342] },
    { lat: -32.5, bins: [0.075449, 0.043259, 0.019907, 0.015779, 0.004317] },
    { lat: -27.5, bins: [0.065395, 0.069657, 0.037809, 0.033558, 0.009961] },
    { lat: -22.5, bins: [0.049050, 0.094212, 0.051427, 0.038900, 0.012486] },
    { lat: -17.5, bins: [0.051153, 0.066741, 0.055849, 0.049413, 0.014746] },
    { lat: -12.5, bins: [0.037755, 0.066506, 0.034395, 0.055945, 0.010383] },
    { lat: -7.5, bins: [0.077269, 0.067036, 0.048390, 0.033348, 0.006208] },
    { lat: -2.5, bins: [0.127284, 0.055370, 0.028120, 0.026203, 0.005908] },
    { lat: 2.5, bins: [0.069399, 0.066868, 0.054080, 0.019938, 0.003743] },
    { lat: 7.5, bins: [0.076775, 0.078565, 0.056015, 0.024192, 0.007546] },
    { lat: 12.5, bins: [0.051216, 0.114230, 0.051100, 0.014747, 0.004682] },
    { lat: 17.5, bins: [0.058799, 0.134731, 0.071279, 0.020531, 0.005816] },
    { lat: 22.5, bins: [0.081182, 0.126006, 0.095200, 0.038894, 0.009185] },
    { lat: 27.5, bins: [0.098845, 0.127138, 0.084591, 0.052514, 0.039378] },
    { lat: 32.5, bins: [0.111337, 0.061413, 0.077413, 0.073114, 0.098636] },
    { lat: 37.5, bins: [0.069925, 0.075435, 0.060837, 0.119961, 0.097831] },
    { lat: 42.5, bins: [0.089671, 0.112500, 0.090149, 0.138303, 0.040349] },
    { lat: 47.5, bins: [0.147069, 0.167387, 0.111808, 0.088747, 0.024053] },
    { lat: 52.5, bins: [0.195211, 0.187629, 0.134505, 0.064310, 0.011058] },
    { lat: 57.5, bins: [0.230437, 0.169657, 0.101665, 0.045804, 0.000871] },
    { lat: 62.5, bins: [0.280279, 0.231287, 0.104468, 0.072484, 0.011983] },
    { lat: 67.5, bins: [0.298780, 0.229438, 0.121484, 0.046157, 0.028845] },
    { lat: 72.5, bins: [0.201980, 0.057586, 0.020519, 0.019809, 0.057262] },
    { lat: 77.5, bins: [0.062937, 0.035822, 0.028418, 0.044103, 0.067972] },
    { lat: 82.5, bins: [0.023247, 0.030204, 0.042001, 0.038523, 0.002930] },
    { lat: 87.5, bins: [0.000000, 0.000000, 0.000000, 0.000000, 0.000000] } 
];

const BIN_RANGES = [
    { min: 0, max: 200 },
    { min: 200, max: 500 },
    { min: 500, max: 1000 },
    { min: 1000, max: 2000 },
    { min: 2000, max: 6000 } 
];

// Helper to interpolate the Earth Stats
const getEarthStats = (lat: number) => {
    let i = 0;
    while (i < EARTH_STATS.length - 1 && EARTH_STATS[i+1].lat < lat) {
        i++;
    }
    const p1 = EARTH_STATS[i];
    const p2 = EARTH_STATS[Math.min(i + 1, EARTH_STATS.length - 1)];
    
    let t = 0;
    if (p2.lat !== p1.lat) {
        t = (lat - p1.lat) / (p2.lat - p1.lat);
    }
    t = Math.max(0, Math.min(1, t));

    const bins = p1.bins.map((val, idx) => val * (1 - t) + p2.bins[idx] * t);
    const landFrac = bins.reduce((a,b) => a+b, 0);

    return { landFrac, bins };
};

const generateProceduralMap = (rows: number, cols: number) => {
    const elevation = new Float32Array(rows * cols);
    const isLand = new Array(rows * cols).fill(false);
    const seed = Math.random() * 10000;
    const rawHeight = new Float32Array(rows * cols);

    for (let r = 0; r < rows; r++) {
        const latDeg = 90 - (r / (rows - 1)) * 180;
        const latRad = toRad(latDeg);
        const cosLat = Math.cos(latRad);
        const sinLat = Math.sin(latRad);

        for (let c = 0; c < cols; c++) {
            const lonDeg = -180 + (c / cols) * 360;
            const lonRad = toRad(lonDeg);
            const nx = cosLat * Math.cos(lonRad);
            const ny = sinLat; 
            const nz = cosLat * Math.sin(lonRad);
            const continents = fbmSphere(nx, ny, nz, 6, seed);
            const mountains = ridgeSphere(nx, ny, nz, 6, seed + 300);
            const qx = fbmSphere(nx, ny, nz, 2, seed + 900);
            const qy = fbmSphere(ny, nz, nx, 2, seed + 901);
            const warp = fbmSphere(nx + qx, ny + qy, nz, 4, seed + 902);
            let h = continents * 0.6 + mountains * 0.3 + warp * 0.1;
            rawHeight[r * cols + c] = h;
        }
    }

    for (let r = 0; r < rows; r++) {
        const lat = 90 - (r / (rows - 1)) * 180;
        const stats = getEarthStats(lat);
        const rowIndices = [];
        for (let c = 0; c < cols; c++) {
            rowIndices.push({ idx: r*cols + c, val: rawHeight[r*cols + c] });
        }
        rowIndices.sort((a,b) => a.val - b.val);

        const seaCount = Math.floor((1 - stats.landFrac) * cols);
        const landCount = cols - seaCount;
        const seaLevelThreshold = seaCount < cols ? rowIndices[seaCount].val : 9999;

        for (let i = 0; i < seaCount; i++) {
            const item = rowIndices[i];
            const idx = item.idx;
            isLand[idx] = false;
            const d = seaLevelThreshold - item.val; 
            elevation[idx] = -10 - Math.pow(Math.max(0, d) * 4.0, 1.2) * 6000;
        }

        if (landCount > 0) {
            let currentBinStartRank = 0;
            for (let b = 0; b < BIN_RANGES.length; b++) {
                const binFracTotal = stats.bins[b]; 
                const binFracLand = (stats.landFrac > 0.0001) ? (binFracTotal / stats.landFrac) : 0;
                const countInBin = Math.floor(binFracLand * landCount);
                const actualCount = (b === BIN_RANGES.length - 1) 
                    ? (landCount - currentBinStartRank) 
                    : countInBin;
                const hMin = BIN_RANGES[b].min;
                const hMax = BIN_RANGES[b].max;

                for (let k = 0; k < actualCount; k++) {
                    const rankInLand = currentBinStartRank + k;
                    if (rankInLand >= landCount) break;
                    const item = rowIndices[seaCount + rankInLand];
                    const idx = item.idx;
                    isLand[idx] = true;
                    const t = k / Math.max(1, actualCount);
                    elevation[idx] = hMin + t * (hMax - hMin);
                }
                currentBinStartRank += actualCount;
            }
        }
    }
    
    return { elevation, isLand };
};

const generateVirtualContinentMap = (rows: number, cols: number) => {
    const elevation = new Float32Array(rows * cols).fill(-4000); 
    const isLand = new Array(rows * cols).fill(false);
    
    for (let r = 0; r < rows; r++) {
        const lat = 90 - (r / (rows - 1)) * 180;
        const stats = getEarthStats(lat);
        
        const landCount = Math.floor(stats.landFrac * cols);
        const centerCol = Math.floor(cols / 2);
        
        const colIndices = new Array(cols);
        for (let c = 0; c < cols; c++) {
             const dist = Math.abs(c - centerCol);
             const distWrapped = Math.min(dist, cols - dist);
             colIndices[c] = { c, dist: distWrapped };
        }

        colIndices.sort((a,b) => a.dist - b.dist);
        
        for(let k=0; k<landCount; k++) {
            const idx = r * cols + colIndices[k].c;
            isLand[idx] = true;
            elevation[idx] = 0; 
        }
    }

    return { elevation, isLand };
};

const computeDistanceMap = (
    gridLength: number,
    rows: number,
    cols: number,
    rowCosLat: Float32Array,
    isSource: (i: number) => boolean
): Float32Array => {
    const distMap = new Float32Array(gridLength).fill(Infinity);
    const pq = new PriorityQueue<number>();
    const visited = new Uint8Array(gridLength);

    for(let i=0; i<gridLength; i++) {
        if (isSource(i)) {
            distMap[i] = 0;
            pq.push(i, 0);
        }
    }

    while(pq.length > 0) {
        const idx = pq.pop();
        if (idx === undefined) break;

        if (visited[idx]) continue;
        visited[idx] = 1;

        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const d = distMap[idx];
        const scaleX = Math.max(0.05, Math.abs(rowCosLat[r]));

        const neighbors = [
            { nr: r - 1, nc: c, cost: 1.0 },
            { nr: r + 1, nc: c, cost: 1.0 },
            { nr: r, nc: (c - 1 + cols) % cols, cost: scaleX },
            { nr: r, nc: (c + 1) % cols, cost: scaleX }
        ];

        for (const { nr, nc, cost } of neighbors) {
            if (nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                const newDist = d + cost;
                if (newDist < distMap[nIdx]) {
                    distMap[nIdx] = newDist;
                    pq.push(nIdx, newDist);
                }
            }
        }
    }
    return distMap;
};

export const initializeGrid = (rows: number, cols: number, startingMap: string = 'PROCEDURAL', customMap?: CustomMapData): GridCell[] => {
  const grid: GridCell[] = [];
  
  let mapData: { elevation: Float32Array | number[]; isLand: boolean[] };

  if (startingMap === 'CUSTOM' && customMap) {
      const cRows = customMap.height;
      const cCols = customMap.width;
      const resampledElev = new Float32Array(rows * cols);
      const resampledLand = new Array(rows * cols).fill(false);
      
      for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
              const srcR = Math.floor((r / rows) * cRows);
              const srcC = Math.floor((c / cols) * cCols);
              const srcIdx = Math.min(srcR * cCols + srcC, customMap.elevation.length - 1);
              const idx = r * cols + c;
              resampledElev[idx] = customMap.elevation[srcIdx];
              resampledLand[idx] = customMap.isLand[srcIdx];
          }
      }
      mapData = { elevation: resampledElev, isLand: resampledLand };

  } else if (startingMap === 'VIRTUAL_CONTINENT') {
      mapData = generateVirtualContinentMap(rows, cols);
  } else {
      mapData = generateProceduralMap(rows, cols);
  }

  const rowCosLat = new Float32Array(rows);
  for (let j = 0; j < rows; j++) {
      const lat = 90 - (j / (rows - 1)) * 180;
      rowCosLat[j] = Math.cos(toRad(lat));
      for (let i = 0; i < cols; i++) {
        const lon = -180 + (i / cols) * 360;
        const idx = j * cols + i;
        grid.push({
            lat,
            lon,
            elevation: mapData.elevation[idx],
            isLand: mapData.isLand[idx],
            distCoast: 0,
            heatMapVal: 0,
            collisionMask: 0,
            tempZonal: new Array(12).fill(0),
            temp: new Array(12).fill(0),
            precip: new Array(12).fill(0),
            insolation: new Array(12).fill(0),
            moisture: new Array(12).fill(0),
            windU: new Array(12).fill(0),
            windV: new Array(12).fill(0),
            pressure: new Array(12).fill(1013),
            uplift: new Array(12).fill(0),
            hadleyCell: new Array(12).fill(0),
            oceanCurrent: 0,
            climateClass: '?'
        });
    }
  }

  const distFromOcean = computeDistanceMap(grid.length, rows, cols, rowCosLat, (i) => !grid[i].isLand);
  const distFromLand = computeDistanceMap(grid.length, rows, cols, rowCosLat, (i) => grid[i].isLand);

  const latStepDeg = 180 / Math.max(1, rows - 1);
  const kmPerUnit = latStepDeg * 111.1;

  for(let i=0; i<grid.length; i++) {
      if (grid[i].isLand) {
          grid[i].distCoast = distFromOcean[i] * kmPerUnit;
      } else {
          grid[i].distCoast = -1 * distFromLand[i] * kmPerUnit;
      }
  }

  return grid;
};