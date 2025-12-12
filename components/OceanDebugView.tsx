

import React, { useEffect, useRef, useState } from 'react';
import { DebugSimulationData, DebugAgentSnapshot } from '../types';
import { runDebugSimulation } from '../services/physics/oceanDebugger';
import { SimulationResult, SimulationConfig, PhysicsParams } from '../types';

interface Props {
    grid: any[];
    itczLines: number[][];
    config: SimulationConfig;
    phys: PhysicsParams;
    onClose: () => void;
}

const OceanDebugView: React.FC<Props> = ({ grid, itczLines, config, phys, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [debugData, setDebugData] = useState<DebugSimulationData | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [hoverInfo, setHoverInfo] = useState<DebugAgentSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    const mapSize = { width: 800, height: 400 };

    useEffect(() => {
        // Run simulation once on mount
        setTimeout(() => {
            const data = runDebugSimulation(grid, itczLines[6], phys, config);
            setDebugData(data);
            setLoading(false);
            setIsPlaying(true);
        }, 100);
    }, []);

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

        // 1. Draw Map (Collision Field)
        const cols = debugData.width;
        const rows = debugData.height;
        const cellW = mapSize.width / cols;
        const cellH = mapSize.height / rows;

        // Use a temp canvas for map to improve perf? Or just iterate. 
        // For debug, simple iteration is fine.
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                const idx = r * cols + c;
                const val = debugData.collisionField[idx];
                
                // Color Code:
                // > 0 (Wall/Land) = Red tint
                // <= 0 (Ocean) = Blue tint
                if (val > 0) {
                    const intensity = Math.min(1, val / 500);
                    ctx.fillStyle = `rgba(${100 + 155*intensity}, 50, 50, 1)`;
                } else {
                    const intensity = Math.min(1, Math.abs(val) / 2000);
                    ctx.fillStyle = `rgba(10, 20, ${50 + 100*intensity}, 1)`;
                }
                ctx.fillRect(c*cellW, r*cellH, cellW, cellH);
            }
        }
        
        // 2. Draw ITCZ Line
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.setLineDash([4, 2]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let c=0; c<cols; c++) {
            const lat = debugData.itczLine[c];
            const r = (90 - lat) / 180 * (rows - 1);
            const x = c * cellW;
            const y = r * cellH;
            if(c===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Draw Agents
        const frame = debugData.frames[currentStep];
        if (!frame) return;

        frame.agents.forEach(agent => {
            const x = agent.x * cellW;
            const y = agent.y * cellH;
            
            ctx.beginPath();
            
            // Color Code
            if (agent.state === 'active') {
                if (agent.type === 'ECC') ctx.fillStyle = '#ff4400'; // Warm
                else ctx.fillStyle = '#00ccff'; // Cold
                
                // Size by velocity
                const speed = Math.sqrt(agent.vx*agent.vx + agent.vy*agent.vy);
                const r = Math.max(1.5, Math.min(4, speed * 2));
                ctx.arc(x, y, r, 0, Math.PI*2);
            } else if (agent.state === 'impact') {
                ctx.fillStyle = '#ffffff';
                ctx.arc(x, y, 4, 0, Math.PI*2);
                // Draw X
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.moveTo(x-3, y-3); ctx.lineTo(x+3, y+3);
                ctx.moveTo(x+3, y-3); ctx.lineTo(x-3, y+3);
                ctx.stroke();
            } else if (agent.state === 'stuck') {
                ctx.fillStyle = 'yellow';
                ctx.arc(x, y, 3, 0, Math.PI*2);
                // Flash ring
                if (Math.floor(Date.now() / 200) % 2 === 0) {
                     ctx.strokeStyle = 'orange';
                     ctx.lineWidth = 1;
                     ctx.stroke();
                }
            } else if (agent.state === 'dead') {
                ctx.fillStyle = '#555'; // Greyed out
                ctx.arc(x, y, 1, 0, Math.PI*2);
            }
            
            ctx.fill();

            // Vector line
            if (agent.state === 'active') {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 1;
                ctx.moveTo(x, y);
                ctx.lineTo(x + agent.vx * 3, y + agent.vy * 3);
                ctx.stroke();
            }
        });
        
        // Draw History/Trails for Dead/Stuck agents from THIS frame only (highlight)
        // Or accumulating dead agents?
        // To avoid clutter, let's keep it simple: agents disappear if they aren't in the frame, 
        // unless they just died in this frame.
        // (Note: The debug engine includes status='dead' for one frame then they might be removed in logic, 
        // but here we just render what is in the frame array).

    }, [debugData, currentStep, mapSize]);

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

        // Find nearest agent
        let nearest: DebugAgentSnapshot | null = null;
        let minD = 100; // px sq

        frame.agents.forEach(a => {
            const ax = a.x * cellW;
            const ay = a.y * cellH;
            const d = (ax-mouseX)**2 + (ay-mouseY)**2;
            if (d < minD) {
                minD = d;
                nearest = a;
            }
        });
        setHoverInfo(nearest);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-8 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden max-w-5xl w-full flex flex-col max-h-full">
                
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-red-500 font-mono text-xl">●</span>
                        Ocean Physics Debugger
                    </h2>
                    <button onClick={onClose} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors">
                        Close [ESC]
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex min-h-0 bg-gray-950 relative">
                    {/* Canvas Area */}
                    <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                         {loading && <div className="text-blue-400 animate-pulse">Calculating physics frames...</div>}
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
                             <div className="absolute top-6 left-6 bg-black/90 border border-gray-500 text-xs text-white p-2 rounded pointer-events-none shadow-xl">
                                 <div className="font-bold text-yellow-400 mb-1">Agent #{hoverInfo.id} ({hoverInfo.type})</div>
                                 <div>Pos: {hoverInfo.x.toFixed(1)}, {hoverInfo.y.toFixed(1)}</div>
                                 <div>Vel: {hoverInfo.vx.toFixed(2)}, {hoverInfo.vy.toFixed(2)}</div>
                                 <div className={`font-bold mt-1 ${
                                     hoverInfo.state === 'active' ? 'text-green-400' : 
                                     hoverInfo.state === 'dead' ? 'text-gray-500' : 'text-red-400'
                                 }`}>
                                     State: {hoverInfo.state.toUpperCase()}
                                 </div>
                                 {hoverInfo.cause && <div className="text-red-300">Cause: {hoverInfo.cause}</div>}
                             </div>
                         )}
                    </div>

                    {/* Sidebar Stats */}
                    <div className="w-64 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Frame Info</h3>
                        <div className="space-y-2 text-xs font-mono text-gray-300">
                             <div className="flex justify-between"><span>Step:</span> <span className="text-white">{currentStep}</span> / {debugData?.frames.length}</div>
                             <div className="flex justify-between"><span>Active Agents:</span> <span className="text-blue-300">{debugData?.frames[currentStep]?.agents.filter(a=>a.state==='active').length}</span></div>
                             <div className="flex justify-between"><span>Deaths/Impacts:</span> <span className="text-red-300">{debugData?.frames[currentStep]?.agents.filter(a=>a.state!=='active').length}</span></div>
                        </div>

                        <h3 className="text-xs font-bold text-gray-500 uppercase mt-6 mb-3">Legend</h3>
                        <div className="space-y-2 text-xs text-gray-400">
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ff4400]"></span> ECC (Warm)</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#00ccff]"></span> EC (Cold)</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500 border border-orange-500"></span> Stuck</div>
                             <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white border border-red-500"></span> Impact</div>
                             <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-900/50 border border-red-800"></span> Land/Wall</div>
                             <div className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-900/30 border border-blue-800"></span> Ocean</div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-gray-800 border-t border-gray-700 flex items-center gap-4">
                     <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`px-4 py-2 rounded font-bold text-xs w-20 transition-colors ${isPlaying ? 'bg-yellow-600 text-white hover:bg-yellow-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
                     >
                         {isPlaying ? 'PAUSE' : 'PLAY'}
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
                             <span>Start</span>
                             <span>End</span>
                         </div>
                     </div>

                     <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
                         <span className="text-[10px] font-bold text-gray-400 uppercase">Speed</span>
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
