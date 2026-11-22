/**
 * Sheeta Operations Research
 * Background Web Worker for Heavy Branch & Bound and Scenario Simulations
 */

import { runBbSolvePipeline, runLpSolvePipeline } from '../engines/lpSolvePipeline';
import { runSimulationBatch } from '../engines/simulation';

let isCancelled = false;

self.onmessage = (event: MessageEvent) => {
  const { type, id, payload } = event.data;

  if (type === 'cancel') {
    isCancelled = true;
    return;
  }

  isCancelled = false;

  try {
    if (type === 'solve_lp') {
      const result = runLpSolvePipeline(payload.problem, Boolean(payload.presolve));

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
      const result = runBbSolvePipeline(payload.problem, Boolean(payload.presolve), {
        ...payload.options,
        shouldCancel: () => isCancelled,
      });

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
      const summary = runSimulationBatch({
        ...payload,
        shouldCancel: () => isCancelled,
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

    throw new Error(`Unknown worker message type: ${type}`);
  } catch (err: any) {
    self.postMessage({
      id,
      type: 'error',
      error: err?.message || 'Worker computation error',
    });
  }
};

function toSerializablePresolve(presolve: any) {
  if (!presolve) return null;
  return {
    problem: presolve.problem,
    stats: presolve.stats,
    originalVarsCount: presolve.originalVarsCount,
    activeVarIndices: presolve.activeVarIndices,
    fixedVarEntries: presolve.fixedVarEntries,
    isInfeasible: presolve.isInfeasible,
    infeasibilityReason: presolve.infeasibilityReason,
    report: presolve.report,
  };
}
