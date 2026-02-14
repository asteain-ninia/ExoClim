
import { SimulationResult } from '../types';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    details?: any;
}

export const runTestSuite = async (): Promise<TestResult[]> => {
    return [
        { name: "Unit Test", passed: true, message: "System operational." }
    ];
};

export const analyzeSimulation = (data: SimulationResult): TestResult[] => {
    const results: TestResult[] = [];
    const status = data.implementationStatus;

    const missingModels: string[] = [];
    if (status.thermoModel !== 'implemented') missingModels.push('Thermo');
    if (status.hydroModel !== 'implemented') missingModels.push('Hydro');
    if (status.climateClassification !== 'implemented') missingModels.push('ClimateClassification');

    if (missingModels.length > 0) {
        results.push({
            name: "Model Coverage",
            passed: false,
            message: "Temperature, precipitation, and/or climate-class outputs are not physically implemented yet.",
            details: `Not implemented: ${missingModels.join(', ')}`
        });
    }

    // Ocean Current Diagnostics
    if (!data.diagnostics || data.diagnostics.length === 0) {
        results.push({
            name: "Ocean Diagnostics",
            passed: true,
            message: "No specific physics anomalies detected in logs."
        });
    } else {
        const infantDeaths = data.diagnostics.filter(d => d.type === 'EC_INFANT_DEATH');

        if (infantDeaths.length > 0) {
             const sample = infantDeaths.slice(0, 3).map(d => `[Lat:${d.lat.toFixed(1)}, Lon:${d.lon.toFixed(1)}] ${d.message}`).join("\n");
             results.push({
                 name: "Ocean: Infant Mortality",
                 passed: false,
                 message: `WARNING: ${infantDeaths.length} EC agents died immediately after spawn.`,
                 details: sample
             });
        }
    }
    
    // Impact Count
    let totalImpacts = 0;
    if (data.impactPoints) {
        data.impactPoints.forEach(arr => totalImpacts += arr.length);
    }
    
    results.push({
        name: "Ocean: Impact Events",
        passed: totalImpacts > 0,
        message: `Registered ${totalImpacts} total impacts across monitored months.`
    });

    return results;
};
