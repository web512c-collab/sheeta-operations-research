/**
 * Sheeta Operations Research
 * Solver Worker Client with Main-Thread Fallback & Safe Cancellation
 */

import { runBbSolvePipeline, runLpSolvePipeline } from '../engines/lpSolvePipeline';
import { reconstructFullSolution } from '../engines/presolve';
import { runSimulationBatch } from '../engines/simulation';
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

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.removeEventListener('messageerror', handleMessageError);
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.id === id) {
          cleanup();
          if (event.data.type === 'result') {
            hydratePresolve(event.data.data);
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        }
      };

      const handleError = (err: ErrorEvent) => {
        cleanup();
        reject(new Error(err.message || 'Solver Web Worker crashed unexpectedly'));
      };

      const handleMessageError = () => {
        cleanup();
        reject(new Error('Failed to deserialize response from Solver Web Worker'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.addEventListener('messageerror', handleMessageError);
      worker.postMessage({
        id,
        type: 'solve_lp',
        payload: { problem, presolve: enablePresolve },
      });
    });
  }

  return runLpSolvePipeline(problem, enablePresolve);
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

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.removeEventListener('messageerror', handleMessageError);
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.id === id) {
          cleanup();
          if (event.data.type === 'result') {
            hydratePresolve(event.data.data);
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        }
      };

      const handleError = (err: ErrorEvent) => {
        cleanup();
        reject(new Error(err.message || 'Solver Web Worker crashed unexpectedly'));
      };

      const handleMessageError = () => {
        cleanup();
        reject(new Error('Failed to deserialize response from Solver Web Worker'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.addEventListener('messageerror', handleMessageError);
      worker.postMessage({
        id,
        type: 'solve_bb',
        payload: { problem, presolve: enablePresolve, options },
      });
    });
  }

  return runBbSolvePipeline(problem, enablePresolve, {
    ...options,
    shouldCancel: () => mainThreadCancelFlag,
  });
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

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.removeEventListener('messageerror', handleMessageError);
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.id === id) {
          if (event.data.type === 'progress' && onProgress) {
            onProgress(event.data.data.completed, event.data.data.total);
          } else if (event.data.type === 'result') {
            cleanup();
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            cleanup();
            reject(new Error(event.data.error));
          }
        }
      };

      const handleError = (err: ErrorEvent) => {
        cleanup();
        reject(new Error(err.message || 'Simulation Web Worker crashed unexpectedly'));
      };

      const handleMessageError = () => {
        cleanup();
        reject(new Error('Failed to deserialize response from Simulation Web Worker'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.addEventListener('messageerror', handleMessageError);
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
