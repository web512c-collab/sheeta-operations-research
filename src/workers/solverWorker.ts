/**
 * Sheeta Operations Research
 * Background Web Worker for Heavy Branch & Bound and Scenario Simulations
 */

import { solveBranchAndBound } from '../engines/branchAndBound';
import { runMultiPassPresolve } from '../engines/presolve';
import { runSimulationBatch } from '../engines/simulation';
import { solveTwoPhaseSimplex } from '../engines/simplexTwoPhase';

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
      let problem = payload.problem;
      let presolveResult = null;

      if (payload.presolve) {
        presolveResult = runMultiPassPresolve(problem);
        if (presolveResult.isInfeasible) {
          self.postMessage({
            id,
            type: 'result',
            data: {
              simplex: {
                status: 'infeasible',
                objectiveValue: 0,
                variableValues: new Array(problem.variables.length).fill(0),
                slackValues: [],
                iterations: 0,
                executionTimeMs: presolveResult.stats.executionTimeMs,
                errorMessage: presolveResult.infeasibilityReason,
              },
              presolve: toSerializablePresolve(presolveResult),
            },
          });
          return;
        }
        problem = presolveResult.problem;
      }

      const simplexSolution = solveTwoPhaseSimplex(problem);

      // Reconstruct if presolve was used
      if (presolveResult && simplexSolution.status === 'optimal') {
        simplexSolution.variableValues = presolveResult.reconstructSolution!(simplexSolution.variableValues);
      }

      self.postMessage({
        id,
        type: 'result',
        data: {
          simplex: simplexSolution,
          presolve: toSerializablePresolve(presolveResult),
        },
      });
      return;
    }

    if (type === 'solve_bb') {
      let problem = payload.problem;
      let presolveResult = null;

      if (payload.presolve) {
        presolveResult = runMultiPassPresolve(problem);
        if (presolveResult.isInfeasible) {
          self.postMessage({
            id,
            type: 'result',
            data: {
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
              presolve: toSerializablePresolve(presolveResult),
            },
          });
          return;
        }
        problem = presolveResult.problem;
      }

      const bbResult = solveBranchAndBound(problem, {
        ...payload.options,
        shouldCancel: () => isCancelled,
      });

      // Reconstruct variable values if presolved
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

      self.postMessage({
        id,
        type: 'result',
        data: { bb: bbResult, presolve: toSerializablePresolve(presolveResult) },
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
