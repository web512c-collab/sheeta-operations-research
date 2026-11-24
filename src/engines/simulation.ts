/**
 * Sheeta Operations Research
 * Multi-Scenario Simulation Engine (Monte Carlo & Parameter Sweep)
 * Supports Pooled Parallel Worker Chunking, Settings Forwarding & Cooperative Cancellation
 */

import {
  DistributionType,
  LpProblem,
  ScenarioRun,
  SimulationSummary,
  SimulationType,
  SolverSettings,
  StochasticParam,
} from '../types';
import {
  PipelineOptions,
  runBbSolvePipeline,
  runBbSolvePipelineAsync,
  runLpSolvePipeline,
  runLpSolvePipelineAsync,
} from './lpSolvePipeline';
import { snapZero } from './matrix';
import { solvePertCpm } from './pertCpm';
import { solveEoq, solveQueuing } from './queuingEoq';
import { solveTransportation } from './transportation';

export interface RunSimulationOptions {
  type: SimulationType;
  numScenarios: number;
  param: StochasticParam;
  baseProblem: any;
  solverSettings?: Partial<SolverSettings>;
  shouldCancel?: () => boolean;
  cancelBuffer?: Int32Array;
  onProgress?: (completed: number, total: number) => void;
  yieldEveryScenarios?: number;
}

export interface ScenarioChunkItem {
  index: number;
  sampledVal: number;
}

function isCancelledNow(shouldCancel?: () => boolean, cancelBuffer?: Int32Array): boolean {
  if (cancelBuffer && Atomics.load(cancelBuffer, 0) !== 0) {
    return true;
  }
  return Boolean(shouldCancel && shouldCancel());
}

function buildPipelineOptions(
  solverSettings?: Partial<SolverSettings>,
  shouldCancel?: () => boolean,
  cancelBuffer?: Int32Array
): PipelineOptions {
  return {
    branchingStrategy: solverSettings?.branchingStrategy ?? 'most_fractional',
    maxNodes: solverSettings?.maxNodes ?? 2000,
    maxDepth: solverSettings?.maxDepth ?? 60,
    timeoutMs: (solverSettings?.timeoutSeconds ?? 30) * 1000,
    eps: solverSettings?.eps,
    pivotEps: solverSettings?.pivotEps,
    sparseEnabled: solverSettings?.sparseEnabled ?? true,
    shouldCancel,
    cancelBuffer,
  };
}

export function generateScenarioParamValues(
  type: SimulationType,
  numScenarios: number,
  param: StochasticParam
): number[] {
  const values: number[] = [];
  const isSweep = type === 'parameter_sweep';
  const sweepStart = param.sweepStart ?? param.min;
  const sweepEnd = param.sweepEnd ?? param.max;
  const sweepSteps = Math.max(2, isSweep ? numScenarios : 2);

  for (let i = 0; i < numScenarios; i++) {
    if (isSweep) {
      const stepSize = (sweepEnd - sweepStart) / (sweepSteps - 1);
      values.push(sweepStart + i * stepSize);
    } else {
      values.push(sampleDistribution(param.distribution, param));
    }
  }
  return values;
}

export function runSimulationBatch(options: RunSimulationOptions): SimulationSummary {
  const {
    type,
    numScenarios,
    param,
    baseProblem,
    solverSettings,
    shouldCancel,
    cancelBuffer,
    onProgress,
  } = options;

  const sampledVals = generateScenarioParamValues(type, numScenarios, param);
  const scenarios: ScenarioRun[] = [];
  let cancelled = false;

  for (let i = 0; i < sampledVals.length; i++) {
    if (isCancelledNow(shouldCancel, cancelBuffer)) {
      cancelled = true;
      break;
    }

    const sampledVal = sampledVals[i];
    const clonedProblem = JSON.parse(JSON.stringify(baseProblem));
    applyParamToProblem(clonedProblem, param.paramKey, sampledVal, param.targetModule);

    const result = evaluateProblemSync(
      clonedProblem,
      param.targetModule,
      solverSettings,
      shouldCancel,
      cancelBuffer
    );

    if (result.status === 'cancelled' || isCancelledNow(shouldCancel, cancelBuffer)) {
      cancelled = true;
      break;
    }

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

    if (onProgress && (i % 5 === 0 || i === sampledVals.length - 1)) {
      onProgress(i + 1, sampledVals.length);
    }
  }

  return aggregateSimulationResults(scenarios, type, param, baseProblem, {
    cancelled,
    workerPoolSize: 1,
    limitsUsed: solverSettings,
  });
}

export async function runSimulationBatchAsync(
  options: RunSimulationOptions
): Promise<SimulationSummary> {
  const {
    type,
    numScenarios,
    param,
    baseProblem,
    solverSettings,
    shouldCancel,
    cancelBuffer,
    onProgress,
    yieldEveryScenarios = 1,
  } = options;

  const sampledVals = generateScenarioParamValues(type, numScenarios, param);
  const items: ScenarioChunkItem[] = sampledVals.map((sampledVal, index) => ({
    index,
    sampledVal,
  }));

  const { scenarios, cancelled } = await evaluateScenarioChunkAsync(items, {
    param,
    baseProblem,
    solverSettings,
    shouldCancel,
    cancelBuffer,
    onProgress: onProgress
      ? (completed) => onProgress(completed, sampledVals.length)
      : undefined,
    yieldEveryScenarios,
  });

  return aggregateSimulationResults(scenarios, type, param, baseProblem, {
    cancelled,
    workerPoolSize: 1,
    limitsUsed: solverSettings,
  });
}

export async function evaluateScenarioChunkAsync(
  items: ScenarioChunkItem[],
  options: {
    param: StochasticParam;
    baseProblem: any;
    solverSettings?: Partial<SolverSettings>;
    shouldCancel?: () => boolean;
    cancelBuffer?: Int32Array;
    onProgress?: (completed: number, total: number) => void;
    yieldEveryScenarios?: number;
  }
): Promise<{ scenarios: ScenarioRun[]; cancelled: boolean }> {
  const {
    param,
    baseProblem,
    solverSettings,
    shouldCancel,
    cancelBuffer,
    onProgress,
    yieldEveryScenarios = 1,
  } = options;

  const scenarios: ScenarioRun[] = [];
  let cancelled = false;
  const total = items.length;

  for (let k = 0; k < items.length; k++) {
    if (isCancelledNow(shouldCancel, cancelBuffer)) {
      cancelled = true;
      break;
    }

    const { index, sampledVal } = items[k];
    const clonedProblem = JSON.parse(JSON.stringify(baseProblem));
    applyParamToProblem(clonedProblem, param.paramKey, sampledVal, param.targetModule);

    const result = await evaluateProblemAsync(
      clonedProblem,
      param.targetModule,
      solverSettings,
      shouldCancel,
      cancelBuffer
    );

    if (result.status === 'cancelled' || isCancelledNow(shouldCancel, cancelBuffer)) {
      cancelled = true;
      break;
    }

    scenarios.push({
      id: index + 1,
      title: `Scenario #${index + 1} (${param.label} = ${sampledVal.toFixed(2)})`,
      paramValues: { [param.paramKey]: snapZero(sampledVal) },
      objectiveValue: snapZero(result.objectiveValue),
      isFeasible: result.isFeasible,
      status: result.status,
      summary: result.summary,
      problemSnapshot: clonedProblem,
    });

    if (onProgress && (k % 2 === 0 || k === total - 1)) {
      onProgress(k + 1, total);
    }

    if ((k + 1) % Math.max(1, yieldEveryScenarios) === 0 && k < total - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return { scenarios, cancelled };
}

export function aggregateSimulationResults(
  scenarios: ScenarioRun[],
  type: SimulationType,
  param: StochasticParam,
  baseProblem: any,
  extras?: {
    cancelled?: boolean;
    workerPoolSize?: number;
    limitsUsed?: Partial<SolverSettings>;
  }
): SimulationSummary {
  const ordered = [...scenarios].sort((a, b) => a.id - b.id);
  const feasibleScenarios = ordered.filter((s) => s.isFeasible);
  const feasibleCount = feasibleScenarios.length;
  const infeasibleCount = ordered.length - feasibleCount;

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

    const mid = Math.floor(values.length / 2);
    medianValue = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];

    const variance =
      values.reduce((acc, v) => acc + Math.pow(v - meanValue, 2), 0) / feasibleCount;
    stdDevValue = Math.sqrt(variance);
  }

  const distributionBins = generateHistogramBins(
    feasibleScenarios.map((s) => s.objectiveValue),
    10
  );

  return {
    type,
    totalScenarios: ordered.length,
    feasibleCount,
    infeasibleCount,
    bestValue: snapZero(bestValue),
    worstValue: snapZero(worstValue),
    meanValue: snapZero(meanValue),
    medianValue: snapZero(medianValue),
    stdDevValue: snapZero(stdDevValue),
    distributionBins,
    scenarios: ordered,
    cancelled: extras?.cancelled,
    workerPoolSize: extras?.workerPoolSize,
    limitsUsed: extras?.limitsUsed,
  };
}

function sampleDistribution(dist: DistributionType, param: StochasticParam): number {
  if (dist === 'uniform') {
    return param.min + Math.random() * (param.max - param.min);
  }

  if (dist === 'triangular') {
    const a = param.min;
    const b = param.max;
    const c = Math.max(a, Math.min(b, param.mode));
    if (Math.abs(b - a) < 1e-12) return a;
    const u = Math.random();
    const fc = (c - a) / (b - a);
    if (u < fc) {
      return a + Math.sqrt(u * (b - a) * (c - a));
    }
    return b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }

  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const val = param.mean + z0 * param.stdDev;
  return Math.max(param.min, Math.min(param.max, val));
}

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

function evaluateProblemSync(
  problem: any,
  module: string,
  solverSettings?: Partial<SolverSettings>,
  shouldCancel?: () => boolean,
  cancelBuffer?: Int32Array
): {
  objectiveValue: number;
  isFeasible: boolean;
  status: string;
  summary: string;
} {
  try {
    if (module === 'lp') {
      const lp = problem as LpProblem;
      const enablePresolve = solverSettings?.presolveEnabled ?? true;
      const pipeOpts = buildPipelineOptions(solverSettings, shouldCancel, cancelBuffer);

      if (lp.isIntegerProgram) {
        const { bb } = runBbSolvePipeline(lp, enablePresolve, pipeOpts);
        if (bb.status === 'cancelled') {
          return { objectiveValue: 0, isFeasible: false, status: 'cancelled', summary: 'Cancelled' };
        }
        const feasible =
          bb.bestIntegerSolution !== undefined &&
          bb.status !== 'infeasible' &&
          bb.status !== 'unbounded';
        return {
          objectiveValue: bb.bestObjectiveValue ?? 0,
          isFeasible: feasible,
          status: bb.status,
          summary: feasible
            ? `${bb.status}: Z = ${bb.bestObjectiveValue?.toFixed(2)}`
            : bb.status,
        };
      }

      const { simplex } = runLpSolvePipeline(lp, enablePresolve, pipeOpts);
      if (simplex.status === 'cancelled') {
        return { objectiveValue: 0, isFeasible: false, status: 'cancelled', summary: 'Cancelled' };
      }
      return {
        objectiveValue: simplex.objectiveValue,
        isFeasible: simplex.status === 'optimal',
        status: simplex.status,
        summary:
          simplex.status === 'optimal'
            ? `Optimal Z = ${simplex.objectiveValue.toFixed(2)}`
            : simplex.status,
      };
    }

    return evaluateNonLpProblem(problem, module);
  } catch (err: any) {
    return {
      objectiveValue: 0,
      isFeasible: false,
      status: 'error',
      summary: err?.message || 'Error',
    };
  }
}

async function evaluateProblemAsync(
  problem: any,
  module: string,
  solverSettings?: Partial<SolverSettings>,
  shouldCancel?: () => boolean,
  cancelBuffer?: Int32Array
): Promise<{
  objectiveValue: number;
  isFeasible: boolean;
  status: string;
  summary: string;
}> {
  try {
    if (module === 'lp') {
      const lp = problem as LpProblem;
      const enablePresolve = solverSettings?.presolveEnabled ?? true;
      const pipeOpts = buildPipelineOptions(solverSettings, shouldCancel, cancelBuffer);

      if (lp.isIntegerProgram) {
        const { bb } = await runBbSolvePipelineAsync(lp, enablePresolve, pipeOpts);
        if (bb.status === 'cancelled') {
          return { objectiveValue: 0, isFeasible: false, status: 'cancelled', summary: 'Cancelled' };
        }
        const feasible =
          bb.bestIntegerSolution !== undefined &&
          bb.status !== 'infeasible' &&
          bb.status !== 'unbounded';
        return {
          objectiveValue: bb.bestObjectiveValue ?? 0,
          isFeasible: feasible,
          status: bb.status,
          summary: feasible
            ? `${bb.status}: Z = ${bb.bestObjectiveValue?.toFixed(2)}`
            : bb.status,
        };
      }

      const { simplex } = await runLpSolvePipelineAsync(lp, enablePresolve, pipeOpts);
      if (simplex.status === 'cancelled') {
        return { objectiveValue: 0, isFeasible: false, status: 'cancelled', summary: 'Cancelled' };
      }
      return {
        objectiveValue: simplex.objectiveValue,
        isFeasible: simplex.status === 'optimal',
        status: simplex.status,
        summary:
          simplex.status === 'optimal'
            ? `Optimal Z = ${simplex.objectiveValue.toFixed(2)}`
            : simplex.status,
      };
    }

    return evaluateNonLpProblem(problem, module);
  } catch (err: any) {
    return {
      objectiveValue: 0,
      isFeasible: false,
      status: 'error',
      summary: err?.message || 'Error',
    };
  }
}

function evaluateNonLpProblem(
  problem: any,
  module: string
): {
  objectiveValue: number;
  isFeasible: boolean;
  status: string;
  summary: string;
} {
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
      summary: `Duration = ${res.totalDuration.toFixed(1)} (Critical Path: ${res.criticalPath.join(' -> ')})`,
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
      summary: `Optimal Q = ${res.optimalQty.toFixed(0)}, Total Cost = ${res.totalAnnualCost.toFixed(2)}`,
    };
  }

  return {
    objectiveValue: 0,
    isFeasible: true,
    status: 'completed',
    summary: 'OK',
  };
}

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
