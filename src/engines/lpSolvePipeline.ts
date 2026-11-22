/**
 * Sheeta Operations Research
 * Unified LP & Branch-and-Bound Presolve/Solve/Reconstruction Pipeline
 */

import {
  BranchAndBoundResult,
  LpProblem,
  PresolveResult,
  SimplexSolution,
} from '../types';
import { BAndBOptions, solveBranchAndBound } from './branchAndBound';
import { EPS, isInteger, snapZero } from './matrix';
import { runMultiPassPresolve } from './presolve';
import { solveTwoPhaseSimplex } from './simplexTwoPhase';

export function evaluateOriginalObjective(problem: LpProblem, variableValues: number[]): number {
  let obj = 0;
  for (let j = 0; j < problem.variables.length; j++) {
    obj += problem.variables[j].objCoeff * (variableValues[j] ?? 0);
  }
  return snapZero(obj);
}

export function verifyConstraintsAndBounds(problem: LpProblem, variableValues: number[]): boolean {
  for (let j = 0; j < problem.variables.length; j++) {
    const v = problem.variables[j];
    const val = variableValues[j] ?? 0;
    const lb =
      v.lowerBound !== null && v.lowerBound !== undefined && Number.isFinite(v.lowerBound)
        ? v.lowerBound
        : 0;
    const ub =
      v.upperBound !== null && v.upperBound !== undefined && Number.isFinite(v.upperBound)
        ? v.upperBound
        : Infinity;

    if (val < lb - 1e-4 || val > ub + 1e-4) {
      return false;
    }
  }

  for (const c of problem.constraints) {
    let lhs = 0;
    for (let j = 0; j < problem.variables.length; j++) {
      lhs += (c.coeffs[j] ?? 0) * (variableValues[j] ?? 0);
    }
    if (c.op === '<=' && lhs > c.rhs + 1e-4) return false;
    if (c.op === '>=' && lhs < c.rhs - 1e-4) return false;
    if (c.op === '=' && Math.abs(lhs - c.rhs) > 1e-4) return false;
  }

  return true;
}

function areIntegralityRequirementsMet(problem: LpProblem, variableValues: number[]): boolean {
  for (let j = 0; j < problem.variables.length; j++) {
    const v = problem.variables[j];
    const val = variableValues[j] ?? 0;
    if (v.type === 'integer' || v.type === 'binary') {
      if (!isInteger(val)) return false;
      if (v.type === 'binary') {
        const rounded = Math.round(val);
        if (rounded !== 0 && rounded !== 1) return false;
      }
    }
  }
  return true;
}

export function runLpSolvePipeline(
  problem: LpProblem,
  enablePresolve: boolean
): { simplex: SimplexSolution; presolve: PresolveResult | null } {
  let workProblem = problem;
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
    workProblem = presolveResult.problem;
  }

  // Handle degenerate case where presolve fixed ALL decision variables
  if (presolveResult && workProblem.variables.length === 0) {
    const reconstructed = presolveResult.reconstructSolution!([]).map(snapZero);
    const feasible = verifyConstraintsAndBounds(problem, reconstructed);
    return {
      simplex: feasible
        ? {
            status: 'optimal',
            objectiveValue: evaluateOriginalObjective(problem, reconstructed),
            variableValues: reconstructed,
            slackValues: [],
            iterations: 0,
            executionTimeMs: presolveResult.stats.executionTimeMs,
          }
        : {
            status: 'infeasible',
            objectiveValue: 0,
            variableValues: new Array(problem.variables.length).fill(0),
            slackValues: [],
            iterations: 0,
            executionTimeMs: presolveResult.stats.executionTimeMs,
            errorMessage: 'Problem infeasible after fixing all variables in presolve.',
          },
      presolve: presolveResult,
    };
  }

  const simplexSolution = solveTwoPhaseSimplex(workProblem);

  if (presolveResult && simplexSolution.status === 'optimal') {
    const reconstructed = presolveResult.reconstructSolution!(simplexSolution.variableValues).map(snapZero);
    simplexSolution.variableValues = reconstructed;
    simplexSolution.objectiveValue = evaluateOriginalObjective(problem, reconstructed);
  }

  return { simplex: simplexSolution, presolve: presolveResult };
}

export function runBbSolvePipeline(
  problem: LpProblem,
  enablePresolve: boolean,
  options: BAndBOptions = {}
): { bb: BranchAndBoundResult; presolve: PresolveResult | null } {
  let workProblem = problem;
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
    workProblem = presolveResult.problem;
  }

  // Handle degenerate case where presolve fixed ALL decision variables
  if (presolveResult && workProblem.variables.length === 0) {
    const reconstructed = presolveResult.reconstructSolution!([]).map(snapZero);
    const feasible = verifyConstraintsAndBounds(problem, reconstructed);
    const integerOk = areIntegralityRequirementsMet(problem, reconstructed);
    const objVal = feasible ? evaluateOriginalObjective(problem, reconstructed) : 0;

    return {
      bb: feasible && integerOk
        ? {
            status: 'optimal',
            bestIntegerSolution: reconstructed,
            bestObjectiveValue: objVal,
            lpRelaxation: {
              status: 'optimal',
              objectiveValue: objVal,
              variableValues: reconstructed,
              slackValues: [],
              iterations: 0,
              executionTimeMs: presolveResult.stats.executionTimeMs,
            },
            stats: {
              exploredNodes: 1,
              prunedByBound: 0,
              prunedInfeasible: 0,
              integerSolutionsFound: 1,
              maxDepthReached: 0,
              executionTimeMs: presolveResult.stats.executionTimeMs,
              integralityGapPercent: 0,
              accelerationsApplied: 1,
            },
          }
        : {
            status: 'infeasible',
            lpRelaxation: {
              status: feasible ? 'optimal' : 'infeasible',
              objectiveValue: objVal,
              variableValues: reconstructed,
              slackValues: [],
              iterations: 0,
              executionTimeMs: presolveResult.stats.executionTimeMs,
              errorMessage: !feasible
                ? 'Problem infeasible after presolve variable fixing.'
                : 'Fixed variable solution violates integer constraints.',
            },
            stats: {
              exploredNodes: 1,
              prunedByBound: 0,
              prunedInfeasible: 1,
              integerSolutionsFound: 0,
              maxDepthReached: 0,
              executionTimeMs: presolveResult.stats.executionTimeMs,
              integralityGapPercent: 0,
              accelerationsApplied: 0,
            },
            warning: !feasible
              ? 'Problem infeasible after presolve variable fixing.'
              : 'Fixed variable solution violates integer constraints.',
          },
      presolve: presolveResult,
    };
  }

  const bbResult = solveBranchAndBound(workProblem, options);

  if (presolveResult) {
    if (bbResult.lpRelaxation.status === 'optimal') {
      const fullRelax = presolveResult.reconstructSolution!(bbResult.lpRelaxation.variableValues).map(snapZero);
      bbResult.lpRelaxation.variableValues = fullRelax;
      bbResult.lpRelaxation.objectiveValue = evaluateOriginalObjective(problem, fullRelax);
    }

    if (bbResult.bestIntegerSolution) {
      const fullBest = presolveResult.reconstructSolution!(bbResult.bestIntegerSolution).map(snapZero);
      bbResult.bestIntegerSolution = fullBest;
      bbResult.bestObjectiveValue = evaluateOriginalObjective(problem, fullBest);

      if (Math.abs(bbResult.lpRelaxation.objectiveValue) > EPS) {
        const diff = Math.abs(bbResult.lpRelaxation.objectiveValue - bbResult.bestObjectiveValue);
        bbResult.stats.integralityGapPercent = Math.min(
          100,
          snapZero((diff / Math.abs(bbResult.lpRelaxation.objectiveValue)) * 100)
        );
      } else {
        bbResult.stats.integralityGapPercent = 0;
      }
    }
  }

  return { bb: bbResult, presolve: presolveResult };
}
