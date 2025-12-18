
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SimulationResult } from '../types';

interface Props {
  data: SimulationResult | null;
  displayMonth: 'annual' | 0 | 6;
}

// Helper component to safely measure dimensions before rendering Recharts
const SizeAwareContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width, height });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden">
      {size.width > 0 && size.height > 0 ? children : null}
    </div>
  );
};

const Charts: React.FC<Props> = ({ data, displayMonth }) => {
  const chartData = useMemo(() => {
    if (!data) return [];

    // Group by latitude for Zonal Means
    const latGroups = new Map<number, { temp: number[], precip: number[] }>();
    
    data.grid.forEach(cell => {
      const latKey = Math.round(cell.lat * 10) / 10;
      if (!latGroups.has(latKey)) latGroups.set(latKey, { temp: [], precip: [] });
      const group = latGroups.get(latKey)!;

      let tempVal = 0;
      let precipVal = 0;

      if (displayMonth === 'annual') {
          // Annual Mean Temp, Annual Total Precip
          tempVal = cell.temp.reduce((a, b) => a + b, 0) / 12;
          precipVal = cell.precip.reduce((a, b) => a + b, 0);
      } else {
          // Monthly Temp, Monthly Precip
          tempVal = cell.temp[displayMonth];
          precipVal = cell.precip[displayMonth];
      }

      group.temp.push(tempVal - 273.15); 
      group.precip.push(precipVal); 
    });

    const result = Array.from(latGroups.entries()).map(([lat, values]) => ({
      lat,
      temp: values.temp.reduce((a, b) => a + b, 0) / values.temp.length,
      precip: values.precip.reduce((a, b) => a + b, 0) / values.precip.length
    }));

    // Sort North to South (90 to -90)
    return result.sort((a, b) => a.lat - b.lat); 
  }, [data, displayMonth]);

  if (!data) return <div className="h-full flex items-center justify-center text-gray-500 text-xs text-center p-4">データの読込を<br/>待機しています</div>;

  const displayLabel = displayMonth === 'annual' ? "年平均/総量" : (displayMonth === 0 ? "1月" : "7月");

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 border-l border-gray-800" id="charts-main-container">
      <div className="p-3 border-b border-gray-800 bg-gray-900/50">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">緯度別平均値 ({displayLabel})</h3>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
           <div className="bg-gray-800 p-1 rounded text-center border-l-2 border-red-400">
              <span className="block text-gray-500 text-[9px]">全球平均気温</span>
              <span className="text-white font-mono">{(data.globalTemp - 273.15).toFixed(1)}°C</span>
           </div>
           <div className="bg-gray-800 p-1 rounded text-center border-l-2 border-blue-400">
              <span className="block text-gray-500 text-[9px]">大気循環セル数</span>
              <span className="text-white font-mono text-xs">
                {data.cellCount} 層
              </span>
           </div>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 relative">
        <SizeAwareContainer>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
                data={chartData} 
                layout="vertical" 
                margin={{ top: 10, right: 10, left: -25, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={true} />
              
              {/* X Axis 1: Temperature (Top) - Red */}
              <XAxis 
                  xAxisId="temp"
                  type="number" 
                  orientation="top" 
                  stroke="#F87171"
                  tick={{ fontSize: 9, fill: '#F87171' }}
                  tickCount={5}
                  domain={['auto', 'auto']}
                  label={{ value: "気温 (°C)", position: 'insideTop', fill: '#F87171', fontSize: 9, offset: -5 }}
              />

              {/* X Axis 2: Precipitation (Bottom) - Blue */}
              <XAxis 
                  xAxisId="precip"
                  type="number" 
                  orientation="bottom" 
                  stroke="#60A5FA"
                  tick={{ fontSize: 9, fill: '#60A5FA' }}
                  tickCount={5}
                  domain={[0, 'auto']}
                  label={{ value: "降水 (mm)", position: 'insideBottom', fill: '#60A5FA', fontSize: 9, offset: -5 }}
              />

              {/* Y Axis: Latitude */}
              <YAxis 
                dataKey="lat" 
                type="number" 
                domain={[-90, 90]} 
                tickCount={7}
                interval={0}
                stroke="#4B5563"
                tick={{ fontSize: 9, fill: '#4B5563' }}
                allowDataOverflow={true}
              />
              
              <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '4px', fontSize: '10px' }}
                  itemStyle={{ padding: 0 }}
                  labelStyle={{ color: '#9CA3AF', marginBottom: '2px' }}
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  labelFormatter={(lat) => `緯度: ${lat}°`}
                  cursor={{ stroke: '#ffffff30', strokeWidth: 1 }}
              />
              
              <Line 
                xAxisId="temp"
                dataKey="temp" 
                type="monotone" 
                stroke="#F87171" 
                dot={false} 
                strokeWidth={2} 
                name="平均気温" 
                isAnimationActive={false} 
              />
              <Line 
                xAxisId="precip"
                dataKey="precip" 
                type="monotone" 
                stroke="#60A5FA" 
                dot={false} 
                strokeWidth={2} 
                name="平均降水" 
                isAnimationActive={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        </SizeAwareContainer>
      </div>
    </div>
  );
};

export default Charts;
