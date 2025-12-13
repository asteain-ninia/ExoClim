

import React, { useRef, useState, useEffect } from 'react';
import { PlanetParams, AtmosphereParams, SimulationConfig, CustomMapData, PhysicsParams } from '../types';
import { EARTH_PARAMS, EARTH_ATMOSPHERE, DEFAULT_PHYSICS_PARAMS, RESOLUTION_PRESETS } from '../constants';
import Slider from './ui/Slider';
import QuadrantDial from './ui/QuadrantDial';
import CircularDial from './ui/CircularDial';

interface Props {
  planet: PlanetParams;
  setPlanet: React.Dispatch<React.SetStateAction<PlanetParams>>;
  atm: AtmosphereParams;
  setAtm: React.Dispatch<React.SetStateAction<AtmosphereParams>>;
  config: SimulationConfig;
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
  phys: PhysicsParams;
  setPhys: React.Dispatch<React.SetStateAction<PhysicsParams>>;
  onRun: () => void;
  onExport: () => void;
  isRunning: boolean;
  progress: number;
  loadingLabel: string;
}

const Controls: React.FC<Props> = ({ planet, setPlanet, atm, setAtm, config, setConfig, phys, setPhys, onRun, onExport, isRunning, progress, loadingLabel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'system' | 'orbit' | 'planet' | 'atmos' | 'physics'>('system');
  const [errors, setErrors] = useState<string[]>([]);

  const updatePlanet = (key: keyof PlanetParams, val: number | boolean) => setPlanet(prev => ({ ...prev, [key]: val }));
  const updateAtm = (key: keyof AtmosphereParams, val: number) => setAtm(prev => ({ ...prev, [key]: val }));
  const updatePhys = (key: keyof PhysicsParams, val: number) => setPhys(prev => ({ ...prev, [key]: val }));
  const updateConfig = (key: keyof SimulationConfig, val: any) => setConfig(prev => ({ ...prev, [key]: val }));

  // Dynamic max buffer based on planet radius (approx 10% of radius or fixed large cap)
  const maxCollisionBuffer = Math.min(2000, Math.floor(planet.radius * 0.2));

  // Dynamic max spawn offset based on planet radius (clamp to reasonable km range)
  const maxSpawnOffset = Math.floor(planet.radius);

  useEffect(() => {
      const errs: string[] = [];
      if (planet.gravity <= 0) errs.push('重力は正の値である必要があります');
      if (planet.rotationPeriod <= 0) errs.push('自転周期は正の値である必要があります');
      setErrors(errs);
  }, [planet, atm]);

  const handleRun = () => {
      if (errors.length > 0) return alert("設定エラー: " + errors.join(", "));
      onRun();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string) as CustomMapData;
            if (json.elevation && json.isLand && json.width && json.height) {
                setConfig(prev => ({ ...prev, startingMap: 'CUSTOM', customMap: json }));
                setTimeout(() => onRun(), 100);
            }
        } catch (err) { console.error(err); alert("マップ読込失敗"); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const Icons = {
    system: <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />,
    planet: <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />,
    orbit: <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />,
    atmos: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />,
    physics: <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  };

  const TabButton = ({ id, label, color }: { id: typeof activeTab, label: string, color: string }) => (
    <button 
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all relative overflow-hidden group border-l-4
            ${activeTab === id 
                ? `bg-gray-800 text-white border-${color}-500 shadow-md` 
                : 'bg-transparent text-gray-400 border-transparent hover:bg-gray-800/50 hover:text-gray-200'}
        `}
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" 
            className={`w-4 h-4 shrink-0 transition-colors ${activeTab === id ? `text-${color}-400` : 'text-gray-500 group-hover:text-gray-400'}`}>
            {Icons[id]}
        </svg>
        <span className="text-[11px] font-bold tracking-wide truncate">{label}</span>
    </button>
  );

  return (
    <div className="flex w-full h-full bg-gray-900 border-t border-gray-700 select-none">
      <div className="w-32 flex flex-col border-r border-gray-700 bg-gray-950 shrink-0">
          <div className="p-3 text-[10px] text-gray-500 font-bold uppercase tracking-widest border-b border-gray-800/50 text-center">設定パネル</div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <TabButton id="system" label="システム" color="blue" />
            <TabButton id="planet" label="惑星" color="green" />
            <TabButton id="orbit" label="軌道" color="orange" />
            <TabButton id="atmos" label="大気" color="purple" />
            <TabButton id="physics" label="物理演算" color="red" />
          </div>
          
          <div className="p-2 border-t border-gray-800">
               {isRunning && (
                   <div className="text-[9px] text-center text-blue-400 animate-pulse font-mono leading-tight">
                       {loadingLabel}
                   </div>
               )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-900/50 p-4 relative">
        {activeTab === 'system' && (
            <div className="grid grid-cols-3 gap-6 animate-[fadeIn_0.15s_ease-out]">
                <div className="col-span-1 space-y-4">
                    <h3 className="text-xs font-bold text-blue-400 uppercase border-b border-blue-900/50 pb-1 mb-3">生成設定</h3>
                    <div>
                        <label className="text-[10px] text-gray-400 font-bold mb-1 block">マップタイプ</label>
                        <select 
                            className="w-full bg-gray-800 text-gray-200 text-xs border border-gray-600 rounded p-2 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                            value={config.startingMap === 'CUSTOM' ? 'PROCEDURAL' : config.startingMap}
                            onChange={(e) => updateConfig('startingMap', e.target.value as any)}
                            disabled={isRunning}
                        >
                            <option value="PROCEDURAL">分散大陸 (地球型)</option>
                            <option value="VIRTUAL_CONTINENT">仮想大陸</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-400 font-bold mb-1 block">解像度</label>
                        <div className="flex gap-1">
                             {RESOLUTION_PRESETS.map((p, i) => (
                                 <button
                                    key={i}
                                    onClick={() => setConfig(prev => ({ ...prev, resolutionLat: p.lat, resolutionLon: p.lon }))}
                                    disabled={isRunning}
                                    className={`flex-1 py-1.5 text-[10px] border rounded transition-colors ${
                                        config.resolutionLat === p.lat 
                                        ? 'bg-blue-900/40 border-blue-500 text-blue-200 font-bold shadow-sm' 
                                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                                    }`}
                                 >
                                     {p.label.split(' ')[0]}
                                 </button>
                             ))}
                        </div>
                    </div>
                     <div>
                        <Slider 
                            label="マップ拡大率" 
                            value={config.zoom || 1.0} 
                            min={1.0} 
                            max={8.0} 
                            step={0.1} 
                            unit="x" 
                            color="blue"
                            onChange={(v: number) => updateConfig('zoom', v)} 
                            defaultValue={1.0} 
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-[10px] text-gray-300 transition-colors">
                             JSON読込
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileUpload} />
                    </div>
                </div>

                <div className="col-span-1 space-y-4">
                     <h3 className="text-xs font-bold text-green-400 uppercase border-b border-green-900/50 pb-1 mb-3">アクション</h3>
                     <button
                        onClick={handleRun}
                        disabled={isRunning || errors.length > 0}
                        className={`w-full py-3 font-bold text-xs rounded shadow-lg transition-all flex items-center justify-center gap-2 ${
                            isRunning 
                            ? 'bg-gray-800 text-gray-500 cursor-wait' 
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white active:scale-[0.98]'
                        }`}
                    >
                         {isRunning ? (
                             <>
                                <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                                計算中...
                             </>
                         ) : "シミュレーション実行"}
                    </button>
                    
                    <button
                        onClick={onExport}
                        disabled={isRunning}
                        className="w-full py-2 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-100 font-bold text-xs rounded border border-emerald-700/50 transition-colors flex items-center justify-center gap-2"
                    >
                        データ・画像出力 (ZIP)
                    </button>
                </div>

                <div className="col-span-1 bg-gray-900/50 rounded p-3 border border-gray-800">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-2">ステータス</h3>
                    <div className="text-xs text-gray-300 font-mono space-y-1">
                        <div className="flex justify-between"><span>状態:</span> <span className={isRunning ? 'text-blue-400' : 'text-green-400'}>{isRunning ? 'COMPUTING' : 'IDLE'}</span></div>
                        <div className="flex justify-between"><span>グリッド:</span> <span>{config.resolutionLat}x{config.resolutionLon}</span></div>
                        <div className="flex justify-between"><span>エラー:</span> <span className={errors.length > 0 ? "text-red-400 font-bold" : "text-gray-500"}>{errors.length}</span></div>
                        <div className="flex justify-between"><span>ズーム:</span> <span>x{(config.zoom || 1.0).toFixed(1)}</span></div>
                    </div>
                    {isRunning && (
                        <div className="mt-3 w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'planet' && (
             <div className="animate-[fadeIn_0.15s_ease-out]">
                 <h3 className="text-xs font-bold text-green-400 uppercase border-b border-green-900/50 pb-1 mb-3">惑星パラメータ</h3>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Slider label="半径" value={planet.radius} min={2000} max={15000} step={100} unit="km" color="green"
                        onChange={(v:number) => updatePlanet('radius', v)} defaultValue={EARTH_PARAMS.radius} />
                    
                    <Slider label="自転周期" value={planet.rotationPeriod} min={1} max={100} step={1} unit="h" color="green"
                        onChange={(v:number) => updatePlanet('rotationPeriod', v)} defaultValue={EARTH_PARAMS.rotationPeriod} />
                    
                    <Slider label="表面重力" value={planet.gravity} min={5} max={25} step={0.1} unit="m/s²" color="green"
                        onChange={(v:number) => updatePlanet('gravity', v)} defaultValue={EARTH_PARAMS.gravity} />
                    
                    <button
                        onClick={() => updatePlanet('isRetrograde', !planet.isRetrograde)}
                        className={`h-full flex flex-col items-center justify-center p-2 rounded border transition-all ${
                            planet.isRetrograde 
                            ? 'bg-orange-900/20 border-orange-600/50 text-orange-200' 
                            : 'bg-green-900/20 border-green-600/50 text-green-200'
                        }`}
                    >
                        <span className="text-[10px] font-bold uppercase mb-1">自転方向</span>
                        <div className="flex items-center gap-2 text-sm font-bold">
                            {planet.isRetrograde ? '逆行 (Retrograde)' : '順行 (Prograde)'}
                            <span className="text-lg">{planet.isRetrograde ? '⟲' : '⟳'}</span>
                        </div>
                    </button>
                 </div>
             </div>
        )}

        {activeTab === 'orbit' && (
            <div className="animate-[fadeIn_0.15s_ease-out] flex flex-col h-full">
                <h3 className="text-xs font-bold text-orange-400 uppercase border-b border-orange-900/50 pb-1 mb-3">軌道設定</h3>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Slider label="太陽光度" value={planet.solarLuminosity} min={0.5} max={2.0} step={0.01} unit="x Sun" color="orange"
                        onChange={(v:number) => updatePlanet('solarLuminosity', v)} defaultValue={EARTH_PARAMS.solarLuminosity} />
                    
                    <Slider label="軌道長半径" value={planet.semiMajorAxis} min={0.5} max={2.0} step={0.01} unit="AU" color="orange"
                        onChange={(v:number) => updatePlanet('semiMajorAxis', v)} defaultValue={EARTH_PARAMS.semiMajorAxis} />
                    
                    <Slider label="公転周期" value={planet.orbitalPeriod} min={1000} max={20000} step={100} unit="h" color="orange"
                        onChange={(v:number) => updatePlanet('orbitalPeriod', v)} defaultValue={EARTH_PARAMS.orbitalPeriod} />
                    
                    <Slider label="離心率" value={planet.eccentricity} min={0} max={0.2} step={0.001} unit="" color="orange"
                        onChange={(v:number) => updatePlanet('eccentricity', v)} defaultValue={EARTH_PARAMS.eccentricity} />
                </div>

                <div className="flex-1 grid grid-cols-2 gap-4">
                    <div className="col-span-1">
                        <CircularDial 
                            label="近日点引数 (Perihelion)" 
                            value={planet.perihelionAngle} 
                            min={0} 
                            max={360} 
                            unit="°" 
                            onChange={(v:number) => updatePlanet('perihelionAngle', v)} 
                            defaultValue={EARTH_PARAMS.perihelionAngle} 
                        />
                    </div>
                    <div className="col-span-1">
                         <QuadrantDial 
                            label="地軸傾斜角 (Obliquity)" 
                            value={planet.obliquity} 
                            min={0} 
                            max={90} 
                            unit="°" 
                            onChange={(v:number) => updatePlanet('obliquity', v)} 
                            defaultValue={EARTH_PARAMS.obliquity} 
                        />
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'atmos' && (
            <div className="animate-[fadeIn_0.15s_ease-out]">
                 <h3 className="text-xs font-bold text-purple-400 uppercase border-b border-purple-900/50 pb-1 mb-3">大気・海洋</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <Slider label="地表気圧" value={atm.surfacePressure} min={0.1} max={5} step={0.1} unit="bar" color="purple"
                        onChange={(v:number) => updateAtm('surfacePressure', v)} defaultValue={EARTH_ATMOSPHERE.surfacePressure} />

                    <Slider label="温室効果係数" value={atm.greenhouseFactor} min={0} max={5} step={0.1} unit="x Earth" color="purple"
                        onChange={(v:number) => updateAtm('greenhouseFactor', v)} defaultValue={EARTH_ATMOSPHERE.greenhouseFactor} />
                    
                    <Slider label="熱輸送効率" value={atm.meridionalTransport} min={0} max={300} step={1} unit="coeff" color="purple"
                        onChange={(v:number) => updateAtm('meridionalTransport', v)} defaultValue={EARTH_ATMOSPHERE.meridionalTransport} />
                    
                    <Slider label="海洋熱容量" value={atm.heatCapacityOcean} min={0.1} max={5.0} step={0.1} unit="x" color="purple"
                        onChange={(v:number) => updateAtm('heatCapacityOcean', v)} defaultValue={EARTH_ATMOSPHERE.heatCapacityOcean} />
                 </div>
            </div>
        )}

        {activeTab === 'physics' && (
            <div className="animate-[fadeIn_0.15s_ease-out]">
                 <div className="flex justify-between items-center border-b border-red-900/50 pb-1 mb-3">
                     <h3 className="text-xs font-bold text-red-400 uppercase">物理エンジン・チューニング</h3>
                     <span className="text-[9px] text-gray-500 uppercase tracking-wider">Step 1: ITCZ Circulation</span>
                 </div>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800 hover:border-red-900/30 transition-colors">
                        <div className="text-[9px] font-bold text-gray-500 mb-2 uppercase">1.2 影響マップ係数</div>
                        <div className="space-y-1">
                            <Slider label="飽和距離" value={phys.itczSaturationDist} min={100} max={5000} step={100} unit="km" color="red"
                                onChange={(v:number) => updatePhys('itczSaturationDist', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.itczSaturationDist} />
                            <Slider label="限界高度" value={phys.itczAltitudeLimit} min={0.5} max={10} step={0.1} unit="km" color="red"
                                onChange={(v:number) => updatePhys('itczAltitudeLimit', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.itczAltitudeLimit} />
                        </div>
                    </div>

                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800 hover:border-red-900/30 transition-colors">
                        <div className="text-[9px] font-bold text-gray-500 mb-2 uppercase">1.3 惑星係数</div>
                        <div className="space-y-1">
                            <Slider label="慣性指数" value={phys.itczInertiaExp} min={0.1} max={2.0} step={0.1} unit="exp" color="red"
                                onChange={(v:number) => updatePhys('itczInertiaExp', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.itczInertiaExp} />
                            <Slider label="海:移動率" value={phys.itczBaseSeaRatio} min={0} max={1.5} step={0.05} unit="x" color="red"
                                onChange={(v:number) => updatePhys('itczBaseSeaRatio', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.itczBaseSeaRatio} />
                            <Slider label="陸:移動率" value={phys.itczBaseLandRatio} min={0} max={1.5} step={0.05} unit="x" color="red"
                                onChange={(v:number) => updatePhys('itczBaseLandRatio', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.itczBaseLandRatio} />
                        </div>
                    </div>
                 </div>

                 <div className="flex justify-between items-center border-b border-cyan-900/50 pb-1 mb-3 mt-4">
                     <h3 className="text-xs font-bold text-cyan-400 uppercase">Step 2: Ocean Currents</h3>
                     <span className="text-[9px] text-gray-500 uppercase tracking-wider">Pass 2.0 - 2.3</span>
                 </div>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-20">
                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800 hover:border-cyan-900/30 transition-colors">
                        <div className="text-[9px] font-bold text-gray-500 mb-2 uppercase">2.0 Collision & Spawn</div>
                        <div className="space-y-1">
                             <Slider label="衝突バッファ" value={phys.oceanCollisionBuffer} min={0} max={maxCollisionBuffer} step={10} unit="km" color="cyan"
                                onChange={(v:number) => updatePhys('oceanCollisionBuffer', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanCollisionBuffer} />
                             <Slider label="平滑化強度" value={phys.oceanSmoothing} min={0} max={10} step={1} unit="iter" color="cyan"
                                onChange={(v:number) => updatePhys('oceanSmoothing', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanSmoothing} />
                             <Slider label="スポーン距離" value={phys.oceanSpawnOffset || 1000} min={0} max={maxSpawnOffset} step={100} unit="km" color="cyan"
                                onChange={(v:number) => updatePhys('oceanSpawnOffset', v)} defaultValue={1000} />
                        </div>
                    </div>

                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800 hover:border-cyan-900/30 transition-colors">
                        <div className="text-[9px] font-bold text-gray-500 mb-2 uppercase">2.1 Base Physics</div>
                        <div className="space-y-1">
                             <Slider label="シミュレーション歩数" value={phys.oceanStreamlineSteps || 500} min={100} max={2000} step={100} unit="steps" color="cyan"
                                onChange={(v:number) => updatePhys('oceanStreamlineSteps', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanStreamlineSteps} />
                             <Slider label="流速係数" value={phys.oceanBaseSpeed} min={0.5} max={5.0} step={0.1} unit="x" color="cyan"
                                onChange={(v:number) => updatePhys('oceanBaseSpeed', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanBaseSpeed} />
                             <Slider label="ITCZ引力" value={phys.oceanPatternForce} min={0.01} max={0.5} step={0.01} unit="k" color="cyan"
                                onChange={(v:number) => updatePhys('oceanPatternForce', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanPatternForce} />
                             <Slider label="拡散限界" value={phys.oceanDeflectLat} min={5} max={45} step={1} unit="deg" color="cyan"
                                onChange={(v:number) => updatePhys('oceanDeflectLat', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanDeflectLat} />
                        </div>
                    </div>

                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800 hover:border-cyan-900/30 transition-colors">
                        <div className="text-[9px] font-bold text-gray-500 mb-2 uppercase">2.2 EC Tuning</div>
                        <div className="space-y-1">
                             <Slider label="EC 引力係数" value={phys.oceanEcPatternForce} min={0.01} max={0.5} step={0.01} unit="P" color="cyan"
                                onChange={(v:number) => updatePhys('oceanEcPatternForce', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanEcPatternForce} />
                             <Slider label="EC 制動(Damp)" value={phys.oceanEcDamping} min={0} max={1.0} step={0.05} unit="D" color="cyan"
                                onChange={(v:number) => updatePhys('oceanEcDamping', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanEcDamping} />
                             <Slider label="分離幅 (Gap)" value={phys.oceanEcLatGap} min={2.0} max={20.0} step={0.5} unit="deg" color="cyan"
                                onChange={(v:number) => updatePhys('oceanEcLatGap', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanEcLatGap} />
                             <Slider label="極方向ドリフト" value={phys.oceanEcPolewardDrift} min={0} max={5.0} step={0.1} unit="vy" color="cyan"
                                onChange={(v:number) => updatePhys('oceanEcPolewardDrift', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanEcPolewardDrift} />
                        </div>
                    </div>
                    
                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800 hover:border-cyan-900/30 transition-colors">
                        <div className="text-[9px] font-bold text-gray-500 mb-2 uppercase">2.3 Advanced Flow</div>
                        <div className="space-y-1">
                             <Slider label="スポーン速度" value={phys.oceanSpawnSpeedMultiplier} min={0.1} max={2.0} step={0.1} unit="x" color="cyan"
                                onChange={(v:number) => updatePhys('oceanSpawnSpeedMultiplier', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanSpawnSpeedMultiplier} />
                             <Slider label="這行速度" value={phys.oceanCrawlSpeedMultiplier} min={0.1} max={3.0} step={0.1} unit="x" color="cyan"
                                onChange={(v:number) => updatePhys('oceanCrawlSpeedMultiplier', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanCrawlSpeedMultiplier} />
                             <Slider label="最大速度Cap" value={phys.oceanMaxSpeedMultiplier} min={1.0} max={10.0} step={0.5} unit="x" color="cyan"
                                onChange={(v:number) => updatePhys('oceanMaxSpeedMultiplier', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanMaxSpeedMultiplier} />
                             <Slider label="慣性 (X)" value={phys.oceanInertiaX} min={0.01} max={0.5} step={0.01} unit="ratio" color="cyan"
                                onChange={(v:number) => updatePhys('oceanInertiaX', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanInertiaX} />
                             <Slider label="沿岸反発力" value={phys.oceanRepulseStrength} min={0.0} max={2.0} step={0.1} unit="str" color="cyan"
                                onChange={(v:number) => updatePhys('oceanRepulseStrength', v)} defaultValue={DEFAULT_PHYSICS_PARAMS.oceanRepulseStrength} />
                        </div>
                    </div>
                 </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Controls;