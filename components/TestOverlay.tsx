
import React, { useState } from 'react';
import { analyzeSimulation, TestResult } from '../utils/testSuite';
import { SimulationResult } from '../types';

interface Props {
    onClose: () => void;
    currentResult: SimulationResult | null;
}

const TestOverlay: React.FC<Props> = ({ onClose, currentResult }) => {
    const [results, setResults] = useState<TestResult[] | null>(null);

    const runDiagnostics = () => {
        if (!currentResult) {
            setResults([{ name: "データエラー", passed: false, message: "解析可能なシミュレーションデータが存在しません。" }]);
            return;
        }
        const res = analyzeSimulation(currentResult);
        setResults(res);
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 p-6 rounded-lg shadow-2xl w-[32rem] max-h-[80vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                    システム診断 & 物理エンジン解析
                </h2>
                
                {!results && (
                    <div className="text-center py-8">
                        <p className="text-gray-400 mb-6 text-sm">現在の解析結果をスキャンし、<br/>海流の生成過程における物理的な異常（停滞、早期消滅等）を検出します。</p>
                        <button 
                            onClick={runDiagnostics}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded font-bold transition-all shadow-lg hover:shadow-blue-500/30"
                        >
                            解析エンジンを起動
                        </button>
                    </div>
                )}

                {results && (
                    <div className="space-y-4">
                        {results.map((r, i) => (
                            <div key={i} className={`p-4 rounded border ${r.passed ? 'bg-green-900/20 border-green-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`font-bold text-sm ${r.passed ? 'text-green-400' : 'text-red-400'}`}>{r.name}</span>
                                    <span className={`text-xs uppercase font-bold px-2 py-0.5 rounded ${r.passed ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{r.passed ? '正常' : '異常あり'}</span>
                                </div>
                                <p className="text-xs text-gray-300 font-mono mt-1">{r.message}</p>
                                {r.details && (
                                    <pre className="mt-2 p-2 bg-black/50 rounded text-[10px] text-gray-400 overflow-x-auto border border-gray-800">
                                        {r.details}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-800">
                     {results && (
                         <button 
                            onClick={runDiagnostics}
                            className="text-xs text-gray-400 hover:text-white underline mr-auto"
                        >
                            再実行
                        </button>
                     )}
                    <button 
                        onClick={onClose}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TestOverlay;
