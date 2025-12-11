

import { SimulationResult, OceanStreamline, PhysicsParams } from '../../types';

export const drawOverlays = (
    ctx: CanvasRenderingContext2D,
    data: SimulationResult,
    mode: string,
    width: number,
    height: number,
    zoom: number,
    offsetY: number,
    startX: number,
    mapWidth: number,
    gridCols: number,
    gridRows: number,
    displayMonth: 'annual' | 0 | 6,
    physicsParams?: PhysicsParams
) => {
    const getX = (colIdx: number) => (colIdx / gridCols) * mapWidth;
    const getY = (lat: number) => (90 - lat) / 180 * (height * zoom);

    // --- COLLISION WALL CONTOUR ---
    // Draw for Step 2.0 (ocean_collision) and 2.1 (oceanCurrent)
    if (mode === 'ocean_collision' || mode === 'oceanCurrent') {
        const threshold = 0;
        ctx.strokeStyle = mode === 'ocean_collision' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 0, 0, 0.6)';
        ctx.lineWidth = 1.0 * Math.sqrt(zoom);
        
        // Simple contour: Scan horizontal and vertical edges
        // Horizontal Edges
        ctx.beginPath();
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const idx = r * gridCols + c;
                const rightIdx = r * gridCols + (c + 1) % gridCols;
                const val = data.grid[idx].collisionMask;
                const rightVal = data.grid[rightIdx].collisionMask;

                if ((val > threshold) !== (rightVal > threshold)) {
                    // Interpolate position
                    const t = (threshold - val) / (rightVal - val);
                    const x = getX(c + t);
                    const y = getY(data.grid[idx].lat) + offsetY;

                    // Draw a small vertical mark or start of line (simplified to segments for speed)
                    // Just drawing small segments for now to represent the wall
                    ctx.moveTo(startX + x, y - 2);
                    ctx.lineTo(startX + x, y + 2);
                    if (startX + x + mapWidth < width) {
                        ctx.moveTo(startX + x + mapWidth, y - 2);
                        ctx.lineTo(startX + x + mapWidth, y + 2);
                    }
                }
            }
        }
        ctx.stroke();

        // Vertical Edges
        ctx.beginPath();
        for (let r = 0; r < gridRows - 1; r++) {
            for (let c = 0; c < gridCols; c++) {
                const idx = r * gridCols + c;
                const downIdx = (r + 1) * gridCols + c;
                const val = data.grid[idx].collisionMask;
                const downVal = data.grid[downIdx].collisionMask;

                if ((val > threshold) !== (downVal > threshold)) {
                    const t = (threshold - val) / (downVal - val);
                    const x = getX(c);
                    // Linear lat interp
                    const lat1 = data.grid[idx].lat;
                    const lat2 = data.grid[downIdx].lat;
                    const y = getY(lat1 + t * (lat2 - lat1)) + offsetY;

                    ctx.moveTo(startX + x - 2, y);
                    ctx.lineTo(startX + x + 2, y);
                     if (startX + x + mapWidth < width) {
                        ctx.moveTo(startX + x + mapWidth - 2, y);
                        ctx.lineTo(startX + x + mapWidth + 2, y);
                    }
                }
            }
        }
        ctx.stroke();
    }

    // ITCZ Result
    if (mode === 'itcz_result' && data.itczLines) {
        const drawSingleITCZ = (lineIdx: number | 'annual', color: string, widthScale: number = 1.0, dash: number[] = []) => {
             let lineData: number[] = [];
             if (lineIdx === 'annual') {
                  lineData = new Array(gridCols).fill(0);
                  for(let c=0; c<gridCols; c++) {
                      let sum = 0;
                      for(let m=0; m<12; m++) sum += data.itczLines[m][c];
                      lineData[c] = sum / 12;
                  }
             } else {
                  lineData = data.itczLines[lineIdx];
             }

             ctx.strokeStyle = color;
             ctx.lineWidth = 2.0 * Math.sqrt(zoom) * widthScale;
             ctx.setLineDash(dash.map(d => d * zoom));
             
             const renderLine = (xOff: number) => {
                 ctx.beginPath();
                 for(let c=0; c<gridCols; c++) {
                     const x = getX(c) + xOff;
                     const y = getY(lineData[c]) + offsetY;
                     if (c===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                 }
                 ctx.stroke();
             };
             
             let cx = startX;
             while(cx < width) { renderLine(cx); cx += mapWidth; }
             ctx.setLineDash([]);
        };

        drawSingleITCZ(6, "rgba(255, 100, 100, 0.8)", 1.0);
        drawSingleITCZ(0, "rgba(100, 100, 255, 0.8)", 1.0);
        drawSingleITCZ('annual', "#FFFF00", 1.5);
    }

    const arrowsToDraw: {x: number, y: number, angle: number, color: string, scale: number}[] = [];

    // Ocean Currents
    if (mode === 'oceanCurrent' && data.oceanStreamlines) {
        const m = displayMonth === 'annual' ? 0 : displayMonth; 
        const lines = data.oceanStreamlines[m] || [];
        
        if (data.itczLines && data.itczLines[m]) {
             const itcz = data.itczLines[m];
             
             if (physicsParams) {
                const separation = physicsParams.oceanEcLatGap;
                const ecNorthY = itcz.map(lat => getY(Math.max(-90, Math.min(90, lat + separation))) + offsetY);
                const ecSouthY = itcz.map(lat => getY(Math.max(-90, Math.min(90, lat - separation))) + offsetY);

                const drawAuxLines = (xOff: number) => {
                     ctx.strokeStyle = "rgba(0, 255, 255, 0.4)"; 
                     ctx.lineWidth = 1.0 * Math.sqrt(zoom);
                     ctx.setLineDash([4 * zoom, 4 * zoom]); 
                     
                     ctx.beginPath();
                     for(let c=0; c<gridCols; c++) {
                         const x = getX(c) + xOff;
                         const y = ecNorthY[c];
                         if (c===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                     }
                     ctx.stroke();

                     ctx.beginPath();
                     for(let c=0; c<gridCols; c++) {
                         const x = getX(c) + xOff;
                         const y = ecSouthY[c];
                         if (c===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                     }
                     ctx.stroke();
                     ctx.setLineDash([]);
                };
                let cx = startX;
                while(cx < width) { drawAuxLines(cx); cx += mapWidth; }
             }

             ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; 
             ctx.lineWidth = 1.0 * Math.sqrt(zoom); 
             ctx.setLineDash([8 * zoom, 4 * zoom]); 
             
             const drawITCZ = (xOff: number) => {
                 ctx.beginPath();
                 for(let c=0; c<gridCols; c++) {
                     const x = getX(c) + xOff;
                     const y = getY(itcz[c]) + offsetY;
                     if (c===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                 }
                 ctx.stroke();
             };
             let cx = startX;
             while(cx < width) { drawITCZ(cx); cx += mapWidth; }
             ctx.setLineDash([]);
        }

        const drawStreamline = (line: OceanStreamline, xOff: number) => {
            const pts = line.points;
            if (pts.length < 2) return;
            
            ctx.lineWidth = 2.0 * Math.sqrt(zoom); // Slightly thinner for cleaner look with improved density
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            let distanceAccumulator = 0;
            const arrowInterval = 80; // Widen arrow spacing
            const itczRef = data.itczLines?.[m] || [];

            for(let i=1; i<pts.length; i++) {
                 const p0 = pts[i-1];
                 const p1 = pts[i];
                 const px0 = getX(p0.x) + xOff;
                 const py0 = getY(p0.lat) + offsetY;
                 const px1 = getX(p1.x) + xOff;
                 const py1 = getY(p1.lat) + offsetY;

                 if (Math.abs(px1 - px0) > mapWidth/2) continue;

                 const colIdx = Math.floor(p1.x) % gridCols;
                 const itczLat = itczRef[colIdx];
                 const vy = p1.vy || 0;
                 let isLeaving = false;
                 
                 if (p1.lat >= itczLat) isLeaving = vy < 0; 
                 else isLeaving = vy > 0;

                 const maxVy = Math.max(0.1, physicsParams?.oceanEcPolewardDrift || 1.5);
                 const rawIntensity = Math.min(1.0, Math.abs(vy) / maxVy);
                 const intensity = Math.pow(rawIntensity, 2); 

                 let r=0, g=0, b=0;
                 if (isLeaving) {
                     r = Math.floor(255 * intensity);
                     g = Math.floor(20 * intensity); 
                     b = Math.floor(20 * intensity);
                 } else {
                     r = Math.floor(20 * intensity);
                     g = Math.floor(140 * intensity); 
                     b = Math.floor(255 * intensity);
                 }
                 const colorStr = `rgb(${r}, ${g}, ${b})`;
                 ctx.strokeStyle = colorStr;
                 
                 ctx.beginPath();
                 ctx.moveTo(px0, py0);
                 ctx.lineTo(px1, py1);
                 ctx.stroke();

                 const dx = px1 - px0;
                 const dy = py1 - py0;
                 const segLen = Math.sqrt(dx*dx + dy*dy);
                 distanceAccumulator += segLen;

                 if (distanceAccumulator > arrowInterval) {
                     distanceAccumulator = 0;
                     const angle = Math.atan2(dy, dx);
                     arrowsToDraw.push({
                         x: px1,
                         y: py1,
                         angle: angle,
                         color: colorStr,
                         scale: Math.sqrt(zoom)
                     });
                 }
            }
        };
        
        for (const line of lines) {
             let cx = startX;
             while(cx < width) { drawStreamline(line, cx); cx += mapWidth; }
        }

        // --- DRAW IMPACT POINTS ---
        if (data.impactPoints && data.impactPoints[m]) {
            const impacts = data.impactPoints[m];
            
            const drawImpactMarker = (im: any, xOff: number) => {
                const x = getX(im.lon >= 0 ? (im.lon + 180) * (gridCols/360) : (im.lon + 180) * (gridCols/360)) + xOff;
                const y = getY(im.lat) + offsetY;
                const size = 4 * Math.sqrt(zoom);
                
                if (im.type === 'ECC') {
                    // ECC Impact (Red X) - Warm current hitting East coast
                    ctx.strokeStyle = '#ff4444';
                    ctx.lineWidth = 2 * Math.sqrt(zoom);
                    ctx.beginPath();
                    ctx.moveTo(x - size, y - size);
                    ctx.lineTo(x + size, y + size);
                    ctx.moveTo(x + size, y - size);
                    ctx.lineTo(x - size, y + size);
                    ctx.stroke();
                    
                    // Glow
                    ctx.fillStyle = 'rgba(255, 50, 50, 0.4)';
                    ctx.beginPath();
                    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
                    ctx.fill();

                } else {
                    // EC Impact (Cyan +) - Cold/Return current hitting West coast
                    ctx.strokeStyle = '#44ffff';
                    ctx.lineWidth = 2 * Math.sqrt(zoom);
                    ctx.beginPath();
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x, y + size);
                    ctx.moveTo(x - size, y);
                    ctx.lineTo(x + size, y);
                    ctx.stroke();

                     // Glow
                    ctx.fillStyle = 'rgba(50, 255, 255, 0.4)';
                    ctx.beginPath();
                    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            };

            let cx = startX;
            while(cx < width) {
                for (const im of impacts) {
                     drawImpactMarker(im, cx);
                }
                cx += mapWidth;
            }
        }
    }

    if (arrowsToDraw.length > 0) {
        for (const arrow of arrowsToDraw) {
             const arrowSize = 6 * arrow.scale;
             ctx.save();
             ctx.translate(arrow.x, arrow.y);
             ctx.rotate(arrow.angle);
             ctx.fillStyle = arrow.color;
             ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; 
             ctx.lineWidth = 1.0;
             ctx.beginPath();
             ctx.moveTo(-arrowSize, -arrowSize * 0.6);
             ctx.lineTo(arrowSize * 0.6, 0); 
             ctx.lineTo(-arrowSize, arrowSize * 0.6);
             ctx.closePath();
             ctx.stroke();
             ctx.fill();
             ctx.restore();
        }
    }
};