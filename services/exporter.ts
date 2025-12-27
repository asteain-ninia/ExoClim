
import JSZip from 'jszip';
// Added missing d3 import
import * as d3 from 'd3';
import { SimulationResult, PlanetParams, AtmosphereParams, SimulationConfig, PhysicsParams } from '../types';
import { KOPPEN_COLORS } from '../constants';
import { hexToRgb } from './utils/helpers';
import { drawPixels } from '../components/visualizer/PixelRenderer';
import { drawOverlays } from '../components/visualizer/OverlayRenderer';
import { 
    tempScale, precipScale, precipScaleMonthly, insolationScale, 
    coastScaleLand, coastScaleOcean, 
    oceanGradient, landGradient
} from '../components/visualizer/constants';

// Draw Legend onto Canvas (Optimized for Exporter)
const drawLegend = (ctx: CanvasRenderingContext2D, mode: string, width: number, height: number, displayMonth: number | 'annual') => {
    const padding = 20;
    const boxWidth = 320; 
    const x = width - boxWidth - padding;
    const y = padding;

    // Legend Backdrop
    ctx.fillStyle = 'rgba(3, 7, 18, 0.9)';
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.5)';
    ctx.lineWidth = 1;
    
    const modeLabels: Record<string, string> = {
        'temp': 'Surface Temperature',
        'tempZonal': 'Zonal Mean Temperature',
        'precip': 'Precipitation Distribution',
        'climate': 'Köppen Climate Classification',
        'insolation': 'Solar Insolation',
        'elevation': 'Planetary Topography',
        'distCoast': 'Distance from Coastline',
        'itcz_heatmap': 'ITCZ Influence Map',
        'itcz_result': 'ITCZ Calculated Latitudes',
        'wind': 'Zonal Wind & Pressure',
        'wind_belts': 'Atmospheric Circulation Belts',
        'ocean_collision': 'Oceanic Collision Field',
        'oceanCurrent': 'Global Ocean Currents'
    };

    const title = modeLabels[mode] || mode;
    const isMonthly = displayMonth !== 'annual';
    const monthLabel = displayMonth === 0 ? 'January' : (displayMonth === 6 ? 'July' : (isMonthly ? `Month ${displayMonth + 1}` : 'Annual Mean'));

    // Dynamic box height based on mode
    let boxHeight = 160;
    if (mode === 'climate') boxHeight = 480;
    if (mode === 'oceanCurrent') boxHeight = 220;

    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, 12);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 20, y + 35);
    
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(monthLabel, x + 20, y + 55);

    ctx.beginPath();
    ctx.moveTo(x + 20, y + 65);
    ctx.lineTo(x + boxWidth - 20, y + 65);
    ctx.strokeStyle = '#374151';
    ctx.stroke();

    const drawGradient = (scale: any, labels: string[], top: number, labelTitle?: string) => {
        const gradX = x + 20;
        const gradY = y + top;
        const gradW = boxWidth - 40;
        const gradH = 16;

        if (labelTitle) {
            ctx.fillStyle = '#d1d5db';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(labelTitle.toUpperCase(), gradX, gradY - 8);
        }

        const grad = ctx.createLinearGradient(gradX, 0, gradX + gradW, 0);
        const domain = scale.domain();
        domain.forEach((d: number, i: number) => {
            const t = i / (domain.length - 1);
            grad.addColorStop(t, scale(d));
        });
        
        ctx.fillStyle = grad;
        ctx.fillRect(gradX, gradY, gradW, gradH);
        ctx.strokeStyle = '#4b5563';
        ctx.strokeRect(gradX, gradY, gradW, gradH);

        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px monospace';
        labels.forEach((l, i) => {
            const lx = gradX + (gradW / (labels.length - 1)) * i;
            ctx.textAlign = i === 0 ? 'left' : (i === labels.length - 1 ? 'right' : 'center');
            ctx.fillText(l, lx, gradY + gradH + 15);
        });
    };

    if (mode === 'temp' || mode === 'tempZonal') {
        drawGradient(tempScale, ['-40°C', '0°C', '+40°C'], 95);
    } else if (mode === 'precip') {
        if (displayMonth === 'annual') {
            drawGradient(precipScale, ['0', '1500', '3000+ mm'], 95, 'Annual Total');
        } else {
            drawGradient(precipScaleMonthly, ['0', '200', '400+ mm'], 95, 'Monthly Total');
        }
    } else if (mode === 'distCoast') {
        drawGradient(coastScaleLand, ['Coast', '2k km'], 95, 'Land Distance');
        drawGradient(coastScaleOcean, ['Coast', '-3k km'], 145, 'Ocean Distance');
    } else if (mode === 'elevation') {
        drawGradient(landGradient, ['0m', '1km', '2km+'], 95, 'Land Elevation');
        drawGradient(oceanGradient, ['-8km', '-4km', '0m'], 145, 'Ocean Depth');
    } else if (mode === 'insolation') {
        drawGradient(insolationScale, ['0', '250', '500 W/m²'], 95);
    } else if (mode === 'itcz_heatmap') {
        const itczScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-1, 0, 1]);
        drawGradient(itczScale, ['Ocean (-1)', 'Coast', 'Land (+1)'], 95);
    } else if (mode === 'wind' || mode === 'wind_belts') {
        const pScale = d3.scaleDiverging(d3.interpolateRdBu).domain([990, 1013, 1030]);
        drawGradient(pScale, ['Low P', '1013', 'High P'], 95, 'Air Pressure (hPa)');
    } else if (mode === 'oceanCurrent') {
        const startY = 85;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        
        // ECC Marker
        ctx.fillStyle = '#ff4444';
        ctx.fillText('×', x + 20, startY + 10);
        ctx.fillStyle = '#d1d5db';
        ctx.fillText('ECC Coastal Impact (Warm)', x + 40, startY + 10);

        // EC Marker
        ctx.fillStyle = '#44ffff';
        ctx.fillText('+', x + 20, startY + 30);
        ctx.fillStyle = '#d1d5db';
        ctx.fillText('EC Coastal Impact (Cold)', x + 40, startY + 30);

        // Flow directions
        drawGradient(d3.scaleLinear<string>().domain([0, 1]).range(['#000000', '#ff0000']), ['Slow', 'Fast'], startY + 70, 'Warm Current (Leaving Tropics)');
        drawGradient(d3.scaleLinear<string>().domain([0, 1]).range(['#000000', '#0088ff']), ['Slow', 'Fast'], startY + 120, 'Cold Current (Approaching Tropics)');
    } else if (mode === 'climate') {
        const startY = 85;
        const itemWidth = 90;
        const itemHeight = 22;
        const cols = 3;
        const classes = Object.keys(KOPPEN_COLORS);
        
        ctx.font = '9px sans-serif';
        classes.forEach((code, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const curX = x + 20 + col * itemWidth;
            const curY = y + startY + row * itemHeight;
            
            ctx.fillStyle = KOPPEN_COLORS[code];
            ctx.fillRect(curX, curY, 12, 12);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.strokeRect(curX, curY, 12, 12);
            
            ctx.fillStyle = '#d1d5db';
            ctx.textAlign = 'left';
            ctx.fillText(code, curX + 18, curY + 10);
        });
    }

    // Watermark
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = 'italic 12px serif';
    ctx.textAlign = 'right';
    ctx.fillText('ExoClim Engine v6.0 • Procedural Generation', width - padding - 10, height - padding);
};

// Generate Image Blob matching UI rendering
const generateMapBlob = async (data: SimulationResult, mode: string, width: number, height: number, displayMonth: number | 'annual', phys: PhysicsParams): Promise<Blob | null> => {
    const lats = new Set(data.grid.map(c => c.lat));
    const gridRows = lats.size;
    const gridCols = data.grid.length / gridRows;

    // 1. Create pixel buffer at simulation resolution
    const buffer = document.createElement('canvas');
    buffer.width = gridCols;
    buffer.height = gridRows;
    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return null;

    // Use the exact same pixel rendering as UI
    drawPixels(bufferCtx, data, mode, displayMonth as any, gridCols, gridRows, true);

    // 2. Create high-res target canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw Background
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);

    // Draw Pixel Map (Nearest Neighbor for crisp look like UI)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buffer, 0, 0, width, height);

    // 3. Draw Overlays (Vector data)
    // We pass zoom=1.0 and offsets=0 to draw the full global map
    drawOverlays(
        ctx, data, mode, width, height, 1.0, 0, 0, width, gridCols, gridRows, displayMonth as any, phys
    );

    // 4. Draw Comprehensive Legend
    drawLegend(ctx, mode, width, height, displayMonth);

    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png', 1.0));
};

export const exportAllData = async (
    planet: PlanetParams, 
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig, 
    result: SimulationResult,
    chartContainerId: string
) => {
    const zip = new JSZip();

    // Use Effective Physics for the export metadata (matching what was actually simulated)
    const effectivePhys = { 
        ...phys, 
        oceanEcLatGap: result.wind?.oceanEcLatGapDerived ?? phys.oceanEcLatGap 
    };

    // 1. Config & Metadata
    const metaData = {
        exportedAt: new Date().toISOString(),
        planet,
        atmosphere: atm,
        physicsConfigured: phys,
        physicsEffective: effectivePhys,
        simulationConfig: config,
        globalStats: {
            hadleyWidth: result.hadleyWidth,
            cellCount: result.cellCount,
            globalTemp: result.globalTemp
        }
    };
    zip.file("Simulation_Metadata.json", JSON.stringify(metaData, null, 2));
    
    // 2. Datasets
    const geoCsv = ["lat,lon,elevation_m,isLand,dist_coast_km,itcz_heatmap_val,collision_mask,climate"];
    result.grid.forEach(c => {
        geoCsv.push(`${c.lat.toFixed(3)},${c.lon.toFixed(3)},${c.elevation.toFixed(1)},${c.isLand?1:0},${c.distCoast.toFixed(1)},${c.heatMapVal.toFixed(4)},${c.collisionMask.toFixed(1)},${c.climateClass}`);
    });
    zip.file("Planetary_Geography.csv", geoCsv.join("\n"));

    // 3. High-Resolution Map Images
    const pipelineExports = [
        { mode: 'elevation', name: 'Step0_Geography_Elevation' },
        { mode: 'distCoast', name: 'Step0_Geography_DistCoast' },
        { mode: 'itcz_heatmap', name: 'Step1_ITCZ_Heatmap' },
        { mode: 'itcz_result', name: 'Step1_ITCZ_Lines' },
        { mode: 'wind', name: 'Step2_Atmosphere_Pressure_Wind' },
        { mode: 'wind_belts', name: 'Step2_Atmosphere_Belts' },
        { mode: 'ocean_collision', name: 'Step3_Ocean_Collision' },
        { mode: 'oceanCurrent', name: 'Step3_Ocean_Currents' }
    ];

    // Export high-res 4K-ish aspect
    const imgWidth = 3840;
    const imgHeight = 1920;
    
    // Default to July (6) for month-specific visualizations
    const targetMonth = 6; 

    for (const exp of pipelineExports) {
        const blob = await generateMapBlob(result, exp.mode, imgWidth, imgHeight, targetMonth, effectivePhys);
        if (blob) {
            zip.file(`${exp.name}.png`, blob);
        }
    }

    // 4. Finalize and Download
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `ExoClim_Full_Data_${planet.radius}km_${new Date().getTime()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
