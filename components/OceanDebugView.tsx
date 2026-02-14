import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DebugSimulationData, DebugAgentSnapshot, PlanetParams } from '../types';
import { computeOceanCurrents } from '../services/physics/ocean'; // Unified Engine
import { SimulationConfig, PhysicsParams } from '../types';

interface Props {
    grid: any[];
    itczLines: number[][];
    config: SimulationConfig;
    phys: PhysicsParams; // Raw Configured Physics
    effectivePhys?: PhysicsParams; // Unit J: Effective Physics (with Derived Gap)
    planet: PlanetParams;
    cellCount: number;
    windCellBoundaries?: number[];
    hadleyWidth?: number;
    onClose: () => void;
}

const OceanDebugView: React.FC<Props> = ({ grid, itczLines, config, phys, effectivePhys, planet, cellCount, windCellBoundaries, hadleyWidth, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [debugData, setDebugData] = useState<DebugSimulationData | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [hoverInfo, setHoverInfo] = useState<DebugAgentSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    // Overlay Controls
    const [showOverlayITCZ, setShowOverlayITCZ] = useState(true);
    const [showOverlayECTargets, setShowOverlayECTargets] = useState(true);
    const [showOverlayCells, setShowOverlayCells] = useState(false);

    // Debug Controls
    const [targetMonth, setTargetMonth] = useState<0 | 6>(6); // Default July

    const mapSize = { width: 800, height: 400 };

    // Unit J: Use effective parameters for re-calculation if provided
    const activePhys = effectivePhys || phys;
    const preferredCellBoundaries = useMemo(() => {
        if (windCellBoundaries && windCellBoundaries.length > 1) {
            return [...windCellBoundaries]
                .filter(v => Number.isFinite(v) && v > 0 && v < 90)
                .sort((a, b) => a - b);
        }
        if (cellCount > 1) {
            const boundaries: number[] = [];
            for (let i = 1; i < cellCount; i++) {
                boundaries.push((i * 90) / cellCount);
            }
            return boundaries;
        }
        return [];
    }, [windCellBoundaries, cellCount]);
    const usesWindBoundaries = !!windCellBoundaries && windCellBoundaries.length > 1;

    useEffect(() => {
        setLoading(true);
        
        const timer = setTimeout(() => {
            // Unit J: Re-calculate using active (effective) physics to match simulation result
            const result = computeOceanCurrents(grid, itczLines, activePhys, config, planet, targetMonth);
            if (result.debugData) {
                setDebugData(result.debugData);
                setCurrentStep(0);
                setIsPlaying(true);
            }
            setLoading(false);
        }, 100);
        
        return () => clearTimeout(timer);
    }, [grid, itczLines, config, activePhys, planet, targetMonth]);

    // Playback Loop
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isPlaying && debugData) {
            interval = setInterval(() => {
                setCurrentStep(prev => {
                    if (prev >= debugData.frames.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 50 / playbackSpeed);
        }
        return () => clearInterval(interval);
    }, [isPlaying, debugData, playbackSpeed]);

    // Rendering
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !debugData) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, mapSize.width, mapSize.height);

        // 1. Draw Map (Collision Field) - Looped
        const cols = debugData.width;
        const rows = debugData.height;
        const cellW = mapSize.width / cols;
        const cellH = mapSize.height / rows;

        // Render helper
        const renderMap = (offsetX: number) => {
            for(let r=0; r<rows; r++) {
                for(let c=0; c<cols; c++) {
                    const idx = r * cols + c;
                    const val = debugData.collisionField[idx];
                    
                    if (val > 0) {
                        const intensity = Math.min(1, val / 500);
                        ctx.fillStyle = `rgba(${100 + 155*intensity}, 50, 50, 1)`;
                    } else {
                        const intensity = Math.min(1, Math.abs(val) / 2000);
                        ctx.fillStyle = `rgba(10, 20, ${50 + 100*intensity}, 1)`;
                    }
                    ctx.fillRect(c*cellW + offsetX, r*cellH, cellW, cellH);
                }
            }
        };

        // Render Center, Left, Right for Loop
        renderMap(0);
        renderMap(-mapSize.width);
        renderMap(mapSize.width);
        
        // 2. Draw Overlays
        const renderLatPolyline = (lats: number[], color: string, dash: number[] = [], lineWidth: number = 1) => {
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            ctx.lineWidth = lineWidth;

            const render = (offsetX: number) => {
                ctx.beginPath();
                for(let c=0; c<cols; c++) {
                    const lat = lats[c];
                    // Clamp
                    const clampedLat = Math.max(-90, Math.min(90, lat));
                    const r = (90 - clampedLat) / 180 * (rows - 1);
                    const x = c * cellW + offsetX;
                    const y = r * cellH;

                    if (c === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            };

            render(0);
            render(-mapSize.width);
            render(mapSize.width);
            ctx.setLineDash([]);
        };

        const renderLatHLine = (lat: number, color: string, dash: number[] = [], lineWidth: number = 1) => {
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            ctx.lineWidth = lineWidth;
            
            const clampedLat = Math.max(-90, Math.min(90, lat));
            const r = (90 - clampedLat) / 180 * (rows - 1);
            const y = r * cellH;

            const render = (offsetX: number) => {
                ctx.beginPath();
                ctx.moveTo(offsetX, y);
                ctx.lineTo(offsetX + mapSize.width, y);
                ctx.stroke();
            };
            
            render(0);
            render(-mapSize.width);
            render(mapSize.width);
            ctx.setLineDash([]);
        };

        // 2a. ITCZ
        if (showOverlayITCZ && debugData.itczLine) {
            renderLatPolyline(debugData.itczLine, 'rgba(255, 255, 0, 0.6)', [4, 2], 1.5);
        }

        // 2b. EC Targets
        if (showOverlayECTargets && debugData.itczLine) {
            // Unit J: Use activePhys gap for guides
            const gap = activePhys.oceanEcLatGap;
            const ecN = debugData.itczLine.map(l => l + gap);
            const ecS = debugData.itczLine.map(l => l - gap);
            renderLatPolyline(ecN, 'rgba(0, 255, 255, 0.6)', [2, 4], 1);
            renderLatPolyline(ecS, 'rgba(0, 255, 255, 0.6)', [2, 4], 1);
        }

        // 2c. Cell Boundaries (Prefer model output from wind result)
        if (showOverlayCells && preferredCellBoundaries.length > 0) {
            for (const lat of preferredCellBoundaries) {
                renderLatHLine(lat, 'rgba(255, 255, 255, 0.3)', [2, 2], 1);
                renderLatHLine(-lat, 'rgba(255, 255, 255, 0.3)', [2, 2], 1);
            }
        }

        // 3. Draw Agents
        const frame = debugData.frames[currentStep];
        if (!frame) return;

        const renderAgent = (agent: DebugAgentSnapshot, offsetX: number) => {
             const x = agent.x * cellW + offsetX;
             const y = agent.y * cellH;
             
             ctx.beginPath();
             if (agent.state === 'active' || agent.state === 'crawling') {
                 if (agent.state === 'crawling') ctx.fillStyle = '#d946ef'; 
                 else if (agent.type === 'ECC') ctx.fillStyle = '#ff4400'; 
                 else ctx.fillStyle = '#00ccff'; 
                 
                 const speed = Math.sqrt(agent.vx*agent.vx + agent.vy*agent.vy);
                 const r = Math.max(1.5, Math.min(4, speed * 2));
                 ctx.arc(x, y, r, 0, Math.PI*2);
             } else if (agent.state === 'impact') {
                 ctx.fillStyle = '#ffffff';
                 ctx.arc(x, y, 4, 0, Math.PI*2);
                 ctx.strokeStyle = 'red';
                 ctx.lineWidth = 2;
                 ctx.moveTo(x-3, y-3); ctx.lineTo(x+3, y+3);
                 ctx.moveTo(x+3, y-3); ctx.lineTo(x-3, y+3);
                 ctx.stroke();
             } else if (agent.state === 'stuck') {
                 ctx.fillStyle = 'yellow';
                 ctx.arc(x, y, 3, 0, Math.PI*2);
             } else if (agent.state === 'dead') {
                 ctx.fillStyle = '#555';
                 ctx.arc(x, y, 1, 0, Math.PI*2);
             }
             ctx.fill();

             if (agent.state === 'active' || agent.state === 'crawling') {
                 ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.moveTo(x, y);
                 ctx.lineTo(x + agent.vx * 3, y + agent.vy * 3);
                 ctx.stroke();
             }
        };

        frame.agents.forEach(originalAgent => {
            // Coordinate Normalization for Loop Rendering
            const normX = ((originalAgent.x % cols) + cols) % cols;
            const agent = { ...originalAgent, x: normX };

            renderAgent(agent, 0);
            renderAgent(agent, -mapSize.width);
            renderAgent(agent, mapSize.width);
        });

    }, [debugData, currentStep, mapSize, showOverlayITCZ, showOverlayECTargets, showOverlayCells, preferredCellBoundaries, activePhys]);

    // Interaction for Hover
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!debugData || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const cols = debugData.width;
        const rows = debugData.height;
        const cellW = mapSize.width / cols;
        const cellH = mapSize.height / rows;

        const frame = debugData.frames[currentStep];
        if (!frame) return;

        let nearest: DebugAgentSnapshot | null = null;
        let minD = 100; // px sq

        frame.agents.forEach(a => {
            const normX = ((a.x % cols) + cols) % cols;
            const ax = normX * cellW;
            const ay = a.y * cellH;
            const offsets = [0, mapSize.width, -mapSize.width];
            
            offsets.forEach(off => {
                 const d = (ax + off - mouseX)**2 + (ay - mouseY)**2;
                 if (d < minD) {
                     minD = d;
                     nearest = a;
                 }
            });
        });
        setHoverInfo(nearest);
    };

    const stateLabels: Record<string, string> = {
        'active': '進行中',
        'crawling': '沿岸這行',
        'impact': '衝突/到達',
        'stuck': '停滞',
        'dead': '消滅'
    };

    const isCoupled = phys.oceanEcLatGap !== activePhys.oceanEcLatGap;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-8 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden max-w-6xl w-full flex flex-col max-h-full">
                
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-red-500 font-mono text-xl">●</span>
                        海流物理デバッガー
                    </h2>

                    <div className="flex items-center gap-6">
                        {/* Month Toggle */}
                        <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                             <button 
                                onClick={() => setTargetMonth(0)} 
                                className={`px-3 py-1 text-xs rounded font-bold transition-colors ${targetMonth===0 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                             >
                                 1月 (南半球の夏)
                             </button>
                             <button 
                                onClick={() => setTargetMonth(6)} 
                                className={`px-3 py-1 text-xs rounded font-bold transition-colors ${targetMonth===6 ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
                             >
                                 7月 (北半球の夏)
                             </button>
                        </div>
                    </div>

                    <button onClick={onClose} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors border border-gray-700">
                        閉じる [ESC]
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex min-h-0 bg-gray-950 relative">
                    {/* Canvas Area */}
                    <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative bg-black">
                         {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 text-blue-400 font-mono animate-pulse">海流エージェント演算中...</div>}
                         <canvas 
                            ref={canvasRef} 
                            width={mapSize.width} 
                            height={mapSize.height} 
                            className="bg-gray-900 border border-gray-800 cursor-crosshair shadow-lg"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setHoverInfo(null)}
                         />
                         
                         {/* Hover Info Tooltip */}
                         {hoverInfo && (
                             <div className="absolute top-6 left-6 bg-black/90 border border-gray-500 text-xs text-white p-2 rounded pointer-events-none shadow-xl z-20">
                                 <div className="font-bold text-yellow-400 mb-1">エージェント ID: #{hoverInfo.id} ({hoverInfo.type})</div>
                                 <div>位置座標: {hoverInfo.x.toFixed(1)}, {hoverInfo.y.toFixed(1)}</div>
                                 <div>速度成分: {hoverInfo.vx.toFixed(2)}, {hoverInfo.vy.toFixed(2)}</div>
                                 <div className={`font-bold mt-1 ${
                                     (hoverInfo.state === 'active' || hoverInfo.state === 'crawling') ? 'text-green-400' : 'text-red-400'
                                 }`}>
                                     状態: {stateLabels[hoverInfo.state] || hoverInfo.state}
                                 </div>
                                 {hoverInfo.cause && <div className="text-red-300 text-[10px] mt-1">詳細要因: {hoverInfo.cause}</div>}
                             </div>
                         )}
                    </div>

                    {/* Sidebar Stats */}
                    <div className="w-64 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto custom-scrollbar shrink-0">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">表示設定</h3>
                        <div className="space-y-2 text-xs text-gray-300 mb-6 bg-gray-800/50 p-2 rounded border border-gray-800">
                             <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                                 <input type="checkbox" checked={showOverlayITCZ} onChange={e => setShowOverlayITCZ(e.target.checked)} className="accent-yellow-500" />
                                 <span className={showOverlayITCZ ? "text-yellow-200" : ""}>ITCZ 算出線 (黄)</span>
                             </label>
                             <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                                 <input type="checkbox" checked={showOverlayECTargets} onChange={e => setShowOverlayECTargets(e.target.checked)} className="accent-cyan-500" />
                                 <span className={showOverlayECTargets ? "text-cyan-200" : ""}>EC 誘導ライン (水色)</span>
                             </label>
                             <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                                 <input type="checkbox" checked={showOverlayCells} onChange={e => setShowOverlayCells(e.target.checked)} className="accent-gray-500" />
                                 <span>循環セル境界 (灰)</span>
                             </label>
                        </div>
                        
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">物理パラメータ (Unit J)</h3>
                        <div className="space-y-1 text-[10px] font-mono text-gray-400 mb-6 pl-2 border-l-2 border-gray-700">
                            <div className="flex justify-between">
                                <span>設定 Gap:</span> 
                                <span className="text-gray-500">{phys.oceanEcLatGap.toFixed(1)}°</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>実効 Gap:</span> 
                                <span className={`font-bold ${isCoupled ? 'text-cyan-400' : 'text-gray-300'}`}>
                                    {activePhys.oceanEcLatGap.toFixed(1)}°
                                </span>
                            </div>
                            <div className="mt-2 text-[8px] text-gray-600 uppercase">
                                {isCoupled ? "※風帯モデルから継承" : "※物理設定値をそのまま使用"}
                            </div>
                            <div className="w-full h-px bg-gray-800 my-2"></div>
                            <div className="flex justify-between"><span>セル数:</span> <span className="text-white">{cellCount}</span></div>
                            <div className="flex justify-between">
                                <span>境界ソース:</span>
                                <span className={usesWindBoundaries ? "text-cyan-300" : "text-gray-500"}>
                                    {usesWindBoundaries ? 'wind.cellBoundariesDeg' : '90/cellCount'}
                                </span>
                            </div>
                            <div className="text-[9px] text-gray-500 break-words">
                                {preferredCellBoundaries.length > 0
                                    ? preferredCellBoundaries.map(v => v.toFixed(1)).join(', ')
                                    : '境界なし'}
                            </div>
                            <div className="flex justify-between"><span>自転逆転:</span> <span className={planet.isRetrograde ? "text-orange-400" : "text-gray-500"}>{planet.isRetrograde ? "あり" : "なし"}</span></div>
                        </div>

                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">フレーム詳細</h3>
                        <div className="space-y-2 text-xs font-mono text-gray-300">
                             <div className="flex justify-between"><span>対象季節:</span> <span className={targetMonth === 6 ? "text-red-400" : "text-blue-400"}>{targetMonth === 6 ? '7月 (夏)' : '1月 (冬)'}</span></div>
                             <div className="flex justify-between"><span>ステップ:</span> <span className="text-white">{currentStep}</span> / {debugData?.frames.length}</div>
                             <div className="flex justify-between"><span>アクティブ:</span> <span className="text-blue-300">{debugData?.frames[currentStep]?.agents.filter(a=>a.state==='active' || a.state==='crawling').length}</span></div>
                             <div className="flex justify-between"><span>消滅/停滞:</span> <span className="text-red-300">{debugData?.frames[currentStep]?.agents.filter(a=>a.state!=='active' && a.state!=='crawling').length}</span></div>
                        </div>

                        <h3 className="text-xs font-bold text-gray-500 uppercase mt-6 mb-3">凡例</h3>
                        <div className="space-y-2 text-xs text-gray-400">
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ff4400]"></span> 赤道反流 (ECC)</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#00ccff]"></span> 赤道海流 (EC)</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#d946ef]"></span> 沿岸這行 (Crawl)</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500 border border-orange-500"></span> 停滞 (Stuck)</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white border border-red-500"></span> 衝突点 (Impact)</div>
                             <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-900/50 border border-red-800"></span> 衝突判定壁 (Land)</div>
                             <div className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-900/30 border border-blue-800"></span> 海洋領域 (Ocean)</div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-gray-800 border-t border-gray-700 flex items-center gap-4">
                     <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`px-4 py-2 rounded font-bold text-xs w-20 transition-colors ${isPlaying ? 'bg-yellow-600 text-white hover:bg-yellow-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
                     >
                         {isPlaying ? '停止' : '再生'}
                     </button>
                     
                     <div className="flex-1 flex flex-col justify-center">
                         <input 
                            type="range" 
                            min="0" 
                            max={(debugData?.frames.length || 100) - 1} 
                            value={currentStep}
                            onChange={(e) => {
                                setIsPlaying(false);
                                setCurrentStep(parseInt(e.target.value));
                            }}
                            className="w-full accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                         />
                         <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                             <span>シミュレーション開始</span>
                             <span>解析終了</span>
                         </div>
                     </div>

                     <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
                         <span className="text-[10px] font-bold text-gray-400 uppercase">速度</span>
                         {[0.5, 1, 2, 5].map(s => (
                             <button 
                                key={s}
                                onClick={() => setPlaybackSpeed(s)}
                                className={`px-2 py-1 text-[10px] rounded border ${playbackSpeed === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'}`}
                             >
                                 x{s}
                             </button>
                         ))}
                     </div>
                </div>

            </div>
        </div>
    );
};

export default OceanDebugView;
