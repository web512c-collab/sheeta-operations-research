/**
 * Sheeta Operations Research
 * Solver Worker Client with Main-Thread Fallback & Safe Cancellation
 */

import { solveBranchAndBound } from '../engines/branchAndBound';
import { reconstructFullSolution, runMultiPassPresolve } from '../engines/presolve';
import { runSimulationBatch } from '../engines/simulation';
import { solveTwoPhaseSimplex } from '../engines/simplexTwoPhase';
import { BranchAndBoundResult, LpProblem, PresolveResult, SimplexSolution, SimulationSummary } from '../types';

let workerInstance: Worker | null = null;
let currentRequestId = 0;
let mainThreadCancelFlag = false;

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./solverWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      workerInstance = null;
    }
  }
  return workerInstance;
}

export function cancelCurrentRun(): void {
  mainThreadCancelFlag = true;
  if (workerInstance) {
    workerInstance.postMessage({ type: 'cancel' });
  }
}

export interface SolveLpResponse {
  simplex: SimplexSolution;
  presolve: PresolveResult | null;
}

export interface SolveBbResponse {
  bb: BranchAndBoundResult;
  presolve: PresolveResult | null;
}

export async function requestSolveLp(
  problem: LpProblem,
  enablePresolve: boolean,
  useWorker: boolean = true
): Promise<SolveLpResponse> {
  mainThreadCancelFlag = false;
  const worker = useWorker ? getWorker() : null;

  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++currentRequestId;
      const handler = (event: MessageEvent) => {
        if (event.data.id === id) {
          worker.removeEventListener('message', handler);
          if (event.data.type === 'result') {
            hydratePresolve(event.data.data);
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        id,
        type: 'solve_lp',
        payload: { problem, presolve: enablePresolve },
      });
    });
  }

  // Main-Thread Fallback
  let prob = problem;
  let presolveResult: PresolveResult | null = null;

  if (enablePresolve) {
    presolveResult = runMultiPassPresolve(problem);
    if (presolveResult.isInfeasible) {
      return {
        simplex: {
          status: 'infeasible',
          objectiveValue: 0,
          variableValues: new Array(problem.variables.length).fill(0),
          slackValues: [],
          iterations: 0,
          executionTimeMs: presolveResult.stats.executionTimeMs,
          errorMessage: presolveResult.infeasibilityReason,
        },
        presolve: presolveResult,
      };
    }
    prob = presolveResult.problem;
  }

  const simplexSolution = solveTwoPhaseSimplex(prob);

  if (presolveResult && simplexSolution.status === 'optimal') {
    simplexSolution.variableValues = presolveResult.reconstructSolution!(simplexSolution.variableValues);
  }

  return { simplex: simplexSolution, presolve: presolveResult };
}

export async function requestSolveBb(
  problem: LpProblem,
  enablePresolve: boolean,
  options: any = {},
  useWorker: boolean = true
): Promise<SolveBbResponse> {
  mainThreadCancelFlag = false;
  const worker = useWorker ? getWorker() : null;

  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++currentRequestId;
      const handler = (event: MessageEvent) => {
        if (event.data.id === id) {
          worker.removeEventListener('message', handler);
          if (event.data.type === 'result') {
            hydratePresolve(event.data.data);
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        id,
        type: 'solve_bb',
        payload: { problem, presolve: enablePresolve, options },
      });
    });
  }

  // Main-thread fallback
  let prob = problem;
  let presolveResult: PresolveResult | null = null;

  if (enablePresolve) {
    presolveResult = runMultiPassPresolve(problem);
    if (presolveResult.isInfeasible) {
      return {
        bb: {
          status: 'infeasible',
          lpRelaxation: {
            status: 'infeasible',
            objectiveValue: 0,
            variableValues: new Array(problem.variables.length).fill(0),
            slackValues: [],
            iterations: 0,
            executionTimeMs: presolveResult.stats.executionTimeMs,
            errorMessage: presolveResult.infeasibilityReason,
          },
          stats: {
            exploredNodes: 0,
            prunedByBound: 0,
            prunedInfeasible: 1,
            integerSolutionsFound: 0,
            maxDepthReached: 0,
            executionTimeMs: presolveResult.stats.executionTimeMs,
            integralityGapPercent: 0,
            accelerationsApplied: 0,
          },
          warning: presolveResult.infeasibilityReason,
        },
        presolve: presolveResult,
      };
    }
    prob = presolveResult.problem;
  }

  const bbResult = solveBranchAndBound(prob, {
    ...options,
    shouldCancel: () => mainThreadCancelFlag,
  });

  if (presolveResult) {
    if (bbResult.bestIntegerSolution) {
      bbResult.bestIntegerSolution = presolveResult.reconstructSolution!(bbResult.bestIntegerSolution);
    }
    if (bbResult.lpRelaxation.status === 'optimal') {
      bbResult.lpRelaxation.variableValues = presolveResult.reconstructSolution!(
        bbResult.lpRelaxation.variableValues
      );
    }
  }

  return { bb: bbResult, presolve: presolveResult };
}

export async function requestRunSimulation(
  options: any,
  useWorker: boolean = true,
  onProgress?: (completed: number, total: number) => void
): Promise<SimulationSummary> {
  mainThreadCancelFlag = false;
  const worker = useWorker ? getWorker() : null;

  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++currentRequestId;
      const handler = (event: MessageEvent) => {
        if (event.data.id === id) {
          if (event.data.type === 'progress' && onProgress) {
            onProgress(event.data.data.completed, event.data.data.total);
          } else if (event.data.type === 'result') {
            worker.removeEventListener('message', handler);
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            worker.removeEventListener('message', handler);
            reject(new Error(event.data.error));
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        id,
        type: 'run_simulation',
        payload: options,
      });
    });
  }

  return runSimulationBatch({
    ...options,
    shouldCancel: () => mainThreadCancelFlag,
    onProgress,
  });
}

function hydratePresolve(data: any): void {
  if (data && data.presolve && data.presolve.fixedVarEntries) {
    data.presolve.reconstructSolution = (reducedVarValues: number[]) =>
      reconstructFullSolution(
        data.presolve.originalVarsCount,
        data.presolve.fixedVarEntries,
        data.presolve.activeVarIndices,
        reducedVarValues
      );
  }
}
