/**
 * Sheeta Operations Research
 * Solver Worker Client, Simulation Worker Pool, SharedArrayBuffer Cancellation & Safe Termination
 */

import {
  PipelineOptions,
  runBbSolvePipelineAsync,
  runLpSolvePipelineAsync,
} from '../engines/lpSolvePipeline';
import { reconstructFullSolution } from '../engines/presolve';
import {
  ScenarioChunkItem,
  aggregateSimulationResults,
  generateScenarioParamValues,
  runSimulationBatchAsync,
} from '../engines/simulation';
import {
  BranchAndBoundProgress,
  BranchAndBoundResult,
  LpProblem,
  PresolveResult,
  ScenarioRun,
  SimplexSolution,
  SimulationSummary,
  SimulationType,
  SolverSettings,
  StochasticParam,
} from '../types';

let workerInstance: Worker | null = null;
let currentRequestId = 0;

interface ActiveRunControl {
  workers: Worker[];
  requestIds: number[];
  cancelFlag: { value: boolean };
  cancelView: Int32Array | null;
  forceTerminateTimeout?: ReturnType<typeof setTimeout>;
  onForceTerminate: () => void;
  settled: boolean;
}

let activeRun: ActiveRunControl | null = null;

function createNewWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  try {
    return new Worker(new URL('./solverWorker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
}

function getPrimaryWorker(): Worker | null {
  if (!workerInstance) {
    workerInstance = createNewWorker();
  }
  return workerInstance;
}

function createCancelBuffer(): {
  sharedBuffer: SharedArrayBuffer | null;
  view: Int32Array | null;
} {
  if (typeof SharedArrayBuffer === 'undefined') {
    return { sharedBuffer: null, view: null };
  }
  try {
    const sharedBuffer = new SharedArrayBuffer(4);
    const view = new Int32Array(sharedBuffer);
    Atomics.store(view, 0, 0);
    return { sharedBuffer, view };
  } catch {
    return { sharedBuffer: null, view: null };
  }
}

export function getRecommendedPoolSize(options?: {
  hardwareConcurrency?: number;
  userAgent?: string;
  maxDesktopPool?: number;
  maxMobilePool?: number;
}): number {
  const ua =
    options?.userAgent ??
    (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '');
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const cores =
    options?.hardwareConcurrency ??
    (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 2);
  const desktopCap = options?.maxDesktopPool ?? 4;
  const mobileCap = options?.maxMobilePool ?? 2;
  const cap = isMobile ? mobileCap : desktopCap;
  return Math.max(1, Math.min(cap, Math.floor(cores || 2)));
}

export function cancelCurrentRun(): void {
  const run = activeRun;
  if (!run || run.settled) return;

  run.cancelFlag.value = true;
  if (run.cancelView) {
    try {
      Atomics.store(run.cancelView, 0, 1);
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < run.workers.length; i++) {
    const w = run.workers[i];
    const reqId = run.requestIds[i];
    try {
      w.postMessage({ type: 'cancel', id: reqId });
    } catch {
      // ignore
    }
  }

  if (run.workers.length > 0 && !run.forceTerminateTimeout) {
    run.forceTerminateTimeout = setTimeout(() => {
      if (run.settled) return;
      for (const w of run.workers) {
        try {
          w.terminate();
        } catch {
          // ignore
        }
        if (w === workerInstance) {
          workerInstance = null;
        }
      }
      run.onForceTerminate();
    }, 450);
  }
}

function clearActiveRun(run: ActiveRunControl): void {
  run.settled = true;
  if (run.forceTerminateTimeout) {
    clearTimeout(run.forceTerminateTimeout);
    run.forceTerminateTimeout = undefined;
  }
  if (activeRun === run) {
    activeRun = null;
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
  useWorker: boolean = true,
  options: PipelineOptions = {}
): Promise<SolveLpResponse> {
  const cancelFlag = { value: false };
  const { sharedBuffer, view } = createCancelBuffer();
  const worker = useWorker ? getPrimaryWorker() : null;

  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++currentRequestId;
      let done = false;

      const runControl: ActiveRunControl = {
        workers: [worker],
        requestIds: [id],
        cancelFlag,
        cancelView: view,
        settled: false,
        onForceTerminate: () => {
          if (done) return;
          done = true;
          cleanup();
          clearActiveRun(runControl);
          resolve({
            simplex: {
              status: 'cancelled',
              objectiveValue: 0,
              variableValues: new Array(problem.variables.length).fill(0),
              slackValues: new Array(problem.constraints.length).fill(0),
              dualValues: new Array(problem.constraints.length).fill(0),
              matrixModeUsed: options.sparseEnabled ?? true ? 'sparse' : 'dense',
              iterations: 0,
              executionTimeMs: 0,
              errorMessage: 'LP computation cancelled by user.',
            },
            presolve: null,
          });
        },
      };
      activeRun = runControl;

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.removeEventListener('messageerror', handleMessageError);
      };

      const handleMessage = (event: MessageEvent) => {
        if (done || event.data?.id !== id) return;
        if (event.data.type === 'result') {
          done = true;
          cleanup();
          clearActiveRun(runControl);
          hydratePresolve(event.data.data);
          resolve(event.data.data);
        } else if (event.data.type === 'error') {
          done = true;
          cleanup();
          clearActiveRun(runControl);
          reject(new Error(event.data.error));
        }
      };

      const handleError = (err: ErrorEvent) => {
        if (done) return;
        done = true;
        cleanup();
        clearActiveRun(runControl);
        workerInstance = null;
        reject(new Error(err.message || 'Solver Web Worker crashed unexpectedly'));
      };

      const handleMessageError = () => {
        if (done) return;
        done = true;
        cleanup();
        clearActiveRun(runControl);
        reject(new Error('Failed to deserialize response from Solver Web Worker'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.addEventListener('messageerror', handleMessageError);

      const serializableOptions: Record<string, unknown> = {
        eps: options.eps,
        pivotEps: options.pivotEps,
        sparseEnabled: options.sparseEnabled,
        yieldEveryIterations: options.yieldEveryIterations,
        cancelSharedBuffer: sharedBuffer,
      };

      worker.postMessage({
        id,
        type: 'solve_lp',
        payload: {
          problem,
          presolve: enablePresolve,
          options: serializableOptions,
          cancelSharedBuffer: sharedBuffer,
        },
      });
    });
  }

  const runControl: ActiveRunControl = {
    workers: [],
    requestIds: [],
    cancelFlag,
    cancelView: view,
    settled: false,
    onForceTerminate: () => {},
  };
  activeRun = runControl;
  try {
    return await runLpSolvePipelineAsync(problem, enablePresolve, {
      ...options,
      shouldCancel: () => cancelFlag.value,
      cancelBuffer: view ?? undefined,
    });
  } finally {
    clearActiveRun(runControl);
  }
}

export async function requestSolveBb(
  problem: LpProblem,
  enablePresolve: boolean,
  options: PipelineOptions = {},
  useWorker: boolean = true
): Promise<SolveBbResponse> {
  const cancelFlag = { value: false };
  const { sharedBuffer, view } = createCancelBuffer();
  const worker = useWorker ? getPrimaryWorker() : null;
  let lastProgress: BranchAndBoundProgress | null = null;

  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++currentRequestId;
      let done = false;

      const runControl: ActiveRunControl = {
        workers: [worker],
        requestIds: [id],
        cancelFlag,
        cancelView: view,
        settled: false,
        onForceTerminate: () => {
          if (done) return;
          done = true;
          cleanup();
          clearActiveRun(runControl);
          resolve({
            bb: {
              status: 'cancelled',
              bestIntegerSolution: lastProgress?.bestIntegerSolution,
              bestObjectiveValue: lastProgress?.bestObjectiveValue,
              bestBound: lastProgress?.bestBound,
              lpRelaxation: {
                status: 'cancelled',
                objectiveValue: 0,
                variableValues: new Array(problem.variables.length).fill(0),
                slackValues: new Array(problem.constraints.length).fill(0),
                dualValues: new Array(problem.constraints.length).fill(0),
                iterations: 0,
                executionTimeMs: 0,
              },
              stats: {
                exploredNodes: lastProgress?.exploredNodes ?? 0,
                prunedByBound: 0,
                prunedInfeasible: 0,
                integerSolutionsFound: lastProgress?.bestIntegerSolution ? 1 : 0,
                maxDepthReached: 0,
                executionTimeMs: 0,
                integralityGapPercent: 0,
                accelerationsApplied: 0,
                openNodesRemaining: lastProgress?.openNodesRemaining ?? 0,
              },
              limitsUsed: {
                maxNodes: options.maxNodes ?? 2000,
                maxDepth: options.maxDepth ?? 60,
                timeoutMs: options.timeoutMs ?? 30000,
                branchingStrategy: options.branchingStrategy ?? 'most_fractional',
                sparseEnabled: options.sparseEnabled ?? true,
                eps: options.eps ?? 1e-7,
                pivotEps: options.pivotEps ?? 1e-9,
              },
              warningCode: 'cancelled',
              warning: 'Computation cancelled by user.',
            },
            presolve: null,
          });
        },
      };
      activeRun = runControl;

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.removeEventListener('messageerror', handleMessageError);
      };

      const handleMessage = (event: MessageEvent) => {
        if (done || event.data?.id !== id) return;
        if (event.data.type === 'progress') {
          lastProgress = event.data.data as BranchAndBoundProgress;
          if (options.onProgress) {
            options.onProgress(lastProgress);
          }
        } else if (event.data.type === 'result') {
          done = true;
          cleanup();
          clearActiveRun(runControl);
          hydratePresolve(event.data.data);
          resolve(event.data.data);
        } else if (event.data.type === 'error') {
          done = true;
          cleanup();
          clearActiveRun(runControl);
          reject(new Error(event.data.error));
        }
      };

      const handleError = (err: ErrorEvent) => {
        if (done) return;
        done = true;
        cleanup();
        clearActiveRun(runControl);
        workerInstance = null;
        reject(new Error(err.message || 'Solver Web Worker crashed unexpectedly'));
      };

      const handleMessageError = () => {
        if (done) return;
        done = true;
        cleanup();
        clearActiveRun(runControl);
        reject(new Error('Failed to deserialize response from Solver Web Worker'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.addEventListener('messageerror', handleMessageError);

      const serializableOptions: Record<string, unknown> = {
        branchingStrategy: options.branchingStrategy,
        maxNodes: options.maxNodes,
        maxDepth: options.maxDepth,
        timeoutMs: options.timeoutMs,
        eps: options.eps,
        pivotEps: options.pivotEps,
        sparseEnabled: options.sparseEnabled,
        yieldEveryNodes: options.yieldEveryNodes,
      };

      worker.postMessage({
        id,
        type: 'solve_bb',
        payload: {
          problem,
          presolve: enablePresolve,
          options: serializableOptions,
          cancelSharedBuffer: sharedBuffer,
        },
      });
    });
  }

  const runControl: ActiveRunControl = {
    workers: [],
    requestIds: [],
    cancelFlag,
    cancelView: view,
    settled: false,
    onForceTerminate: () => {},
  };
  activeRun = runControl;
  try {
    return await runBbSolvePipelineAsync(problem, enablePresolve, {
      ...options,
      shouldCancel: () => cancelFlag.value,
      cancelBuffer: view ?? undefined,
    });
  } finally {
    clearActiveRun(runControl);
  }
}

export interface SimulationRequestOptions {
  type: SimulationType;
  numScenarios: number;
  param: StochasticParam;
  baseProblem: any;
  solverSettings?: Partial<SolverSettings>;
}

export async function requestRunSimulation(
  options: SimulationRequestOptions,
  useWorker: boolean = true,
  onProgress?: (completed: number, total: number) => void
): Promise<SimulationSummary> {
  const cancelFlag = { value: false };
  const { sharedBuffer, view } = createCancelBuffer();
  const canSpawnWorkers = useWorker && typeof window !== 'undefined' && typeof Worker !== 'undefined';
  const poolSize = canSpawnWorkers ? getRecommendedPoolSize() : 1;

  if (canSpawnWorkers && poolSize > 1 && options.numScenarios >= poolSize * 2) {
    const sampledVals = generateScenarioParamValues(
      options.type,
      options.numScenarios,
      options.param
    );
    const items: ScenarioChunkItem[] = sampledVals.map((sampledVal, index) => ({
      index,
      sampledVal,
    }));

    const workers: Worker[] = [];
    for (let p = 0; p < poolSize; p++) {
      const w = createNewWorker();
      if (w) workers.push(w);
    }

    if (workers.length > 0) {
      const actualPoolSize = workers.length;
      const chunks: ScenarioChunkItem[][] = Array.from({ length: actualPoolSize }, () => []);
      for (let i = 0; i < items.length; i++) {
        chunks[i % actualPoolSize].push(items[i]);
      }

      const progressPerWorker = new Array<number>(actualPoolSize).fill(0);
      const reqIds = workers.map(() => ++currentRequestId);

      return new Promise((resolve, reject) => {
        let done = false;

        const terminatePoolWorkers = () => {
          for (const w of workers) {
            try {
              w.terminate();
            } catch {
              // ignore
            }
          }
        };

        const runControl: ActiveRunControl = {
          workers,
          requestIds: reqIds,
          cancelFlag,
          cancelView: view,
          settled: false,
          onForceTerminate: () => {
            if (done) return;
            done = true;
            terminatePoolWorkers();
            clearActiveRun(runControl);
            resolve(
              aggregateSimulationResults([], options.type, options.param, options.baseProblem, {
                cancelled: true,
                workerPoolSize: actualPoolSize,
                limitsUsed: options.solverSettings,
              })
            );
          },
        };
        activeRun = runControl;

        const chunkPromises = workers.map(
          (w, wIdx) =>
            new Promise<{ scenarios: ScenarioRun[]; cancelled: boolean }>((resChunk, rejChunk) => {
              const id = reqIds[wIdx];

              const cleanup = () => {
                w.removeEventListener('message', handleMsg);
                w.removeEventListener('error', handleErr);
                w.removeEventListener('messageerror', handleMsgErr);
              };

              const handleMsg = (ev: MessageEvent) => {
                if (ev.data?.id !== id) return;
                if (ev.data.type === 'progress') {
                  progressPerWorker[wIdx] = ev.data.data.completed ?? 0;
                  if (onProgress) {
                    const totalCompleted = progressPerWorker.reduce((a, b) => a + b, 0);
                    onProgress(totalCompleted, options.numScenarios);
                  }
                } else if (ev.data.type === 'result') {
                  cleanup();
                  resChunk(ev.data.data);
                } else if (ev.data.type === 'error') {
                  cleanup();
                  rejChunk(new Error(ev.data.error));
                }
              };

              const handleErr = (err: ErrorEvent) => {
                cleanup();
                rejChunk(new Error(err.message || 'Simulation pool worker error'));
              };

              const handleMsgErr = () => {
                cleanup();
                rejChunk(new Error('Failed to deserialize response from simulation pool worker'));
              };

              w.addEventListener('message', handleMsg);
              w.addEventListener('error', handleErr);
              w.addEventListener('messageerror', handleMsgErr);

              w.postMessage({
                id,
                type: 'run_simulation_chunk',
                payload: {
                  items: chunks[wIdx],
                  param: options.param,
                  baseProblem: options.baseProblem,
                  solverSettings: options.solverSettings,
                  cancelSharedBuffer: sharedBuffer,
                },
              });
            })
        );

        Promise.all(chunkPromises)
          .then((chunkResults) => {
            if (done) return;
            done = true;
            terminatePoolWorkers();
            clearActiveRun(runControl);
            const allScenarios = chunkResults.flatMap((c) => c.scenarios);
            const anyCancelled =
              cancelFlag.value || chunkResults.some((c) => Boolean(c.cancelled));
            resolve(
              aggregateSimulationResults(
                allScenarios,
                options.type,
                options.param,
                options.baseProblem,
                {
                  cancelled: anyCancelled,
                  workerPoolSize: actualPoolSize,
                  limitsUsed: options.solverSettings,
                }
              )
            );
          })
          .catch((err) => {
            if (done) return;
            done = true;
            terminatePoolWorkers();
            clearActiveRun(runControl);
            reject(err);
          });
      });
    }
  }

  const worker = useWorker ? getPrimaryWorker() : null;
  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++currentRequestId;
      let done = false;

      const runControl: ActiveRunControl = {
        workers: [worker],
        requestIds: [id],
        cancelFlag,
        cancelView: view,
        settled: false,
        onForceTerminate: () => {
          if (done) return;
          done = true;
          cleanup();
          clearActiveRun(runControl);
          resolve(
            aggregateSimulationResults([], options.type, options.param, options.baseProblem, {
              cancelled: true,
              workerPoolSize: 1,
              limitsUsed: options.solverSettings,
            })
          );
        },
      };
      activeRun = runControl;

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.removeEventListener('messageerror', handleMessageError);
      };

      const handleMessage = (event: MessageEvent) => {
        if (done || event.data?.id !== id) return;
        if (event.data.type === 'progress' && onProgress) {
          onProgress(event.data.data.completed, event.data.data.total);
        } else if (event.data.type === 'result') {
          done = true;
          cleanup();
          clearActiveRun(runControl);
          resolve(event.data.data);
        } else if (event.data.type === 'error') {
          done = true;
          cleanup();
          clearActiveRun(runControl);
          reject(new Error(event.data.error));
        }
      };

      const handleError = (err: ErrorEvent) => {
        if (done) return;
        done = true;
        cleanup();
        clearActiveRun(runControl);
        workerInstance = null;
        reject(new Error(err.message || 'Simulation Web Worker crashed unexpectedly'));
      };

      const handleMessageError = () => {
        if (done) return;
        done = true;
        cleanup();
        clearActiveRun(runControl);
        reject(new Error('Failed to deserialize response from Simulation Web Worker'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.addEventListener('messageerror', handleMessageError);
      worker.postMessage({
        id,
        type: 'run_simulation',
        payload: {
          ...options,
          cancelSharedBuffer: sharedBuffer,
        },
      });
    });
  }

  const runControl: ActiveRunControl = {
    workers: [],
    requestIds: [],
    cancelFlag,
    cancelView: view,
    settled: false,
    onForceTerminate: () => {},
  };
  activeRun = runControl;
  try {
    return await runSimulationBatchAsync({
      ...options,
      shouldCancel: () => cancelFlag.value,
      cancelBuffer: view ?? undefined,
      onProgress,
    });
  } finally {
    clearActiveRun(runControl);
  }
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
