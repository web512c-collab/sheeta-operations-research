/**
 * Sheeta Operations Research
 * Multi-Scenario Simulation Engine (Monte Carlo & Parameter Sweep)
 */

import {
  DistributionType,
  LpProblem,
  ScenarioRun,
  SimulationSummary,
  SimulationType,
  StochasticParam,
} from '../types';
import { solveBranchAndBound } from './branchAndBound';
import { snapZero } from './matrix';
import { solvePertCpm } from './pertCpm';
import { solveEoq, solveQueuing } from './queuingEoq';
import { solveTwoPhaseSimplex } from './simplexTwoPhase';
import { solveTransportation } from './transportation';

export interface RunSimulationOptions {
  type: SimulationType;
  numScenarios: number;
  param: StochasticParam;
  baseProblem: any;
  shouldCancel?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}

export function runSimulationBatch(options: RunSimulationOptions): SimulationSummary {
  const { type, numScenarios, param, baseProblem, shouldCancel, onProgress } = options;
  const scenarios: ScenarioRun[] = [];

  const isSweep = type === 'parameter_sweep';
  const sweepStart = param.sweepStart ?? param.min;
  const sweepEnd = param.sweepEnd ?? param.max;
  const sweepSteps = Math.max(2, isSweep ? numScenarios : 2);

  for (let i = 0; i < numScenarios; i++) {
    if (shouldCancel && shouldCancel()) {
      break;
    }

    let sampledVal = 0;
    if (isSweep) {
      const stepSize = (sweepEnd - sweepStart) / (sweepSteps - 1);
      sampledVal = sweepStart + i * stepSize;
    } else {
      sampledVal = sampleDistribution(param.distribution, param);
    }

    // Apply sampledVal to cloned problem
    const clonedProblem = JSON.parse(JSON.stringify(baseProblem));
    applyParamToProblem(clonedProblem, param.paramKey, sampledVal, param.targetModule);

    // Solve cloned problem
    const result = evaluateProblem(clonedProblem, param.targetModule);

    scenarios.push({
      id: i + 1,
      title: `Scenario #${i + 1} (${param.label} = ${sampledVal.toFixed(2)})`,
      paramValues: { [param.paramKey]: snapZero(sampledVal) },
      objectiveValue: snapZero(result.objectiveValue),
      isFeasible: result.isFeasible,
      status: result.status,
      summary: result.summary,
      problemSnapshot: clonedProblem,
    });

    if (onProgress && (i % 10 === 0 || i === numScenarios - 1)) {
      onProgress(i + 1, numScenarios);
    }
  }

  // Calculate statistics over feasible scenarios
  const feasibleScenarios = scenarios.filter((s) => s.isFeasible);
  const feasibleCount = feasibleScenarios.length;
  const infeasibleCount = scenarios.length - feasibleCount;

  const isMinimize =
    param.targetModule === 'transportation' ||
    param.targetModule === 'queuing_eoq' ||
    (param.targetModule === 'lp' && baseProblem?.sense === 'minimize');

  let bestValue = 0;
  let worstValue = 0;
  let meanValue = 0;
  let medianValue = 0;
  let stdDevValue = 0;

  if (feasibleCount > 0) {
    const values = feasibleScenarios.map((s) => s.objectiveValue).sort((a, b) => a - b);
    bestValue = isMinimize ? values[0] : values[values.length - 1];
    worstValue = isMinimize ? values[values.length - 1] : values[0];
    const sum = values.reduce((acc, v) => acc + v, 0);
    meanValue = sum / feasibleCount;

    // Median
    const mid = Math.floor(values.length / 2);
    medianValue = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];

    // Standard deviation
    const variance = values.reduce((acc, v) => acc + Math.pow(v - meanValue, 2), 0) / feasibleCount;
    stdDevValue = Math.sqrt(variance);
  }

  // Generate distribution histogram bins
  const distributionBins = generateHistogramBins(feasibleScenarios.map((s) => s.objectiveValue), 10);

  return {
    type,
    totalScenarios: scenarios.length,
    feasibleCount,
    infeasibleCount,
    bestValue: snapZero(bestValue),
    worstValue: snapZero(worstValue),
    meanValue: snapZero(meanValue),
    medianValue: snapZero(medianValue),
    stdDevValue: snapZero(stdDevValue),
    distributionBins,
    scenarios,
  };
}

/**
 * Samples from specified probability distribution
 */
function sampleDistribution(dist: DistributionType, param: StochasticParam): number {
  if (dist === 'uniform') {
    return param.min + Math.random() * (param.max - param.min);
  }

  if (dist === 'triangular') {
    const a = param.min;
    const b = param.max;
    const c = param.mode;
    const u = Math.random();
    const fc = (c - a) / (b - a);
    if (u < fc) {
      return a + Math.sqrt(u * (b - a) * (c - a));
    }
    return b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }

  // Normal distribution (Box-Muller)
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const val = param.mean + z0 * param.stdDev;
  return Math.max(param.min, Math.min(param.max, val));
}

/**
 * Modifies base problem by injecting the sampled parameter value
 */
function applyParamToProblem(problem: any, key: string, val: number, module: string): void {
  if (module === 'lp') {
    const lp = problem as LpProblem;
    if (key.startsWith('rhs_')) {
      const idOrIdx = key.replace('rhs_', '');
      const idx = parseInt(idOrIdx, 10);
      if (!isNaN(idx) && lp.constraints && lp.constraints[idx]) {
        lp.constraints[idx].rhs = val;
      } else if (lp.constraints) {
        const found = lp.constraints.find((c) => c.id === idOrIdx);
        if (found) found.rhs = val;
      }
    } else if (key.startsWith('obj_')) {
      const idOrIdx = key.replace('obj_', '');
      const idx = parseInt(idOrIdx, 10);
      if (!isNaN(idx) && lp.variables && lp.variables[idx]) {
        lp.variables[idx].objCoeff = val;
      } else if (lp.variables) {
        const found = lp.variables.find((v) => v.id === idOrIdx);
        if (found) found.objCoeff = val;
      }
    }
  } else if (module === 'queuing_eoq') {
    if (key === 'annualDemand') problem.annualDemand = val;
    else if (key === 'orderCost') problem.orderCost = val;
    else if (key === 'holdingCost') problem.holdingCost = val;
    else if (key === 'arrivalRate') problem.arrivalRate = val;
    else if (key === 'serviceRate') problem.serviceRate = val;
  } else if (module === 'pert') {
    const activities = problem as any[];
    if (key.startsWith('act_')) {
      const id = key.replace('act_', '');
      const act = activities.find((a) => a.id === id);
      if (act) act.duration = val;
    }
  } else if (module === 'transportation') {
    if (key.startsWith('demand_')) {
      const idx = parseInt(key.replace('demand_', ''), 10);
      if (problem.destinations && problem.destinations[idx]) problem.destinations[idx].demand = val;
    } else if (key.startsWith('supply_')) {
      const idx = parseInt(key.replace('supply_', ''), 10);
      if (problem.sources && problem.sources[idx]) problem.sources[idx].capacity = val;
    }
  }
}

/**
 * Solves modified problem and returns outcome
 */
function evaluateProblem(problem: any, module: string): {
  objectiveValue: number;
  isFeasible: boolean;
  status: string;
  summary: string;
} {
  try {
    if (module === 'lp') {
      const lp = problem as LpProblem;
      if (lp.isIntegerProgram) {
        const res = solveBranchAndBound(lp, { maxNodes: 200, timeoutMs: 2000 });
        const feasible = res.status === 'optimal' || res.status === 'feasible_timeout';
        return {
          objectiveValue: res.bestObjectiveValue ?? 0,
          isFeasible: feasible,
          status: res.status,
          summary: feasible ? `Optimal Integer Z = ${res.bestObjectiveValue?.toFixed(2)}` : 'Infeasible',
        };
      }
      const res = solveTwoPhaseSimplex(lp);
      return {
        objectiveValue: res.objectiveValue,
        isFeasible: res.status === 'optimal',
        status: res.status,
        summary: res.status === 'optimal' ? `Optimal Z = ${res.objectiveValue.toFixed(2)}` : res.status,
      };
    }

    if (module === 'transportation') {
      const res = solveTransportation(problem);
      return {
        objectiveValue: res.totalCost,
        isFeasible: true,
        status: 'optimal',
        summary: `Total Cost = ${res.totalCost.toFixed(2)}`,
      };
    }

    if (module === 'pert') {
      const res = solvePertCpm(problem);
      return {
        objectiveValue: res.totalDuration,
        isFeasible: true,
        status: 'completed',
        summary: `Duration = ${res.totalDuration.toFixed(1)} (Critical Path: ${res.criticalPath.join(' → ')})`,
      };
    }

    if (module === 'queuing_eoq') {
      if ('arrivalRate' in problem) {
        const res = solveQueuing(problem);
        return {
          objectiveValue: res.w,
          isFeasible: res.w !== Infinity,
          status: res.w !== Infinity ? 'optimal' : 'unstable',
          summary: `System Time W = ${res.w.toFixed(2)}, L = ${res.l.toFixed(2)}`,
        };
      }
      const res = solveEoq(problem);
      return {
        objectiveValue: res.totalAnnualCost,
        isFeasible: true,
        status: 'optimal',
        summary: `Optimal Q = ${res.optimalQty.toFixed(0)}, Total Cost = $${res.totalAnnualCost.toFixed(2)}`,
      };
    }
  } catch (err: any) {
    return {
      objectiveValue: 0,
      isFeasible: false,
      status: 'error',
      summary: err?.message || 'Error',
    };
  }

  return {
    objectiveValue: 0,
    isFeasible: true,
    status: 'completed',
    summary: 'OK',
  };
}

/**
 * Builds frequency distribution histogram bins
 */
function generateHistogramBins(
  values: number[],
  numBins: number = 10
): { binStart: number; binEnd: number; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (Math.abs(max - min) < 1e-6) {
    return [{ binStart: min - 1, binEnd: max + 1, count: values.length }];
  }

  const binWidth = (max - min) / numBins;
  const bins: { binStart: number; binEnd: number; count: number }[] = [];

  for (let b = 0; b < numBins; b++) {
    bins.push({
      binStart: min + b * binWidth,
      binEnd: min + (b + 1) * binWidth,
      count: 0,
    });
  }

  for (const v of values) {
    let placed = false;
    for (let b = 0; b < numBins; b++) {
      if (v >= bins[b].binStart && (b === numBins - 1 ? v <= bins[b].binEnd : v < bins[b].binEnd)) {
        bins[b].count++;
        placed = true;
        break;
      }
    }
    if (!placed && bins.length > 0) {
      bins[bins.length - 1].count++;
    }
  }

  return bins;
}
