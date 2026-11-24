/**
 * Sheeta Operations Research
 * Unified LP & Branch-and-Bound Presolve/Solve/Reconstruction Pipeline
 */

import {
  BranchAndBoundResult,
  ConstraintSensitivity,
  LpProblem,
  PresolveResult,
  SimplexSolution,
  SolverLimitsUsed,
} from '../types';
import { BAndBOptions, solveBranchAndBound, solveBranchAndBoundAsync } from './branchAndBound';
import { EPS, PIVOT_EPS, ZERO_TOLERANCE, isInteger, snapZero } from './matrix';
import { runMultiPassPresolve } from './presolve';
import {
  SimplexOptions,
  computeOriginalConstraintDetails,
  solveTwoPhaseSimplex,
  solveTwoPhaseSimplexAsync,
} from './simplexTwoPhase';

export interface PipelineOptions extends BAndBOptions {
  sparseEnabled?: boolean;
  yieldEveryIterations?: number;
}

export function evaluateOriginalObjective(problem: LpProblem, variableValues: number[]): number {
  let obj = 0;
  for (let j = 0; j < problem.variables.length; j++) {
    obj += problem.variables[j].objCoeff * (variableValues[j] ?? 0);
  }
  return snapZero(obj);
}

export function verifyConstraintsAndBounds(
  problem: LpProblem,
  variableValues: number[],
  tol: number = 1e-4
): boolean {
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

    if (val < lb - tol || val > ub + tol) {
      return false;
    }
  }

  for (const c of problem.constraints) {
    let lhs = 0;
    for (let j = 0; j < problem.variables.length; j++) {
      lhs += (c.coeffs[j] ?? 0) * (variableValues[j] ?? 0);
    }
    if (c.op === '<=' && lhs > c.rhs + tol) return false;
    if (c.op === '>=' && lhs < c.rhs - tol) return false;
    if (c.op === '=' && Math.abs(lhs - c.rhs) > tol) return false;
  }

  return true;
}

function areIntegralityRequirementsMet(
  problem: LpProblem,
  variableValues: number[],
  eps: number = EPS
): boolean {
  for (let j = 0; j < problem.variables.length; j++) {
    const v = problem.variables[j];
    const val = variableValues[j] ?? 0;
    if (v.type === 'integer' || v.type === 'binary') {
      if (!isInteger(val, eps)) return false;
      if (v.type === 'binary') {
        const rounded = Math.round(val);
        if (rounded !== 0 && rounded !== 1) return false;
      }
    }
  }
  return true;
}

function reconstructPresolvedSimplex(
  originalProblem: LpProblem,
  presolveResult: PresolveResult,
  simplexSolution: SimplexSolution,
  zeroTol: number
): void {
  const reconstructed = presolveResult.reconstructSolution!(simplexSolution.variableValues).map((v) =>
    snapZero(v, zeroTol)
  );
  simplexSolution.variableValues = reconstructed;
  simplexSolution.objectiveValue = evaluateOriginalObjective(originalProblem, reconstructed);

  const fullDuals = new Array<number>(originalProblem.constraints.length).fill(0);

  if (simplexSolution.status === 'optimal') {
    const activeSet = new Set<number>(presolveResult.activeConstraintIndices);
    for (let pos = 0; pos < presolveResult.activeConstraintIndices.length; pos++) {
      const origIdx = presolveResult.activeConstraintIndices[pos];
      fullDuals[origIdx] = snapZero(simplexSolution.dualValues?.[pos] ?? 0, zeroTol);
    }

    const isMaximize = originalProblem.sense === 'maximize';
    const sources = presolveResult.singletonBoundSources ?? [];
    const assignedFixedVars = new Set<number>();

    // First attribute active variable singleton bounds & fixed equality bounds
    for (const src of sources) {
      const origIdx = src.origConstraintIndex;
      if (origIdx < 0 || origIdx >= originalProblem.constraints.length || activeSet.has(origIdx)) {
        continue;
      }
      if (Math.abs(src.coeff) <= zeroTol) continue;

      const activeVarPos = presolveResult.activeVarIndices.indexOf(src.varIndex);
      if (activeVarPos >= 0 && (src.bound === 'lb' || src.bound === 'ub')) {
        const activeVar = presolveResult.problem.variables[activeVarPos];
        const targetBound = src.bound === 'lb' ? activeVar.lowerBound : activeVar.upperBound;
        if (Math.abs(src.effectiveBound - targetBound) <= 1e-6) {
          const bd = (simplexSolution.boundDuals ?? []).find(
            (b) => b.varIndex === activeVarPos && b.kind === src.bound
          );
          if (bd) {
            fullDuals[origIdx] = snapZero(bd.dualValue / src.coeff, zeroTol);
          }
        }
      } else if (activeVarPos === -1 && !assignedFixedVars.has(src.varIndex)) {
        // Variable was fixed during presolve: compute envelope reduced shadow price wrt x_v
        let dZdx = originalProblem.variables[src.varIndex]?.objCoeff ?? 0;
        for (const keptOrigIdx of presolveResult.activeConstraintIndices) {
          const origC = originalProblem.constraints[keptOrigIdx];
          dZdx -= fullDuals[keptOrigIdx] * (origC.coeffs[src.varIndex] ?? 0);
        }
        const candidateDual = dZdx / src.coeff;
        const origC = originalProblem.constraints[origIdx];
        const matchesSign =
          origC.op === '=' ||
          (isMaximize && origC.op === '<=' && candidateDual > zeroTol) ||
          (isMaximize && origC.op === '>=' && candidateDual < -zeroTol) ||
          (!isMaximize && origC.op === '<=' && candidateDual < -zeroTol) ||
          (!isMaximize && origC.op === '>=' && candidateDual > zeroTol);

        if (matchesSign && Math.abs(candidateDual) > zeroTol) {
          fullDuals[origIdx] = snapZero(candidateDual, zeroTol);
          assignedFixedVars.add(src.varIndex);
        }
      }
    }
  }

  const details: ConstraintSensitivity[] = computeOriginalConstraintDetails(
    originalProblem,
    reconstructed,
    fullDuals,
    zeroTol
  );
  simplexSolution.dualValues = fullDuals;
  simplexSolution.constraintDetails = details;
  simplexSolution.slackValues = details.map((d) => d.slackOrSurplus);
}

function buildDefaultLimitsUsed(options: PipelineOptions): SolverLimitsUsed {
  return {
    maxNodes: Math.max(1, Math.floor(options.maxNodes ?? 2000)),
    maxDepth: Math.max(0, Math.floor(options.maxDepth ?? 60)),
    timeoutMs: Math.max(10, options.timeoutMs ?? 30000),
    branchingStrategy: options.branchingStrategy ?? 'most_fractional',
    sparseEnabled: options.sparseEnabled ?? true,
    eps: options.eps ?? EPS,
    pivotEps: options.pivotEps ?? PIVOT_EPS,
  };
}

function makePresolveFixedZeroResult(
  problem: LpProblem,
  presolveResult: PresolveResult,
  options: PipelineOptions
): SimplexSolution {
  const zeroTol = Math.min(ZERO_TOLERANCE, options.pivotEps ?? ZERO_TOLERANCE);
  const reconstructed = presolveResult.reconstructSolution!([]).map((v) => snapZero(v, zeroTol));
  const feasible = verifyConstraintsAndBounds(problem, reconstructed);

  if (!feasible) {
    return {
      status: 'infeasible',
      objectiveValue: 0,
      variableValues: new Array(problem.variables.length).fill(0),
      slackValues: new Array(problem.constraints.length).fill(0),
      dualValues: new Array(problem.constraints.length).fill(0),
      matrixModeUsed: 'dense',
      iterations: 0,
      executionTimeMs: presolveResult.stats.executionTimeMs,
      errorMessage: 'Problem infeasible after fixing all variables in presolve.',
    };
  }

  const sol: SimplexSolution = {
    status: 'optimal',
    objectiveValue: evaluateOriginalObjective(problem, reconstructed),
    variableValues: [],
    slackValues: [],
    dualValues: [],
    matrixModeUsed: 'dense',
    iterations: 0,
    executionTimeMs: presolveResult.stats.executionTimeMs,
  };
  reconstructPresolvedSimplex(problem, presolveResult, sol, zeroTol);
  return sol;
}

export function runLpSolvePipeline(
  problem: LpProblem,
  enablePresolve: boolean,
  options: PipelineOptions = {}
): { simplex: SimplexSolution; presolve: PresolveResult | null } {
  const zeroTol = Math.min(ZERO_TOLERANCE, options.pivotEps ?? ZERO_TOLERANCE);
  let workProblem = problem;
  let presolveResult: PresolveResult | null = null;

  if (enablePresolve) {
    presolveResult = runMultiPassPresolve(problem, {
      eps: options.eps,
      pivotEps: options.pivotEps,
      sparseEnabled: options.sparseEnabled,
    });
    if (presolveResult.isInfeasible) {
      return {
        simplex: {
          status: 'infeasible',
          objectiveValue: 0,
          variableValues: new Array(problem.variables.length).fill(0),
          slackValues: new Array(problem.constraints.length).fill(0),
          dualValues: new Array(problem.constraints.length).fill(0),
          matrixModeUsed: 'dense',
          iterations: 0,
          executionTimeMs: presolveResult.stats.executionTimeMs,
          errorMessage: presolveResult.infeasibilityReason,
        },
        presolve: presolveResult,
      };
    }
    workProblem = presolveResult.problem;
  }

  if (presolveResult && workProblem.variables.length === 0) {
    return {
      simplex: makePresolveFixedZeroResult(problem, presolveResult, options),
      presolve: presolveResult,
    };
  }

  const simplexOpts: SimplexOptions = {
    eps: options.eps,
    pivotEps: options.pivotEps,
    sparseEnabled: options.sparseEnabled,
    shouldCancel: options.shouldCancel,
    cancelBuffer: options.cancelBuffer,
    yieldEveryIterations: options.yieldEveryIterations,
  };

  const simplexSolution = solveTwoPhaseSimplex(workProblem, simplexOpts);

  if (presolveResult && simplexSolution.status === 'optimal') {
    reconstructPresolvedSimplex(problem, presolveResult, simplexSolution, zeroTol);
  }

  return { simplex: simplexSolution, presolve: presolveResult };
}

export async function runLpSolvePipelineAsync(
  problem: LpProblem,
  enablePresolve: boolean,
  options: PipelineOptions = {}
): Promise<{ simplex: SimplexSolution; presolve: PresolveResult | null }> {
  const zeroTol = Math.min(ZERO_TOLERANCE, options.pivotEps ?? ZERO_TOLERANCE);
  let workProblem = problem;
  let presolveResult: PresolveResult | null = null;

  if (enablePresolve) {
    presolveResult = runMultiPassPresolve(problem, {
      eps: options.eps,
      pivotEps: options.pivotEps,
      sparseEnabled: options.sparseEnabled,
    });
    if (presolveResult.isInfeasible) {
      return {
        simplex: {
          status: 'infeasible',
          objectiveValue: 0,
          variableValues: new Array(problem.variables.length).fill(0),
          slackValues: new Array(problem.constraints.length).fill(0),
          dualValues: new Array(problem.constraints.length).fill(0),
          matrixModeUsed: 'dense',
          iterations: 0,
          executionTimeMs: presolveResult.stats.executionTimeMs,
          errorMessage: presolveResult.infeasibilityReason,
        },
        presolve: presolveResult,
      };
    }
    workProblem = presolveResult.problem;
  }

  if (presolveResult && workProblem.variables.length === 0) {
    return {
      simplex: makePresolveFixedZeroResult(problem, presolveResult, options),
      presolve: presolveResult,
    };
  }

  const simplexOpts: SimplexOptions = {
    eps: options.eps,
    pivotEps: options.pivotEps,
    sparseEnabled: options.sparseEnabled,
    shouldCancel: options.shouldCancel,
    cancelBuffer: options.cancelBuffer,
    yieldEveryIterations: options.yieldEveryIterations,
  };

  const simplexSolution = await solveTwoPhaseSimplexAsync(workProblem, simplexOpts);

  if (presolveResult && simplexSolution.status === 'optimal') {
    reconstructPresolvedSimplex(problem, presolveResult, simplexSolution, zeroTol);
  }

  return { simplex: simplexSolution, presolve: presolveResult };
}

function finalizeBbReconstruction(
  originalProblem: LpProblem,
  presolveResult: PresolveResult,
  bbResult: BranchAndBoundResult,
  options: PipelineOptions
): void {
  const zeroTol = Math.min(ZERO_TOLERANCE, options.pivotEps ?? ZERO_TOLERANCE);
  const eps = options.eps ?? EPS;

  let fixedObjOffset = 0;
  for (const [origIdx, fixedVal] of presolveResult.fixedVarEntries) {
    fixedObjOffset += (originalProblem.variables[origIdx]?.objCoeff ?? 0) * fixedVal;
  }

  if (bbResult.lpRelaxation.status === 'optimal') {
    reconstructPresolvedSimplex(originalProblem, presolveResult, bbResult.lpRelaxation, zeroTol);
  }

  if (bbResult.bestBound !== undefined && Number.isFinite(bbResult.bestBound)) {
    bbResult.bestBound = snapZero(bbResult.bestBound + fixedObjOffset, zeroTol);
  }

  if (bbResult.bestIntegerSolution) {
    const fullBest = presolveResult.reconstructSolution!(bbResult.bestIntegerSolution).map((v) =>
      snapZero(v, zeroTol)
    );
    bbResult.bestIntegerSolution = fullBest;
    bbResult.bestObjectiveValue = evaluateOriginalObjective(originalProblem, fullBest);

    if (bbResult.status === 'optimal') {
      bbResult.bestBound = bbResult.bestObjectiveValue;
      bbResult.stats.integralityGapPercent = 0;
    } else if (bbResult.bestBound !== undefined && Number.isFinite(bbResult.bestBound)) {
      const diff = Math.abs(bbResult.bestBound - bbResult.bestObjectiveValue);
      const denom = Math.max(eps, Math.abs(bbResult.bestBound), Math.abs(bbResult.bestObjectiveValue));
      bbResult.stats.integralityGapPercent =
        denom > eps ? Math.min(100, snapZero((diff / denom) * 100)) : 0;
    }
  }
}

function makePresolveFixedBbResult(
  problem: LpProblem,
  presolveResult: PresolveResult,
  options: PipelineOptions
): BranchAndBoundResult {
  const limitsUsed = buildDefaultLimitsUsed(options);
  const zeroTol = Math.min(ZERO_TOLERANCE, options.pivotEps ?? ZERO_TOLERANCE);
  const eps = options.eps ?? EPS;
  const reconstructed = presolveResult.reconstructSolution!([]).map((v) => snapZero(v, zeroTol));
  const feasible = verifyConstraintsAndBounds(problem, reconstructed);
  const integerOk = areIntegralityRequirementsMet(problem, reconstructed, eps);
  const objVal = feasible ? evaluateOriginalObjective(problem, reconstructed) : 0;

  if (feasible && integerOk) {
    const lpRelaxation = makePresolveFixedZeroResult(problem, presolveResult, options);
    return {
      status: 'optimal',
      bestIntegerSolution: reconstructed,
      bestObjectiveValue: objVal,
      bestBound: objVal,
      lpRelaxation,
      stats: {
        exploredNodes: 1,
        prunedByBound: 0,
        prunedInfeasible: 0,
        integerSolutionsFound: 1,
        maxDepthReached: 0,
        executionTimeMs: presolveResult.stats.executionTimeMs,
        integralityGapPercent: 0,
        accelerationsApplied: 1,
        depthLimitHitCount: 0,
        openNodesRemaining: 0,
      },
      limitsUsed,
      matrixModeUsed: 'dense',
    };
  }

  const reason = !feasible
    ? 'Problem infeasible after presolve variable fixing.'
    : 'Fixed variable solution violates integer constraints.';
  return {
    status: 'infeasible',
    lpRelaxation: {
      status: feasible ? 'optimal' : 'infeasible',
      objectiveValue: objVal,
      variableValues: reconstructed,
      slackValues: new Array(problem.constraints.length).fill(0),
      dualValues: new Array(problem.constraints.length).fill(0),
      matrixModeUsed: 'dense',
      iterations: 0,
      executionTimeMs: presolveResult.stats.executionTimeMs,
      errorMessage: reason,
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
      depthLimitHitCount: 0,
      openNodesRemaining: 0,
    },
    limitsUsed,
    matrixModeUsed: 'dense',
    warningCode: 'infeasible',
    warning: reason,
  };
}

export function runBbSolvePipeline(
  problem: LpProblem,
  enablePresolve: boolean,
  options: PipelineOptions = {}
): { bb: BranchAndBoundResult; presolve: PresolveResult | null } {
  const limitsUsed = buildDefaultLimitsUsed(options);
  let workProblem = problem;
  let presolveResult: PresolveResult | null = null;

  if (enablePresolve) {
    presolveResult = runMultiPassPresolve(problem, {
      eps: options.eps,
      pivotEps: options.pivotEps,
      sparseEnabled: options.sparseEnabled,
    });
    if (presolveResult.isInfeasible) {
      return {
        bb: {
          status: 'infeasible',
          lpRelaxation: {
            status: 'infeasible',
            objectiveValue: 0,
            variableValues: new Array(problem.variables.length).fill(0),
            slackValues: new Array(problem.constraints.length).fill(0),
            dualValues: new Array(problem.constraints.length).fill(0),
            matrixModeUsed: 'dense',
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
            depthLimitHitCount: 0,
            openNodesRemaining: 0,
          },
          limitsUsed,
          matrixModeUsed: 'dense',
          warningCode: 'infeasible',
          warning: presolveResult.infeasibilityReason,
        },
        presolve: presolveResult,
      };
    }
    workProblem = presolveResult.problem;
  }

  if (presolveResult && workProblem.variables.length === 0) {
    return {
      bb: makePresolveFixedBbResult(problem, presolveResult, options),
      presolve: presolveResult,
    };
  }

  const bbOptions: PipelineOptions = {
    ...options,
    onProgress: options.onProgress
      ? (p) => {
          if (presolveResult && p.bestIntegerSolution) {
            const fullBest = presolveResult.reconstructSolution!(p.bestIntegerSolution).map((v) =>
              snapZero(v)
            );
            let fixedOffset = 0;
            for (const [origIdx, fixedVal] of presolveResult.fixedVarEntries) {
              fixedOffset += (problem.variables[origIdx]?.objCoeff ?? 0) * fixedVal;
            }
            options.onProgress!({
              ...p,
              bestIntegerSolution: fullBest,
              bestObjectiveValue: evaluateOriginalObjective(problem, fullBest),
              bestBound:
                p.bestBound !== undefined ? snapZero(p.bestBound + fixedOffset) : undefined,
            });
          } else {
            options.onProgress!(p);
          }
        }
      : undefined,
  };

  const bbResult = solveBranchAndBound(workProblem, bbOptions);
  if (presolveResult) {
    finalizeBbReconstruction(problem, presolveResult, bbResult, options);
  }

  return { bb: bbResult, presolve: presolveResult };
}

export async function runBbSolvePipelineAsync(
  problem: LpProblem,
  enablePresolve: boolean,
  options: PipelineOptions = {}
): Promise<{ bb: BranchAndBoundResult; presolve: PresolveResult | null }> {
  const limitsUsed = buildDefaultLimitsUsed(options);
  let workProblem = problem;
  let presolveResult: PresolveResult | null = null;

  if (enablePresolve) {
    presolveResult = runMultiPassPresolve(problem, {
      eps: options.eps,
      pivotEps: options.pivotEps,
      sparseEnabled: options.sparseEnabled,
    });
    if (presolveResult.isInfeasible) {
      return {
        bb: {
          status: 'infeasible',
          lpRelaxation: {
            status: 'infeasible',
            objectiveValue: 0,
            variableValues: new Array(problem.variables.length).fill(0),
            slackValues: new Array(problem.constraints.length).fill(0),
            dualValues: new Array(problem.constraints.length).fill(0),
            matrixModeUsed: 'dense',
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
            depthLimitHitCount: 0,
            openNodesRemaining: 0,
          },
          limitsUsed,
          matrixModeUsed: 'dense',
          warningCode: 'infeasible',
          warning: presolveResult.infeasibilityReason,
        },
        presolve: presolveResult,
      };
    }
    workProblem = presolveResult.problem;
  }

  if (presolveResult && workProblem.variables.length === 0) {
    return {
      bb: makePresolveFixedBbResult(problem, presolveResult, options),
      presolve: presolveResult,
    };
  }

  const bbOptions: PipelineOptions = {
    ...options,
    onProgress: options.onProgress
      ? (p) => {
          if (presolveResult && p.bestIntegerSolution) {
            const fullBest = presolveResult.reconstructSolution!(p.bestIntegerSolution).map((v) =>
              snapZero(v)
            );
            let fixedOffset = 0;
            for (const [origIdx, fixedVal] of presolveResult.fixedVarEntries) {
              fixedOffset += (problem.variables[origIdx]?.objCoeff ?? 0) * fixedVal;
            }
            options.onProgress!({
              ...p,
              bestIntegerSolution: fullBest,
              bestObjectiveValue: evaluateOriginalObjective(problem, fullBest),
              bestBound:
                p.bestBound !== undefined ? snapZero(p.bestBound + fixedOffset) : undefined,
            });
          } else {
            options.onProgress!(p);
          }
        }
      : undefined,
  };

  const bbResult = await solveBranchAndBoundAsync(workProblem, bbOptions);
  if (presolveResult) {
    finalizeBbReconstruction(problem, presolveResult, bbResult, options);
  }

  return { bb: bbResult, presolve: presolveResult };
}
