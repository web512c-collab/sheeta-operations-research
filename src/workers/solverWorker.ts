/**
 * Sheeta Operations Research
 * Async Web Worker for LP, Branch & Bound, and Pooled Scenario Simulations
 */

import { runBbSolvePipelineAsync, runLpSolvePipelineAsync } from '../engines/lpSolvePipeline';
import {
  evaluateScenarioChunkAsync,
  runSimulationBatchAsync,
} from '../engines/simulation';

const cancelledIds = new Set<number>();
const cancelBuffers = new Map<number, Int32Array>();

function makeCancelChecker(id: number, sharedBuffer?: SharedArrayBuffer | null): {
  shouldCancel: () => boolean;
  cancelBuffer?: Int32Array;
} {
  let view: Int32Array | undefined;
  if (sharedBuffer) {
    try {
      view = new Int32Array(sharedBuffer);
      cancelBuffers.set(id, view);
    } catch {
      view = undefined;
    }
  }
  return {
    cancelBuffer: view,
    shouldCancel: () => {
      if (cancelledIds.has(id)) return true;
      if (view && Atomics.load(view, 0) !== 0) return true;
      return false;
    },
  };
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, payload } = event.data ?? {};

  if (type === 'cancel') {
    if (typeof id === 'number') {
      cancelledIds.add(id);
      const buf = cancelBuffers.get(id);
      if (buf) {
        try {
          Atomics.store(buf, 0, 1);
        } catch {
          // ignore
        }
      }
    } else {
      for (const activeId of cancelBuffers.keys()) {
        cancelledIds.add(activeId);
        const buf = cancelBuffers.get(activeId);
        if (buf) {
          try {
            Atomics.store(buf, 0, 1);
          } catch {
            // ignore
          }
        }
      }
      cancelledIds.add(-1);
    }
    return;
  }

  cancelledIds.delete(id);
  cancelledIds.delete(-1);

  const { shouldCancel, cancelBuffer } = makeCancelChecker(id, payload?.cancelSharedBuffer);

  try {
    if (type === 'solve_lp') {
      const result = await runLpSolvePipelineAsync(
        payload.problem,
        Boolean(payload.presolve),
        {
          ...(payload.options ?? {}),
          shouldCancel: () => cancelledIds.has(-1) || shouldCancel(),
          cancelBuffer,
        }
      );

      self.postMessage({
        id,
        type: 'result',
        data: {
          simplex: result.simplex,
          presolve: toSerializablePresolve(result.presolve),
        },
      });
      return;
    }

    if (type === 'solve_bb') {
      const result = await runBbSolvePipelineAsync(
        payload.problem,
        Boolean(payload.presolve),
        {
          ...(payload.options ?? {}),
          shouldCancel: () => cancelledIds.has(-1) || shouldCancel(),
          cancelBuffer,
          onProgress: (progress) => {
            self.postMessage({ id, type: 'progress', data: progress });
          },
        }
      );

      self.postMessage({
        id,
        type: 'result',
        data: {
          bb: result.bb,
          presolve: toSerializablePresolve(result.presolve),
        },
      });
      return;
    }

    if (type === 'run_simulation') {
      const summary = await runSimulationBatchAsync({
        ...payload,
        shouldCancel: () => cancelledIds.has(-1) || shouldCancel(),
        cancelBuffer,
        onProgress: (completed, total) => {
          self.postMessage({ id, type: 'progress', data: { completed, total } });
        },
      });

      self.postMessage({
        id,
        type: 'result',
        data: summary,
      });
      return;
    }

    if (type === 'run_simulation_chunk') {
      const chunkRes = await evaluateScenarioChunkAsync(payload.items, {
        param: payload.param,
        baseProblem: payload.baseProblem,
        solverSettings: payload.solverSettings,
        shouldCancel: () => cancelledIds.has(-1) || shouldCancel(),
        cancelBuffer,
        onProgress: (completed, total) => {
          self.postMessage({ id, type: 'progress', data: { completed, total } });
        },
      });

      self.postMessage({
        id,
        type: 'result',
        data: chunkRes,
      });
      return;
    }

    throw new Error(`Unknown worker message type: ${type}`);
  } catch (err: any) {
    self.postMessage({
      id,
      type: 'error',
      error: err?.message || 'Worker computation error',
    });
  } finally {
    cancelledIds.delete(id);
    cancelBuffers.delete(id);
  }
};

function toSerializablePresolve(presolve: any) {
  if (!presolve) return null;
  return {
    problem: presolve.problem,
    stats: presolve.stats,
    originalVarsCount: presolve.originalVarsCount,
    activeVarIndices: presolve.activeVarIndices,
    activeConstraintIndices: presolve.activeConstraintIndices,
    singletonBoundSources: presolve.singletonBoundSources,
    fixedVarEntries: presolve.fixedVarEntries,
    isInfeasible: presolve.isInfeasible,
    infeasibilityReason: presolve.infeasibilityReason,
    report: presolve.report,
  };
}
