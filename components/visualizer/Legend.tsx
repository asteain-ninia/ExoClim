
import React from 'react';

const Legend: React.FC<{ mode: string }> = ({ mode }) => {
    const containerClass = "absolute top-3 right-3 bg-gray-950/95 p-4 rounded-lg border border-white/20 backdrop-blur-md text-xs text-gray-100 shadow-xl max-w-[280px] overflow-y-auto max-h-[calc(100%-24px)] custom-scrollbar";
    const titleClass = "font-bold mb-3 text-white border-b border-gray-600 pb-1 text-sm";
    const labelClass = "text-gray-200";

    switch(mode) {
        case 'oceanCurrent':
            return (
                 <div className={containerClass}>
                    <h4 className={titleClass}>海流の動態 (循環ベクトル)</h4>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #ff0000)' }}
                             ></div>
                             <span className="text-[10px] font-mono">離脱・暖流系 (赤)</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #0088ff)' }}
                             ></div>
                             <span className="text-[10px] font-mono">収束・寒流系 (青)</span>
                        </div>
                        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-gray-700">
                             <span className="text-[9px] text-gray-400">進入角と勢い:</span>
                             <div className="flex justify-between text-[9px] font-mono text-gray-500">
                                <span>緩やか(黒)</span>
                                <span>急峻(鮮明)</span>
                             </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-white border-dashed"></div>
                             <span className="text-[10px] text-gray-400">ITCZ (収束中心線)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                             <div className="w-6 h-0 border-t border-cyan-400 border-dashed"></div>
                             <span className="text-[10px] text-cyan-200">EC 誘導ライン</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                             <span className="text-red-500 font-bold text-lg leading-none">×</span>
                             <span className="text-[10px] text-red-200">暖流の沿岸衝突 (ECC)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0">
                             <span className="text-cyan-400 font-bold text-lg leading-none">+</span>
                             <span className="text-[10px] text-cyan-200">寒流の沿岸衝突 (EC)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-red-500 border-solid"></div>
                             <span className="text-[10px] text-red-400 font-bold">衝突判定境界 (壁)</span>
                        </div>
                        <div className="p-2 bg-blue-900/40 rounded border border-blue-800 text-[10px] text-blue-200 mt-2">
                             <p className="mb-1">海流エージェントは重複が自動的に統合され、主要な流路のみが可視化されています。</p>
                        </div>
                    </div>
                </div>
            );
        case 'itcz_heatmap':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ITCZ 熱影響マップ</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>外洋 (-1.0)</span><span>中央</span><span>内陸 (+1.0)</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 leading-tight">赤い領域ほどITCZ（熱帯収束帯）を極方向に引き寄せる熱源として機能します。</p>
                </div>
            );
        case 'ocean_collision':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>衝突判定フィールド</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>安全 (海洋)</span><span>境界 (0)</span><span>衝突壁面 (陸地)</span>
                    </div>
                     <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-white border-solid"></div>
                             <span className="text-[10px] text-gray-300 font-bold">有効壁面ライン</span>
                    </div>
                     <div className="p-2 bg-red-900/40 rounded border border-red-800 text-[10px] text-red-200 mt-2">
                         <p>赤い領域 (>0) は「壁」として物理認識され、海流エージェントが反射または這行します。</p>
                     </div>
                </div>
            );
        case 'itcz_result':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ITCZ 算出緯度</h4>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-yellow-400"></div>
                             <span>年平均位置</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-red-400/80"></div>
                             <span>7月位置 (北半球の夏)</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-blue-400/80"></div>
                             <span>1月位置 (南半球の夏)</span>
                        </div>
                    </div>
                </div>
            );
        case 'temp':
        case 'tempZonal':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>表面温度分布</h4>
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
                    <h4 className={titleClass}>降水量分布</h4>
                    <div className="h-3 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #f7fbff, #08306b)' }}></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>0mm</span><span>多雨</span>
                    </div>
                </div>
            );
        case 'insolation':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>太陽放射量</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #ffffb2, #fd8d3c, #bd0026)' }}
                    ></div>
                </div>
            );
        case 'distCoast':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>海岸線からの距離</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #74c476, #00441b)' }}></div>
                    <div className="text-[10px] text-gray-400 mb-2">内陸 (緑)</div>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #6baed6, #08306b)' }}></div>
                    <div className="text-[10px] text-gray-400">海洋 (青)</div>
                </div>
            );
        case 'elevation':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>地形・標高データ</h4>
                    <div className="space-y-1">
                        <div className="text-[10px] text-gray-400 mb-1">陸域 (メートル)</div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#663301]"></div><span>2000m 以上</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#cc9a45]"></div><span>1000m 前後</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#7fb86e]"></div><span>0m (平地)</span></div>
                        <div className="text-[10px] text-gray-400 mb-1 mt-2">海域 (水深)</div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#7fcdbb]"></div><span>0m (大陸棚)</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#081d58]"></div><span>-4000m 以下</span></div>
                    </div>
                </div>
            );
        default:
            return null;
      }
};

export default Legend;
