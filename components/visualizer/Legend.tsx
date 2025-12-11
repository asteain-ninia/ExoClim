

import React from 'react';

const Legend: React.FC<{ mode: string }> = ({ mode }) => {
    const containerClass = "absolute top-3 right-3 bg-gray-950/95 p-4 rounded-lg border border-white/20 backdrop-blur-md text-xs text-gray-100 shadow-xl max-w-[280px] overflow-y-auto max-h-[calc(100%-24px)] custom-scrollbar";
    const titleClass = "font-bold mb-3 text-white border-b border-gray-600 pb-1 text-sm";
    const labelClass = "text-gray-200";

    switch(mode) {
        case 'oceanCurrent':
            return (
                 <div className={containerClass}>
                    <h4 className={titleClass}>海流 (ベクトル成分)</h4>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #ff0000)' }}
                             ></div>
                             <span className="text-[10px] font-mono">Leaving/Warm (Red)</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #0088ff)' }}
                             ></div>
                             <span className="text-[10px] font-mono">Approaching/Cold (Blue)</span>
                        </div>
                        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-gray-700">
                             <span className="text-[9px] text-gray-400">Angle/Speed:</span>
                             <div className="flex justify-between text-[9px] font-mono text-gray-500">
                                <span>Shallow(Black)</span>
                                <span>Steep(Vivid)</span>
                             </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-white border-dashed"></div>
                             <span className="text-[10px] text-gray-400">ITCZ (Center)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                             <div className="w-6 h-0 border-t border-cyan-400 border-dashed"></div>
                             <span className="text-[10px] text-cyan-200">EC Target Line</span>
                        </div>
                         <div className="flex items-center gap-2 mt-1">
                             <div className="text-[14px]">➤</div>
                             <span className="text-[10px] text-gray-300">Flow Direction</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-red-500 border-solid"></div>
                             <span className="text-[10px] text-red-400 font-bold">Collision Wall</span>
                        </div>
                        <div className="p-2 bg-blue-900/40 rounded border border-blue-800 text-[10px] text-blue-200 mt-2">
                             <p className="mb-1">海流はアトラクタ（Target Line）に引き寄せられ、到達すると減速します。</p>
                        </div>
                    </div>
                </div>
            );
        case 'itcz_heatmap':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ITCZ 影響度 (HeatMap)</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>-1.0 (Ocean)</span><span>0</span><span>+1.0 (Inland)</span>
                    </div>
                </div>
            );
        case 'ocean_collision':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>衝突リスク / バッファ</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>Safe (Ocean)</span><span>Edge (0)</span><span>Wall (Land+Buffer)</span>
                    </div>
                     <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-white border-solid"></div>
                             <span className="text-[10px] text-gray-300 font-bold">Effective Wall Line</span>
                    </div>
                     <div className="p-2 bg-red-900/40 rounded border border-red-800 text-[10px] text-red-200 mt-2">
                         <p>赤い領域 (>0) は「壁」として認識され、海流が反射します。</p>
                         <p>海岸線からバッファ距離分だけ沖合に拡張されています。</p>
                     </div>
                </div>
            );
        case 'itcz_result':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ITCZ 計算結果</h4>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-yellow-400"></div>
                             <span>Annual Mean</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-red-400/80"></div>
                             <span>July Max (North)</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-blue-400/80"></div>
                             <span>Jan Max (South)</span>
                        </div>
                    </div>
                </div>
            );
        case 'temp':
        case 'tempZonal':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>気温</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #313695, #4575b4, #e0f3f8, #fee090, #f46d43, #a50026)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>-40°C</span><span>0°C</span><span>+40°C</span>
                    </div>
                </div>
            );
        case 'precip':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>降水量</h4>
                    <div className="h-3 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #f7fbff, #08306b)' }}></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>0mm</span><span>High</span>
                    </div>
                </div>
            );
        case 'insolation':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>日射量</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #ffffb2, #fd8d3c, #bd0026)' }}
                    ></div>
                </div>
            );
        case 'distCoast':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>海岸距離</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #74c476, #00441b)' }}></div>
                    <div className="text-[10px] text-gray-400 mb-2">陸地 (Green)</div>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #6baed6, #08306b)' }}></div>
                    <div className="text-[10px] text-gray-400">海洋 (Blue)</div>
                </div>
            );
        case 'elevation':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>地形・標高</h4>
                    <div className="space-y-1">
                        <div className="text-[10px] text-gray-400 mb-1">陸地</div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#663301]"></div><span>2000m+</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#cc9a45]"></div><span>1000m</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#7fb86e]"></div><span>0m</span></div>
                        <div className="text-[10px] text-gray-400 mb-1 mt-2">海洋</div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#7fcdbb]"></div><span>0m</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#081d58]"></div><span>-4000m</span></div>
                    </div>
                </div>
            );
        default:
            return null;
      }
};

export default Legend;