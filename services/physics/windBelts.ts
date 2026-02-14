
import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, PhysicsParams, WindBeltsResult } from '../../types';

/**
 * Step 2: Wind Belts Analysis
 * 
 * Implements Unit D, E, and F:
 * - Dynamic cell boundaries based on cellCount.
 * - Tropical wind model (Trade winds + Doldrums) relative to ITCZ.
 * - Pressure anomalies for circulation boundaries.
 * - Convergence (Wind V) towards ITCZ.
 */
export const computeWindBelts = (
    grid: GridCell[],
    circulationRes: { itczLines: number[][], cellCount: number, hadleyWidth: number },
    planet: PlanetParams,
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig
): WindBeltsResult => {
    
    const rotationSign = planet.isRetrograde ? -1 : 1;
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;

    // --- Unit D: Calculate Cell Boundaries ---
    const cellCount = circulationRes.cellCount;
    const baseHadleyWidth = circulationRes.hadleyWidth * phys.windHadleyWidthScale;
    
    const boundaries: number[] = [baseHadleyWidth];
    if (cellCount > 1) {
        const remainingLat = 90 - baseHadleyWidth;
        const numRemaining = cellCount - 1;
        
        // Exponential spacing for remaining cells
        // Sum of i^exp for i=1 to numRemaining
        let weightSum = 0;
        for (let i = 1; i <= numRemaining; i++) {
            weightSum += Math.pow(i, phys.windJetSpacingExp);
        }
        
        let currentLat = baseHadleyWidth;
        for (let i = 1; i < numRemaining; i++) {
            const weight = Math.pow(i, phys.windJetSpacingExp);
            const width = (weight / weightSum) * remainingLat;
            currentLat += width;
            boundaries.push(currentLat);
        }
    }
    boundaries.push(90); // Cap at pole

    const hadleyEdge = boundaries[0];
    const rawTradeOffset = phys.windTradePeakOffsetMode === 'abs'
        ? phys.windTradePeakOffsetDeg
        : hadleyEdge * phys.windTradePeakOffsetFrac;
    const tradeOffset = Math.min(
        Math.max(0.1, rawTradeOffset),
        Math.max(0.1, hadleyEdge - 0.1)
    );
    const doldrumsHalfWidth = Math.min(
        Math.max(0, phys.windDoldrumsWidthDeg),
        Math.max(0, hadleyEdge - 0.1)
    );
    const tradePeakWidth = Math.max(0.2, phys.windTradePeakWidthDeg);

    // --- Unit E/F: Determine Monthly Wind/Pressure ---
    // We update the grid for all 12 months
    for (let m = 0; m < 12; m++) {
        const itcz = circulationRes.itczLines[m];

        for (let r = 0; r < rows; r++) {
            const lat = grid[r * cols].lat;
            const latAbs = Math.abs(lat);
            const isNorth = lat >= 0;

            // 1. Identify Belt Index
            let beltIdx = 0;
            while (beltIdx < boundaries.length - 1 && latAbs > boundaries[beltIdx]) {
                beltIdx++;
            }

            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const cell = grid[idx];
                const itczLat = itcz[c];
                const distToItcz = lat - itczLat;
                const absDistToItcz = Math.abs(distToItcz);

                let u = 0;
                let v = 0;
                let p = 1013;

                // --- Pressure Model (Unit F) ---
                // ITCZ Low
                const pItcz = -phys.windPressureAnomalyMax * Math.exp(-Math.pow(absDistToItcz / phys.windPressureBeltWidth, 2));
                
                // Boundary Highs/Lows
                let pBelts = 0;
                boundaries.forEach((b, i) => {
                    if (i === boundaries.length - 1) return; // Skip pole
                    // Alternate High and Low at boundaries
                    // i=0 (Hadley/Ferrel) -> High, i=1 (Ferrel/Polar) -> Low
                    const sign = (i % 2 === 0) ? 1 : -1;
                    const bLat = isNorth ? b : -b;
                    const d = lat - bLat;
                    pBelts += sign * phys.windPressureAnomalyMax * 0.8 * Math.exp(-Math.pow(d / phys.windPressureBeltWidth, 2));
                });
                p = 1013 + pItcz + pBelts;

                // --- Wind U Model (Unit D/E) ---
                if (latAbs <= boundaries[0]) {
                    // Tropical Zone (Hadley Cell)
                    // Unit E: Doldrums and Trade Peaks
                    const distFromDoldrums = Math.max(0, absDistToItcz - doldrumsHalfWidth);
                    const gaussianPeak = Math.exp(-0.5 * Math.pow((absDistToItcz - tradeOffset) / tradePeakWidth, 2));
                    const entryRamp = distFromDoldrums / (distFromDoldrums + tradePeakWidth);
                    const edgeFade = Math.max(0, 1 - Math.pow(absDistToItcz / Math.max(0.1, hadleyEdge), 2));
                    const profile = gaussianPeak * entryRamp * edgeFade;
                    const tradeStrength = phys.windBaseSpeedEasterly * profile;
                    u = -Math.min(tradeStrength, phys.windTropicalUCap) * rotationSign;

                } else {
                    // Extra-tropical Zones
                    // Alternate Easterly/Westerly
                    // beltIdx 1 (Ferrel) -> Westerly (+), 2 (Polar) -> Easterly (-)...
                    const sign = (beltIdx % 2 !== 0) ? 1 : -1;
                    const baseSpeed = (sign > 0) ? phys.windBaseSpeedWesterly : phys.windBaseSpeedEasterly;
                    
                    // Add rotation scaling (faster rotation = stronger jets)
                    const rotFactor = Math.pow(24 / planet.rotationPeriod, phys.windSpeedRotationExp);
                    u = sign * baseSpeed * rotFactor * rotationSign;
                }

                // --- Wind V Model (Unit F: Convergence) ---
                // Towards ITCZ
                if (absDistToItcz < phys.windItczConvergenceWidth) {
                    const vProfile = Math.sin((distToItcz / phys.windItczConvergenceWidth) * Math.PI);
                    v = -vProfile * phys.windItczConvergenceSpeed;
                }

                cell.windU[m] = u;
                cell.windV[m] = v;
                cell.pressure[m] = p;
            }
        }
    }

    // --- Step 2.1: Derived Values for Step 3 ---
    // Calculate recommended gap for Ocean pass
    const oceanGap = phys.windOceanEcGapMode === 'manual' 
        ? phys.oceanEcLatGap 
        : Math.min(phys.windOceanEcGapClampMax, Math.max(phys.windOceanEcGapClampMin, tradeOffset));

    return {
        hadleyEdgeDeg: boundaries[0],
        cellBoundariesDeg: boundaries,
        doldrumsHalfWidthDeg: doldrumsHalfWidth,
        tradePeakOffsetDeg: tradeOffset,
        oceanEcLatGapDerived: oceanGap,
        modelLevel: 'trade',
        debug: {
            paramsUsed: {
                rotationSign,
                cellCount,
                hadleyWidth: boundaries[0],
                tradeOffset,
                doldrumsHalfWidth,
                tradePeakWidth
            }
        }
    };
};
