import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Controls from './components/Controls';
import MapVisualizer from './components/MapVisualizer';
import Charts from './components/Charts';
import TestOverlay from './components/TestOverlay';
import OceanDebugView from './components/OceanDebugView';
import WindDebugView from './components/WindDebugView';
import { EARTH_PARAMS, EARTH_ATMOSPHERE, DEFAULT_CONFIG, DEFAULT_PHYSICS_PARAMS } from './constants';
import { runSimulation } from './services/climateEngine.ts';
import { initializeGrid } from './services/geography';
import { exportAllData } from './services/exporter';
import { PlanetParams, AtmosphereParams, SimulationResult, SimulationConfig, PhysicsParams } from './types';

const App: React.FC = () => {
  const [planet, setPlanet] = useState<PlanetParams>(EARTH_PARAMS);
  const [atm, setAtm] = useState<AtmosphereParams>(EARTH_ATMOSPHERE);
  const [phys, setPhys] = useState<PhysicsParams>(DEFAULT_PHYSICS_PARAMS);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState("初期化中...");
  const [showTests, setShowTests] = useState(false);
  const [showOceanDebug, setShowOceanDebug] = useState(false);
  const [showWindDebug, setShowWindDebug] = useState(false);
  
  // 'annual' or 0 (Jan) or 6 (July)
  const [displayMonth, setDisplayMonth] = useState<'annual' | 0 | 6>('annual');
  
  const [viewMode, setViewMode] = useState<string>('elevation');
  const [mapSize, setMapSize] = useState({ width: 800, height: 400 });
  
  const [processingStep, setProcessingStep] = useState<string | null>(null);

  // Unit J: Effective Physics Calculation
  // Derived from the wind belt analysis if available, otherwise fallback to raw physics params.
  const effectivePhys = useMemo(() => {
    if (!result || !result.wind) return phys;
    return { ...phys, oceanEcLatGap: result.wind.oceanEcLatGapDerived };
  }, [phys, result]);

  // Initial Load
  useEffect(() => {
    const init = async () => {
        const grid = initializeGrid(
          DEFAULT_CONFIG.resolutionLat,
          DEFAULT_CONFIG.resolutionLon,
          DEFAULT_CONFIG.startingMap,
          DEFAULT_CONFIG.customMap
        );
        setIsRunning(true);
        const res = await runSimulation(grid, EARTH_PARAMS, EARTH_ATMOSPHERE, DEFAULT_PHYSICS_PARAMS, DEFAULT_CONFIG, () => {});
        setResult(res);
        setIsRunning(false);
    };
    init();
  }, []);

  useEffect(() => {
    const handleResize = () => {
        const container = document.getElementById('map-container');
        if (container) {
            setMapSize({ width: container.clientWidth, height: container.clientHeight });
        }
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRun = useCallback(async (overrideConfig?: Partial<SimulationConfig>) => {
    setIsRunning(true);
    setProgress(0);
    setLoadingLabel("グリッド生成中...");
    setProcessingStep("elevation");
    
    setTimeout(async () => {
        const runConfig = { ...config, ...overrideConfig };
        const grid = initializeGrid(
          runConfig.resolutionLat,
          runConfig.resolutionLon,
          runConfig.startingMap,
          runConfig.customMap
        );
        const res = await runSimulation(grid, planet, atm, phys, runConfig, (p, label, stepId) => {
             setProgress(p);
             if (label) setLoadingLabel(label);
             if (stepId) setProcessingStep(stepId);
        });
        setResult(res);
        setIsRunning(false);
        setProcessingStep(null);
    }, 100);
  }, [planet, atm, phys, config]);

  const handleExport = useCallback(async () => {
    if (!result) return;
    setIsRunning(true);
    setLoadingLabel("データをエクスポート中...");
    setProgress(100);

    setTimeout(async () => {
        try {
            await exportAllData(planet, atm, phys, config, result, 'charts-main-container');
        } catch (e) {
            console.error("Export failed", e);
            alert("エクスポート中にエラーが発生しました。");
        }
        setIsRunning(false);
        setLoadingLabel("完了");
    }, 100);
  }, [planet, atm, phys, config, result]);

  const PIPELINE_STEPS = [
      { id: 'elevation', label: '地形データ', desc: '標高・起伏', subSteps: [] },
      { id: 'distCoast', label: 'Step 0', desc: '海岸距離', subSteps: [] },
      { id: 'step1', label: 'Step 1', desc: 'ITCZ', subSteps: [
          { id: 'itcz_heatmap', label: '1.1 熱影響' },
          { id: 'itcz_result', label: '1.6 算出緯度' }
      ]},
      { id: 'step2', label: 'Step 2', desc: '風帯解析', subSteps: [
          { id: 'wind', label: '2.1 帯状風' },
          { id: 'wind_belts', label: '2.2 風帯デバッグ' }
      ]},
      { id: 'step3', label: 'Step 3', desc: '海流解析', subSteps: [
          { id: 'ocean_collision', label: '3.0 衝突判定'},
          { id: 'oceanCurrent', label: '3.1 循環流' }
      ]},
      { id: 'step4', label: 'Step 4', desc: '気流詳細', subSteps: [] },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 text-gray-100 font-sans relative overflow-hidden">
      {showTests && <TestOverlay onClose={() => setShowTests(false)} currentResult={result} />}
      
      {/* Ocean Debug Overlay */}
      {showOceanDebug && result && (
          <OceanDebugView 
             grid={result.grid}
             itczLines={result.itczLines}
             config={config}
             phys={phys} // Raw phys for "Configured" display
             effectivePhys={effectivePhys} // Effective phys for re-calculation and guides
             planet={planet}
             cellCount={result.cellCount}
             hadleyWidth={result.hadleyWidth}
             onClose={() => setShowOceanDebug(false)}
          />
      )}

      {/* Wind Debug Overlay */}
      {showWindDebug && result && (
          <WindDebugView 
             result={result}
             onClose={() => setShowWindDebug(false)}
          />
      )}

      {/* Top Section: Map & Charts */}
      <div className="flex-1 flex flex-row min-h-0">
        
        {/* Main Map Area */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
             {/* Header / Tabs */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900 gap-4 shrink-0 overflow-x-auto">
                <div className="flex items-center gap-4 shrink-0">
                  <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2 min-w-max">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      ExoClim <span className="text-xs font-normal text-gray-400 ml-1">惑星気候シミュレーター</span>
                  </h1>

                  {/* Season Toggle */}
                  <div className="flex items-center bg-gray-800 p-0.5 rounded-lg border border-gray-700 ml-4 shadow-inner">
                      <button 
                        onClick={() => setDisplayMonth(0)}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors flex flex-col items-center leading-none ${displayMonth === 0 ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
                        title="1月: 北半球 冬 / 南半球 夏"
                      >
                        <span>1月</span>
                        <span className="text-[8px] opacity-70 font-normal">Jan</span>
                      </button>
                      <button 
                        onClick={() => setDisplayMonth(6)}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors flex flex-col items-center leading-none ${displayMonth === 6 ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
                        title="7月: 北半球 夏 / 南半球 冬"
                      >
                        <span>7月</span>
                        <span className="text-[8px] opacity-70 font-normal">Jul</span>
                      </button>
                      <div className="w-px h-4 bg-gray-700 mx-1"></div>
                      <button 
                        onClick={() => setDisplayMonth('annual')}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors flex flex-col items-center leading-none ${displayMonth === 'annual' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
                      >
                        <span>年平均</span>
                        <span className="text-[8px] opacity-70 font-normal">Avg</span>
                      </button>
                  </div>
                </div>
                
                <div className="flex overflow-x-auto gap-1 bg-gray-800 p-0.5 rounded-lg max-w-full custom-scrollbar ml-auto">
                    {PIPELINE_STEPS.map((step) => {
                        const isProcessing = processingStep === step.id;
                        const isSelected = viewMode === step.id || step.subSteps?.some(s => s.id === viewMode);
                        const isStep1 = step.id === 'step1';
                        const isStep2 = step.id === 'step2';
                        const isStep3 = step.id === 'step3';

                        return (
                            <div key={step.id} className="flex gap-0.5">
                                <button
                                    onClick={() => {
                                        if (step.subSteps && step.subSteps.length > 0) {
                                            setViewMode(step.subSteps[0].id);
                                        } else {
                                            setViewMode(step.id);
                                        }
                                    }}
                                    className={`flex flex-col items-center justify-center px-3 py-2 rounded-md min-w-[80px] transition-all relative overflow-hidden h-auto ${
                                        isSelected
                                        ? 'bg-blue-600 text-white shadow-lg z-10' 
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                    } ${isProcessing ? 'border border-yellow-500/50 bg-gray-800' : ''}`}
                                    title={step.desc}
                                >
                                    {isProcessing && (
                                        <span className="absolute inset-0 bg-yellow-500/20 animate-pulse"></span>
                                    )}
                                    <span className={`text-[10px] font-bold whitespace-nowrap z-10 opacity-70 mb-0.5`}>
                                        {step.label}
                                    </span>
                                    <span className={`text-xs font-bold whitespace-nowrap z-10 ${isProcessing ? 'text-yellow-400' : ''}`}>
                                        {step.desc}
                                    </span>
                                </button>
                                
                                {(isStep1 || isStep2 || isStep3) && (
                                    <div className="flex flex-col gap-0.5 ml-0.5">
                                        {step.subSteps?.map(sub => (
                                            <button
                                                key={sub.id}
                                                onClick={() => setViewMode(sub.id)}
                                                className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded transition-colors flex-1 ${
                                                    viewMode === sub.id
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                }`}
                                            >
                                                {sub.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Map Canvas */}
            <div id="map-container" className="flex-1 relative bg-gray-950 overflow-hidden flex items-center justify-center">
                {result ? (
                    <MapVisualizer 
                        data={result} 
                        mode={viewMode as any} 
                        displayMonth={displayMonth}
                        width={mapSize.width} 
                        height={mapSize.height}
                        physicsParams={effectivePhys} // Unit J: Use effective params for visualization
                        zoom={config.zoom}
                        onZoomChange={(z) => setConfig(prev => ({...prev, zoom: z}))}
                    />
                ) : (
                    <div className="animate-pulse flex flex-col items-center text-gray-500">
                        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p>ヒューリスティック・エンジン起動中...</p>
                    </div>
                )}
            </div>
        </div>

        {/* Right Side: Vertical Charts */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
             <Charts data={result} displayMonth={displayMonth} />
        </div>

      </div>

      {/* Bottom Section: Controls */}
      <div className="h-64 flex-shrink-0 bg-gray-800 border-t border-gray-700 z-10 relative shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
         <Controls 
            planet={planet} 
            setPlanet={setPlanet} 
            atm={atm} 
            setAtm={setAtm} 
            phys={phys}
            setPhys={setPhys}
            config={config}
            setConfig={setConfig}
            onRun={handleRun} 
            onExport={handleExport}
            isRunning={isRunning}
            progress={progress}
            loadingLabel={loadingLabel}
        />
      </div>

      {/* Footer */}
      <div className="h-7 flex-shrink-0 bg-gray-950 border-t border-gray-800 flex items-center justify-between px-4 text-[10px] text-gray-500 select-none z-20 font-mono">
          <div className="flex gap-4 items-center">
               <span className="text-blue-400/80 font-bold hover:text-blue-300 transition-colors">ExoClim 演算エンジン v6.0</span>
               <span className="hidden sm:inline w-px h-3 bg-gray-800"></span>
               <span className="hidden sm:inline hover:text-gray-300 transition-colors">React 19 + D3.js + Recharts</span>
          </div>
          <div className="flex gap-4 items-center">
                <button 
                    onClick={() => setShowWindDebug(true)}
                    className="text-[10px] font-bold text-gray-400 hover:text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]"></span>
                    風帯デバッグ
                </button>
                <span className="hidden sm:inline w-px h-3 bg-gray-800"></span>
                <button 
                    onClick={() => setShowOceanDebug(true)}
                    className="text-[10px] font-bold text-gray-400 hover:text-red-400 hover:underline flex items-center gap-1.5 transition-colors"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></span>
                    海流デバッグ
                </button>
                <span className="hidden sm:inline w-px h-3 bg-gray-800"></span>
                <button 
                    onClick={() => setShowTests(true)}
                    className="text-[10px] font-bold text-gray-400 hover:text-white hover:underline flex items-center gap-1.5 transition-colors"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                    システム診断
                </button>
               <span className="hidden sm:inline w-px h-3 bg-gray-800"></span>
               <span className="hover:text-purple-300 transition-colors cursor-help text-purple-400/70" title="Logic & Code generated by Gemini 3.0 Pro">
                   Powered by Gemini 3.0 Pro
               </span>
               <span className="hidden sm:inline w-px h-3 bg-gray-800"></span>
               <span className="hover:text-gray-300 transition-colors">{new Date().toISOString().split('T')[0]}</span>
          </div>
      </div>
    </div>
  );
};

export default App;
