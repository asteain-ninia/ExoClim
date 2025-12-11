

import * as d3 from 'd3';
import { SimulationResult } from '../../types';
import { d3ColorToRgb, hexToRgb } from '../../services/utils/helpers';
import { 
    tempScale, precipScale, precipScaleMonthly, insolationScale, 
    coastScaleLand, coastScaleOcean, hadleyScale, 
    oceanGradient, oceanBrightGradient, OCEAN_DISCRETE_COLORS, 
    landGradient, ELEVATION_COLORS, KOPPEN_COLORS 
} from './constants';

export const drawPixels = (
    ctx: CanvasRenderingContext2D,
    data: SimulationResult,
    mode: string,
    displayMonth: 'annual' | 0 | 6,
    gridCols: number,
    gridRows: number,
    isGradient: boolean
) => {
    const imgData = ctx.createImageData(gridCols, gridRows);
    const pixels = imgData.data;

    const getVal = (arr: number[]) => {
        if (displayMonth === 'annual') {
            return arr.reduce((a, b) => a + b, 0) / 12;
        }
        return arr[displayMonth];
    };

    const collisionScale = d3.scaleDiverging(d3.interpolateRdBu).domain([200, 0, -500]);

    for (let i = 0; i < data.grid.length; i++) {
        const cell = data.grid[i];
        let r=0, g=0, b=0;

        if (mode === 'temp' || mode === 'tempZonal') {
            const arr = mode === 'temp' ? cell.temp : cell.tempZonal;
            const val = getVal(arr);
            [r,g,b] = d3ColorToRgb(tempScale(val));
        } else if (mode === 'precip') {
            let val = getVal(cell.precip);
            if (displayMonth === 'annual') {
                val = cell.precip.reduce((a, b) => a + b, 0); 
                [r,g,b] = d3ColorToRgb(precipScale(val));
            } else {
                val = cell.precip[displayMonth];
                [r,g,b] = d3ColorToRgb(precipScaleMonthly(val));
            }
            if (!cell.isLand) { r*=0.5; g*=0.5; b*=0.5; }

        } else if (mode === 'distCoast') {
             if (cell.distCoast >= 0) {
                 [r,g,b] = d3ColorToRgb(coastScaleLand(cell.distCoast));
             } else {
                 [r,g,b] = d3ColorToRgb(coastScaleOcean(cell.distCoast));
             }

        } else if (mode === 'climate') {
            const hex = KOPPEN_COLORS[cell.climateClass.substring(0, 2)] || KOPPEN_COLORS[cell.climateClass.substring(0, 3)] || KOPPEN_COLORS[cell.climateClass] || '#CCCCCC';
            [r,g,b] = hexToRgb(hex);

        } else if (mode === 'insolation') {
            const val = getVal(cell.insolation);
            [r,g,b] = d3ColorToRgb(insolationScale(val));

        } else if (mode === 'ocean_collision') {
             const val = cell.collisionMask;
             // collisionMask > 0 means Wall/Buffer. < 0 means Safe.
             // We want Red for Wall (>0), White for Boundary (0), Blue for Safe (<0).
             // interpolateRdBu: 0=Red, 0.5=White, 1=Blue.
             // Map val: 
             // > 200 (Deep Inland) -> 0.0 (Red)
             // 0 (Buffer Edge) -> 0.5 (White)
             // -500 (Deep Ocean) -> 1.0 (Blue)
             
             let norm = 0.5;
             if (val > 0) {
                 // 0 to 200 -> 0.5 to 0.0
                 const t = Math.min(1.0, val / 200.0);
                 norm = 0.5 - (t * 0.5);
             } else {
                 // 0 to -500 -> 0.5 to 1.0
                 const t = Math.min(1.0, Math.abs(val) / 500.0);
                 norm = 0.5 + (t * 0.5);
             }
             [r,g,b] = d3ColorToRgb(d3.interpolateRdBu(norm));

        } else if (mode === 'elevation' || mode === 'itcz_result' || mode === 'oceanCurrent') {
            if (!cell.isLand) {
                if (mode === 'oceanCurrent') {
                     [r,g,b] = d3ColorToRgb(oceanBrightGradient(cell.elevation));
                } else if (isGradient) {
                    const cStr = oceanGradient(cell.elevation);
                    [r,g,b] = d3ColorToRgb(cStr);
                } else {
                    let hex = OCEAN_DISCRETE_COLORS.ABYSS; 
                    const h = cell.elevation;
                    if (h >= -200) hex = OCEAN_DISCRETE_COLORS.SHELF;
                    else if (h >= -4000) hex = OCEAN_DISCRETE_COLORS.DEEP;
                    [r,g,b] = hexToRgb(hex);
                }
            } else {
                if (isGradient) {
                    [r,g,b] = d3ColorToRgb(landGradient(cell.elevation));
                } else {
                    let hex = ELEVATION_COLORS[4]; 
                    const h = cell.elevation;
                    if (h < 200) hex = ELEVATION_COLORS[0];
                    else if (h < 500) hex = ELEVATION_COLORS[1];
                    else if (h < 1000) hex = ELEVATION_COLORS[2];
                    else if (h < 2000) hex = ELEVATION_COLORS[3];
                    [r,g,b] = hexToRgb(hex);
                }
                if (mode === 'oceanCurrent') { r *= 0.3; g *= 0.3; b *= 0.3; }
            }
            if (mode === 'itcz_result') { r *= 0.5; g *= 0.5; b *= 0.5; }

        } else if (mode === 'itcz_heatmap') {
            const t = (cell.heatMapVal * -1 + 1) / 2;
            [r,g,b] = d3ColorToRgb(d3.interpolateRdBu(t));

        } else if (mode === 'wind') {
            const meanP = getVal(cell.pressure);
            if (meanP < 1008) {
                 const t = Math.max(0, (meanP - 990) / 18);
                 r = 20 * t; g = 50 + 100*t; b = 150 + 50*t;
            } else if (meanP > 1018) {
                 const t = Math.min(1, (meanP - 1018) / 15);
                 r = 200 + 55*t; g = 200 - 150*t; b = 50 - 50*t;
            } else {
                 r = 50; g = 150; b = 100;
            }
            const meanU = getVal(cell.windU);
            const meanV = getVal(cell.windV);
            const speed = Math.sqrt(meanU*meanU + meanV*meanV);
            const speedFactor = Math.min(1.0, speed / 15.0);
            r += speedFactor * 40; g += speedFactor * 40; b += speedFactor * 40;
            r = Math.min(255, Math.max(0, r));
            g = Math.min(255, Math.max(0, g));
            b = Math.min(255, Math.max(0, b));

        } else if (mode === 'hadley') {
            const meanHadley = getVal(cell.hadleyCell);
            [r,g,b] = d3ColorToRgb(hadleyScale(meanHadley));
        }

        const pIdx = i * 4;
        pixels[pIdx] = r;
        pixels[pIdx + 1] = g;
        pixels[pIdx + 2] = b;
        pixels[pIdx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
};