

import React, { useEffect, useRef, useState } from 'react';
import { SimulationResult, PhysicsParams } from '../types';
import { drawPixels } from './visualizer/PixelRenderer';
import { drawOverlays } from './visualizer/OverlayRenderer';
import Legend from './visualizer/Legend';

interface Props {
  data: SimulationResult | null;
  mode: 'temp' | 'precip' | 'distCoast' | 'climate' | 'insolation' | 'wind' | 'tempZonal' | 'oceanCurrent' | 'elevation' | 'hadley' | 'itcz_heatmap' | 'itcz_result' | 'ocean_collision';
  width: number;
  height: number;
  displayMonth: 'annual' | 0 | 6; 
  physicsParams?: PhysicsParams; 
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
}

const MapVisualizer: React.FC<Props> = ({ data, mode, width, height, displayMonth, physicsParams, zoom = 1.0, onZoomChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const [tooltip, setTooltip] = useState<{x: number, y: number, text: string} | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const [isGradient, setIsGradient] = useState(false);
  
  // Helper to extract value based on displayMonth
  const getVal = (arr: number[]) => {
      if (displayMonth === 'annual') {
          return arr.reduce((a, b) => a + b, 0) / 12;
      }
      return arr[displayMonth];
  };

  const modeLabels: Record<string, string> = {
      'temp': '気温 (Real Temp)',
      'precip': '降水量 (Precipitation)',
      'distCoast': '海岸距離 (Distance)',
      'climate': '気候区分 (Köppen Climate)',
      'insolation': '日射量 (Insolation)',
      'wind': '気圧・風 (Pressure & Wind)',
      'tempZonal': '基礎温度 (Zonal Temp)',
      'oceanCurrent': '海流 (Ocean Current)',
      'elevation': '地形・標高 (Elevation)',
      'hadley': '大気循環・ITCZ (Circulation)',
      'itcz_heatmap': 'Step 1.1: 影響マップ (HeatMap)',
      'itcz_result': 'Step 1.6: ITCZ Result',
      'ocean_collision': 'Step 2.0: 衝突リスク (Collision)'
  };

  // --- Rendering to Buffer ---
  useEffect(() => {
    if (!data) return;

    const lats = new Set(data.grid.map(c => c.lat));
    const gridRows = lats.size;
    const gridCols = data.grid.length / gridRows;

    if (gridRows === 0 || gridCols === 0) return;

    if (!bufferRef.current) {
        bufferRef.current = document.createElement('canvas');
    }
    if (bufferRef.current.width !== gridCols || bufferRef.current.height !== gridRows) {
        bufferRef.current.width = gridCols;
        bufferRef.current.height = gridRows;
    }

    const buffer = bufferRef.current;
    const ctx = buffer.getContext('2d');
    if (!ctx) return;

    drawPixels(ctx, data, mode, displayMonth, gridCols, gridRows, isGradient);
    
  }, [data, mode, isGradient, displayMonth]);

  // --- Animation Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bufferRef.current || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false; 

    const lats = new Set(data.grid.map(c => c.lat));
    const gridRows = lats.size;
    const gridCols = data.grid.length / gridRows;

    let animationFrameId: number;

    const draw = () => {
        ctx.fillStyle = '#030712'; 
        ctx.fillRect(0, 0, width, height);
        
        const mapHeight = height * zoom;
        const mapWidth = mapHeight * 2; 
        
        const normalizedOffset = ((offsetX % mapWidth) + mapWidth) % mapWidth;
        const startX = -normalizedOffset;
        
        // Draw Base Map
        let currentX = startX;
        while (currentX < width) {
            ctx.drawImage(bufferRef.current!, currentX, offsetY, mapWidth, mapHeight);
            currentX += mapWidth;
        }

        drawOverlays(
            ctx, data, mode, width, height, zoom, offsetY, 
            startX, mapWidth, gridCols, gridRows, displayMonth, physicsParams
        );

        animationFrameId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [data, mode, width, height, offsetX, offsetY, isGradient, displayMonth, physicsParams, zoom]);

  // --- Interaction ---
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
        const deltaX = e.clientX - lastX.current;
        const deltaY = e.clientY - lastY.current;
        setOffsetX(prev => prev - deltaX);
        
        if (zoom > 1.0) {
            setOffsetY(prev => {
                const mapHeight = height * zoom;
                const minOffset = height - mapHeight; 
                const maxOffset = 0; 
                const margin = height * 0.2;
                return Math.max(minOffset - margin, Math.min(maxOffset + margin, prev + deltaY));
            });
        } else {
             setOffsetY(0); 
        }

        lastX.current = e.clientX;
        lastY.current = e.clientY;
        setTooltip(null);
        return;
    }

    if (!data || !bufferRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const mapHeight = height * zoom;
    const mapWidth = mapHeight * 2;
    const normalizedOffset = ((offsetX % mapWidth) + mapWidth) % mapWidth;
    
    const textureX = (mouseX + normalizedOffset) % mapWidth;
    const textureY = mouseY - offsetY;
    
    if (textureY < 0 || textureY > mapHeight) {
        setTooltip(null);
        return;
    }

    const lon = (textureX / mapWidth) * 360 - 180;
    const lat = 90 - (textureY / mapHeight) * 180;

    const lats = new Set(data.grid.map(c => c.lat));
    const gridRows = lats.size;
    const gridCols = data.grid.length / gridRows;
    
    const r = Math.floor(((90 - lat) / 180) * gridRows);
    const c = Math.floor(((lon + 180) / 360) * gridCols);
    
    const safeR = Math.max(0, Math.min(gridRows - 1, r));
    const safeC = Math.max(0, Math.min(gridCols - 1, c));
    const idx = safeR * gridCols + safeC;
    const cell = data.grid[idx];

    if (cell) {
      const meanTemp = (getVal(cell.temp) - 273.15).toFixed(1);
      let precipVal = 0;
      let precipLabel = "年降水";
      if (displayMonth === 'annual') {
          precipVal = cell.precip.reduce((a, b) => a + b, 0);
      } else {
          precipVal = cell.precip[displayMonth];
          precipLabel = "月降水";
      }
      
      let text = `緯度: ${cell.lat.toFixed(1)}, 経度: ${cell.lon.toFixed(1)}`;
      
      if (mode === 'oceanCurrent') {
           if (!cell.isLand) {
             text += `\nState: Ocean`;
           } else {
             text += `\nState: Land`;
           }
      } else if (mode === 'ocean_collision') {
           text += `\nCollision Field: ${cell.collisionMask?.toFixed(1)}`;
           text += `\nStatus: ${cell.collisionMask > 0 ? 'WALL' : 'SAFE'}`;
      } else if (mode === 'itcz_heatmap') {
          text += `\nHeatMap: ${cell.heatMapVal.toFixed(2)}`;
          const type = cell.heatMapVal > 0.5 ? "Inland" : (cell.heatMapVal < -0.5 ? "Deep Ocean" : "Coastal");
          text += `\nType: ${type}`;
      } else if (mode === 'distCoast') {
           const dist = cell.distCoast;
           if (dist >= 0) {
               text += `\n内陸度: ${dist.toFixed(0)} km`;
           } else {
               text += `\n海洋深度: ${Math.abs(dist).toFixed(0)} km`;
           }
           text += `\n標高: ${cell.elevation.toFixed(0)}m`;
      } else {
           text += `\n気温: ${meanTemp}°C`;
           text += `\n${precipLabel}: ${precipVal.toFixed(0)}mm`;
           text += `\n気候: ${cell.climateClass}`;
           text += `\n標高: ${cell.elevation.toFixed(0)}m`;
      }

      setTooltip({ x: e.clientX, y: e.clientY, text });
    } else {
        setTooltip(null);
    }
  };
  
  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onZoomChange) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const oldZoom = zoom;
      const delta = -e.deltaY * 0.001; 
      const newZoom = Math.max(1.0, Math.min(8.0, oldZoom + delta));
      if (newZoom === oldZoom) return;

      const ratio = newZoom / oldZoom;
      setOffsetX(prev => {
         const worldX = prev + mouseX;
         const newWorldX = worldX * ratio;
         return newWorldX - mouseX;
      });
      setOffsetY(prev => {
          const distFromMapTop = mouseY - prev;
          const newDistFromMapTop = distFromMapTop * ratio;
          return mouseY - newDistFromMapTop;
      });
      onZoomChange(newZoom);
  };

  return (
    <div 
        className="relative cursor-move group overflow-hidden bg-gray-950 rounded-lg shadow-lg border border-gray-800"
        style={{ width, height }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
    >
      <canvas ref={canvasRef} width={width} height={height} className="block" />
      {tooltip && (
        <div 
          className="fixed z-50 px-4 py-3 text-sm text-white bg-black/90 rounded pointer-events-none whitespace-pre-line border border-gray-500 shadow-2xl backdrop-blur-sm font-sans"
          style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}
        >
          {tooltip.text}
        </div>
      )}
      
      <div className="absolute bottom-3 left-3 bg-black/80 px-4 py-2 rounded-full text-xs font-bold text-white backdrop-blur-md pointer-events-none select-none flex items-center gap-2 border border-white/20 shadow-lg">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
        <span className="tracking-wider text-sm">{modeLabels[mode] || mode}</span>
        {mode !== 'climate' && mode !== 'distCoast' && mode !== 'elevation' && mode !== 'oceanCurrent' && mode !== 'itcz_heatmap' && mode !== 'ocean_collision' && (
             <span className="ml-2 px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300">
                 {displayMonth === 'annual' ? '年平均' : (displayMonth === 0 ? '1月' : '7月')}
             </span>
        )}
      </div>

      <Legend mode={mode} />

      {mode === 'elevation' && (
        <div 
            className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border border-white/20 backdrop-blur-md select-none pointer-events-auto cursor-pointer hover:bg-gray-900 transition-colors shadow-lg"
            onClick={() => setIsGradient(!isGradient)}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <span className="text-xs text-white font-bold uppercase tracking-wider">スムーズ表示</span>
             <div 
                className={`w-10 h-5 rounded-full p-0.5 transition-colors ${isGradient ? 'bg-blue-600' : 'bg-gray-600'}`}
             >
                 <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${isGradient ? 'translate-x-5' : 'translate-x-0'}`} />
             </div>
        </div>
      )}
    </div>
  );
};

export default MapVisualizer;