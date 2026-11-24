/**
 * Sheeta Operations Research
 * Branch and Bound Engine with Primal Heuristic, Honest Status Reporting,
 * Dual Bounds, Cooperative Async Yielding & Cancellation
 */

import {
  BranchAndBoundProgress,
  BranchAndBoundResult,
  BranchAndBoundStats,
  BranchAndBoundStatus,
  BranchAndBoundWarningCode,
  BranchingStrategy,
  ConstraintDef,
  LpProblem,
  SimplexSolution,
  SolverLimitsUsed,
  VariableDef,
} from '../types';
import { EPS, PIVOT_EPS, isInteger, snapZero } from './matrix';
import { SimplexOptions, solveTwoPhaseSimplex, solveTwoPhaseSimplexAsync } from './simplexTwoPhase';

interface BAndBNode {
  id: number;
  depth: number;
  constraints: ConstraintDef[];
  bound: number;
}

export interface BAndBOptions {
  branchingStrategy?: BranchingStrategy;
  maxNodes?: number;
  maxDepth?: number;
  timeoutMs?: number;
  eps?: number;
  pivotEps?: number;
  sparseEnabled?: boolean;
  shouldCancel?: () => boolean;
  cancelBuffer?: Int32Array;
  onProgress?: (progress: BranchAndBoundProgress) => void;
  yieldEveryNodes?: number;
}

const DEFAULT_MAX_NODES = 2000;
const DEFAULT_MAX_DEPTH = 60;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_YIELD_EVERY_NODES = 2;

function isCancelledNow(options: BAndBOptions): boolean {
  if (options.cancelBuffer && Atomics.load(options.cancelBuffer, 0) !== 0) {
    return true;
  }
  return Boolean(options.shouldCancel && options.shouldCancel());
}

function buildNormalizedProblem(problem: LpProblem): LpProblem {
  return {
    ...problem,
    variables: problem.variables.map((v) => ({
      ...v,
      lowerBound:
        v.lowerBound !== null && v.lowerBound !== undefined && Number.isFinite(v.lowerBound)
          ? v.lowerBound
          : 0,
      upperBound:
        v.upperBound !== null && v.upperBound !== undefined && Number.isFinite(v.upperBound)
          ? v.upperBound
          : Infinity,
    })),
  };
}

function computeOuterBound(
  isMaximize: boolean,
  unresolvedBounds: number[],
  stack: BAndBNode[],
  incumbent?: number
): number | undefined {
  const candidates: number[] = [...unresolvedBounds];
  for (let i = 0; i < stack.length; i++) {
    candidates.push(stack[i].bound);
  }
  if (incumbent !== undefined && Number.isFinite(incumbent)) {
    candidates.push(incumbent);
  }
  if (candidates.length === 0) return undefined;
  return isMaximize ? Math.max(...candidates) : Math.min(...candidates);
}

function computeGapPercent(
  status: BranchAndBoundStatus,
  bestObjectiveValue: number | undefined,
  bestBound: number | undefined,
  eps: number
): number {
  if (status === 'optimal') return 0;
  if (
    bestObjectiveValue === undefined ||
    bestBound === undefined ||
    !Number.isFinite(bestObjectiveValue) ||
    !Number.isFinite(bestBound)
  ) {
    return 0;
  }
  const diff = Math.abs(bestBound - bestObjectiveValue);
  const denom = Math.max(eps, Math.abs(bestBound), Math.abs(bestObjectiveValue));
  if (denom <= eps) return 0;
  return Math.min(100, snapZero((diff / denom) * 100));
}

function runRootSetup(
  problem: LpProblem,
  options: BAndBOptions,
  rootRelaxation: SimplexSolution,
  startTime: number,
  limitsUsed: SolverLimitsUsed
): { earlyResult?: BranchAndBoundResult; problemNormalized: LpProblem } {
  const problemNormalized = buildNormalizedProblem(problem);
  const matrixModeUsed = rootRelaxation.matrixModeUsed ?? 'dense';

  if (rootRelaxation.status === 'cancelled') {
    return {
      problemNormalized,
      earlyResult: {
        status: 'cancelled',
        lpRelaxation: rootRelaxation,
        stats: {
          exploredNodes: 0,
          prunedByBound: 0,
          prunedInfeasible: 0,
          integerSolutionsFound: 0,
          maxDepthReached: 0,
          executionTimeMs: performance.now() - startTime,
          integralityGapPercent: 0,
          accelerationsApplied: 0,
          depthLimitHitCount: 0,
          openNodesRemaining: 0,
        },
        limitsUsed,
        matrixModeUsed,
        warningCode: 'cancelled',
        warning: rootRelaxation.errorMessage || 'Branch and Bound cancelled at root relaxation.',
      },
    };
  }

  if (rootRelaxation.status !== 'optimal') {
    const status: BranchAndBoundStatus =
      rootRelaxation.status === 'infeasible'
        ? 'infeasible'
        : rootRelaxation.status === 'unbounded'
        ? 'unbounded'
        : 'feasible_not_proven';
    const warningCode: BranchAndBoundWarningCode =
      status === 'infeasible'
        ? 'infeasible'
        : status === 'unbounded'
        ? 'unbounded'
        : 'feasible_not_proven';
    return {
      problemNormalized,
      earlyResult: {
        status,
        lpRelaxation: rootRelaxation,
        stats: {
          exploredNodes: 1,
          prunedByBound: 0,
          prunedInfeasible: status === 'infeasible' ? 1 : 0,
          integerSolutionsFound: 0,
          maxDepthReached: 0,
          executionTimeMs: performance.now() - startTime,
          integralityGapPercent: 0,
          accelerationsApplied: 0,
          depthLimitHitCount: 0,
          openNodesRemaining: 0,
        },
        limitsUsed,
        matrixModeUsed,
        warningCode,
        warning: rootRelaxation.errorMessage,
      },
    };
  }

  const eps = options.eps ?? EPS;
  if (isSolutionInteger(rootRelaxation.variableValues, problem.variables, eps)) {
    const objVal = snapZero(rootRelaxation.objectiveValue);
    return {
      problemNormalized,
      earlyResult: {
        status: 'optimal',
        bestIntegerSolution: rootRelaxation.variableValues.map((v) => snapZero(v)),
        bestObjectiveValue: objVal,
        bestBound: objVal,
        lpRelaxation: rootRelaxation,
        stats: {
          exploredNodes: 1,
          prunedByBound: 0,
          prunedInfeasible: 0,
          integerSolutionsFound: 1,
          maxDepthReached: 0,
          executionTimeMs: performance.now() - startTime,
          integralityGapPercent: 0,
          accelerationsApplied: 0,
          depthLimitHitCount: 0,
          openNodesRemaining: 0,
        },
        limitsUsed,
        matrixModeUsed,
      },
    };
  }

  return { problemNormalized };
}

function finalizeBranchAndBoundResult(params: {
  problem: LpProblem;
  rootRelaxation: SimplexSolution;
  bestIntegerSolution: number[] | undefined;
  bestObjectiveValue: number;
  exploredNodes: number;
  prunedByBound: number;
  prunedInfeasible: number;
  integerSolutionsFound: number;
  maxDepthReached: number;
  accelerationsApplied: number;
  depthLimitHitCount: number;
  unresolvedBounds: number[];
  stack: BAndBNode[];
  timedOut: boolean;
  wasCancelled: boolean;
  truncatedByNodeLimit: boolean;
  truncatedByDepth: boolean;
  startTime: number;
  limitsUsed: SolverLimitsUsed;
  eps: number;
}): BranchAndBoundResult {
  const {
    problem,
    rootRelaxation,
    bestIntegerSolution,
    bestObjectiveValue,
    exploredNodes,
    prunedByBound,
    prunedInfeasible,
    integerSolutionsFound,
    maxDepthReached,
    accelerationsApplied,
    depthLimitHitCount,
    unresolvedBounds,
    stack,
    timedOut,
    wasCancelled,
    truncatedByNodeLimit,
    truncatedByDepth,
    startTime,
    limitsUsed,
    eps,
  } = params;

  const isMaximize = problem.sense === 'maximize';
  const executionTimeMs = performance.now() - startTime;
  const openNodesRemaining = stack.length;

  let status: BranchAndBoundStatus = 'optimal';
  let warningCode: BranchAndBoundWarningCode | undefined = undefined;
  let warning: string | undefined = undefined;

  if (wasCancelled) {
    status = 'cancelled';
    warningCode = 'cancelled';
    warning = bestIntegerSolution
      ? 'Computation cancelled by user. Showing best integer solution found; optimality is NOT proven.'
      : 'Computation cancelled by user before an integer solution was found.';
  } else if (timedOut) {
    status = 'time_limit_reached';
    warningCode = 'time_limit_reached';
    warning = bestIntegerSolution
      ? `Time limit (${(limitsUsed.timeoutMs / 1000).toFixed(1)}s) reached. Optimality is NOT proven.`
      : `Time limit (${(limitsUsed.timeoutMs / 1000).toFixed(1)}s) reached before finding an integer solution.`;
  } else if (truncatedByNodeLimit || openNodesRemaining > 0) {
    status = 'node_limit_reached';
    warningCode = 'node_limit_reached';
    warning = bestIntegerSolution
      ? `Node limit (${limitsUsed.maxNodes}) reached with ${openNodesRemaining} open nodes remaining. Optimality is NOT proven.`
      : `Node limit (${limitsUsed.maxNodes}) reached before finding an integer solution.`;
  } else if (truncatedByDepth) {
    status = 'depth_limit_reached';
    warningCode = 'depth_limit_reached';
    warning = bestIntegerSolution
      ? `Tree depth limit (${limitsUsed.maxDepth}) reached at ${depthLimitHitCount} node(s). Optimality is NOT proven.`
      : `Tree depth limit (${limitsUsed.maxDepth}) reached without finding a proven integer solution.`;
  } else if (!bestIntegerSolution) {
    status = 'infeasible';
    warningCode = 'infeasible';
    warning = 'No feasible integer solution exists within the constraints.';
  }

  let bestBound: number | undefined;
  if (status === 'optimal' && bestIntegerSolution) {
    bestBound = snapZero(bestObjectiveValue);
  } else if (status === 'infeasible') {
    bestBound = undefined;
  } else {
    const rawBound = computeOuterBound(
      isMaximize,
      unresolvedBounds,
      stack,
      bestIntegerSolution ? bestObjectiveValue : undefined
    );
    bestBound =
      rawBound !== undefined && Number.isFinite(rawBound)
        ? snapZero(rawBound)
        : snapZero(rootRelaxation.objectiveValue);
  }

  const cleanBestObj = bestIntegerSolution ? snapZero(bestObjectiveValue) : undefined;
  const integralityGapPercent = computeGapPercent(status, cleanBestObj, bestBound, eps);

  const stats: BranchAndBoundStats = {
    exploredNodes,
    prunedByBound,
    prunedInfeasible,
    integerSolutionsFound,
    maxDepthReached,
    executionTimeMs,
    integralityGapPercent,
    accelerationsApplied,
    depthLimitHitCount,
    openNodesRemaining,
  };

  return {
    status,
    bestIntegerSolution: bestIntegerSolution ? bestIntegerSolution.map((v) => snapZero(v)) : undefined,
    bestObjectiveValue: cleanBestObj,
    bestBound,
    lpRelaxation: rootRelaxation,
    stats,
    limitsUsed,
    matrixModeUsed: rootRelaxation.matrixModeUsed ?? 'dense',
    warning,
    warningCode,
  };
}

function buildLimitsUsed(options: BAndBOptions): SolverLimitsUsed {
  const maxNodesRaw = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxDepthRaw = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const timeoutMsRaw = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const epsRaw = options.eps ?? EPS;
  const pivotEpsRaw = options.pivotEps ?? PIVOT_EPS;
  return {
    maxNodes: Math.max(1, Math.floor(Number.isFinite(maxNodesRaw) ? maxNodesRaw : DEFAULT_MAX_NODES)),
    maxDepth: Math.max(0, Math.floor(Number.isFinite(maxDepthRaw) ? maxDepthRaw : DEFAULT_MAX_DEPTH)),
    timeoutMs: Math.max(10, Number.isFinite(timeoutMsRaw) ? timeoutMsRaw : DEFAULT_TIMEOUT_MS),
    branchingStrategy: options.branchingStrategy ?? 'most_fractional',
    sparseEnabled: options.sparseEnabled ?? true,
    eps: Number.isFinite(epsRaw) && epsRaw > 0 ? epsRaw : EPS,
    pivotEps: Number.isFinite(pivotEpsRaw) && pivotEpsRaw > 0 ? pivotEpsRaw : PIVOT_EPS,
  };
}

function createChildNodes(
  currentNode: BAndBNode,
  nodeSolution: SimplexSolution,
  problem: LpProblem,
  branchingStrategy: BranchingStrategy,
  eps: number,
  nextNodeIdRef: { id: number }
): BAndBNode[] {
  const branchVarIdx = selectBranchingVariable(
    nodeSolution.variableValues,
    problem.variables,
    branchingStrategy,
    eps
  );
  if (branchVarIdx === -1) return [];

  const varVal = nodeSolution.variableValues[branchVarIdx];
  const floorVal = Math.floor(varVal + eps);
  const ceilVal = Math.ceil(varVal - eps);

  const leftCoeffs = new Array<number>(problem.variables.length).fill(0);
  leftCoeffs[branchVarIdx] = 1;
  const leftConstraint: ConstraintDef = {
    id: `bb_L_${currentNode.id}_${branchVarIdx}_${floorVal}`,
    name: `${problem.variables[branchVarIdx].name} <= ${floorVal}`,
    coeffs: leftCoeffs,
    op: '<=',
    rhs: floorVal,
  };

  const rightCoeffs = new Array<number>(problem.variables.length).fill(0);
  rightCoeffs[branchVarIdx] = 1;
  const rightConstraint: ConstraintDef = {
    id: `bb_R_${currentNode.id}_${branchVarIdx}_${ceilVal}`,
    name: `${problem.variables[branchVarIdx].name} >= ${ceilVal}`,
    coeffs: rightCoeffs,
    op: '>=',
    rhs: ceilVal,
  };

  const leftNode: BAndBNode = {
    id: nextNodeIdRef.id++,
    depth: currentNode.depth + 1,
    constraints: [...currentNode.constraints, leftConstraint],
    bound: nodeSolution.objectiveValue,
  };

  const rightNode: BAndBNode = {
    id: nextNodeIdRef.id++,
    depth: currentNode.depth + 1,
    constraints: [...currentNode.constraints, rightConstraint],
    bound: nodeSolution.objectiveValue,
  };

  const distToFloor = varVal - floorVal;
  const distToCeil = ceilVal - varVal;
  // Push second-preferred branch first so preferred branch is popped first in LIFO stack
  if (distToFloor <= distToCeil) {
    return [rightNode, leftNode];
  }
  return [leftNode, rightNode];
}

export function solveBranchAndBound(
  problem: LpProblem,
  options: BAndBOptions = {}
): BranchAndBoundResult {
  const startTime = performance.now();
  const limitsUsed = buildLimitsUsed(options);
  const problemNormalized = buildNormalizedProblem(problem);

  const simplexOpts: SimplexOptions = {
    eps: limitsUsed.eps,
    pivotEps: limitsUsed.pivotEps,
    sparseEnabled: limitsUsed.sparseEnabled,
    shouldCancel: options.shouldCancel,
    cancelBuffer: options.cancelBuffer,
  };

  const rootRelaxation = solveTwoPhaseSimplex(problemNormalized, simplexOpts);
  const rootCheck = runRootSetup(problemNormalized, options, rootRelaxation, startTime, limitsUsed);
  if (rootCheck.earlyResult) {
    return rootCheck.earlyResult;
  }

  const isMaximize = problemNormalized.sense === 'maximize';
  let bestIntegerSolution: number[] | undefined = undefined;
  let bestObjectiveValue = isMaximize ? -Infinity : Infinity;
  let integerSolutionsFound = 0;
  let accelerationsApplied = 0;

  const heuristicCandidate = runPrimalHeuristic(
    rootRelaxation.variableValues,
    problemNormalized,
    limitsUsed.eps
  );
  if (heuristicCandidate) {
    bestIntegerSolution = heuristicCandidate.values;
    bestObjectiveValue = heuristicCandidate.objValue;
    integerSolutionsFound++;
    accelerationsApplied++;
  }

  let exploredNodes = 0;
  let prunedByBound = 0;
  let prunedInfeasible = 0;
  let maxDepthReached = 0;
  let depthLimitHitCount = 0;
  let timedOut = false;
  let wasCancelled = false;
  let truncatedByNodeLimit = false;
  let truncatedByDepth = false;
  const unresolvedBounds: number[] = [];
  const nextNodeIdRef = { id: 1 };

  const stack: BAndBNode[] = [
    {
      id: nextNodeIdRef.id++,
      depth: 0,
      constraints: [...problemNormalized.constraints],
      bound: rootRelaxation.objectiveValue,
    },
  ];

  while (stack.length > 0) {
    if (isCancelledNow(options)) {
      wasCancelled = true;
      break;
    }
    if (performance.now() - startTime > limitsUsed.timeoutMs) {
      timedOut = true;
      break;
    }
    if (exploredNodes >= limitsUsed.maxNodes) {
      truncatedByNodeLimit = true;
      break;
    }

    const currentNode = stack.pop()!;
    exploredNodes++;
    if (currentNode.depth > maxDepthReached) {
      maxDepthReached = currentNode.depth;
    }

    const nodeProblem: LpProblem = {
      ...problemNormalized,
      constraints: currentNode.constraints,
    };

    const nodeSolution = solveTwoPhaseSimplex(nodeProblem, simplexOpts);
    if (nodeSolution.status === 'cancelled') {
      wasCancelled = true;
      unresolvedBounds.push(currentNode.bound);
      break;
    }

    if (nodeSolution.status !== 'optimal') {
      prunedInfeasible++;
      continue;
    }

    const nodeObj = nodeSolution.objectiveValue;

    if (isMaximize) {
      if (bestIntegerSolution !== undefined && nodeObj <= bestObjectiveValue + limitsUsed.eps) {
        prunedByBound++;
        continue;
      }
    } else {
      if (bestIntegerSolution !== undefined && nodeObj >= bestObjectiveValue - limitsUsed.eps) {
        prunedByBound++;
        continue;
      }
    }

    if (isSolutionInteger(nodeSolution.variableValues, problemNormalized.variables, limitsUsed.eps)) {
      if (
        bestIntegerSolution === undefined ||
        (isMaximize && nodeObj > bestObjectiveValue + limitsUsed.eps) ||
        (!isMaximize && nodeObj < bestObjectiveValue - limitsUsed.eps)
      ) {
        bestObjectiveValue = nodeObj;
        bestIntegerSolution = nodeSolution.variableValues.map((v) => snapZero(v));
        integerSolutionsFound++;
      }
      continue;
    }

    if (currentNode.depth >= limitsUsed.maxDepth) {
      truncatedByDepth = true;
      depthLimitHitCount++;
      unresolvedBounds.push(nodeObj);
      continue;
    }

    const children = createChildNodes(
      currentNode,
      nodeSolution,
      problemNormalized,
      limitsUsed.branchingStrategy,
      limitsUsed.eps,
      nextNodeIdRef
    );
    if (children.length === 0) {
      unresolvedBounds.push(nodeObj);
      continue;
    }
    for (const child of children) {
      stack.push(child);
    }

    if (options.onProgress && (exploredNodes === 1 || exploredNodes % 5 === 0)) {
      options.onProgress({
        exploredNodes,
        maxNodes: limitsUsed.maxNodes,
        bestObjectiveValue: bestIntegerSolution ? snapZero(bestObjectiveValue) : undefined,
        bestIntegerSolution: bestIntegerSolution ? bestIntegerSolution.map((v) => snapZero(v)) : undefined,
        bestBound: computeOuterBound(
          isMaximize,
          unresolvedBounds,
          stack,
          bestIntegerSolution ? bestObjectiveValue : undefined
        ),
        openNodesRemaining: stack.length,
      });
    }
  }

  return finalizeBranchAndBoundResult({
    problem: problemNormalized,
    rootRelaxation,
    bestIntegerSolution,
    bestObjectiveValue,
    exploredNodes,
    prunedByBound,
    prunedInfeasible,
    integerSolutionsFound,
    maxDepthReached,
    accelerationsApplied,
    depthLimitHitCount,
    unresolvedBounds,
    stack,
    timedOut,
    wasCancelled,
    truncatedByNodeLimit,
    truncatedByDepth,
    startTime,
    limitsUsed,
    eps: limitsUsed.eps,
  });
}

export async function solveBranchAndBoundAsync(
  problem: LpProblem,
  options: BAndBOptions = {}
): Promise<BranchAndBoundResult> {
  const startTime = performance.now();
  const limitsUsed = buildLimitsUsed(options);
  const problemNormalized = buildNormalizedProblem(problem);
  const yieldEveryNodes = Math.max(1, options.yieldEveryNodes ?? DEFAULT_YIELD_EVERY_NODES);

  const simplexOpts: SimplexOptions = {
    eps: limitsUsed.eps,
    pivotEps: limitsUsed.pivotEps,
    sparseEnabled: limitsUsed.sparseEnabled,
    shouldCancel: options.shouldCancel,
    cancelBuffer: options.cancelBuffer,
  };

  const rootRelaxation = await solveTwoPhaseSimplexAsync(problemNormalized, simplexOpts);
  const rootCheck = runRootSetup(problemNormalized, options, rootRelaxation, startTime, limitsUsed);
  if (rootCheck.earlyResult) {
    return rootCheck.earlyResult;
  }

  const isMaximize = problemNormalized.sense === 'maximize';
  let bestIntegerSolution: number[] | undefined = undefined;
  let bestObjectiveValue = isMaximize ? -Infinity : Infinity;
  let integerSolutionsFound = 0;
  let accelerationsApplied = 0;

  const heuristicCandidate = runPrimalHeuristic(
    rootRelaxation.variableValues,
    problemNormalized,
    limitsUsed.eps
  );
  if (heuristicCandidate) {
    bestIntegerSolution = heuristicCandidate.values;
    bestObjectiveValue = heuristicCandidate.objValue;
    integerSolutionsFound++;
    accelerationsApplied++;
  }

  let exploredNodes = 0;
  let prunedByBound = 0;
  let prunedInfeasible = 0;
  let maxDepthReached = 0;
  let depthLimitHitCount = 0;
  let timedOut = false;
  let wasCancelled = false;
  let truncatedByNodeLimit = false;
  let truncatedByDepth = false;
  const unresolvedBounds: number[] = [];
  const nextNodeIdRef = { id: 1 };

  const stack: BAndBNode[] = [
    {
      id: nextNodeIdRef.id++,
      depth: 0,
      constraints: [...problemNormalized.constraints],
      bound: rootRelaxation.objectiveValue,
    },
  ];

  while (stack.length > 0) {
    if (isCancelledNow(options)) {
      wasCancelled = true;
      break;
    }
    if (performance.now() - startTime > limitsUsed.timeoutMs) {
      timedOut = true;
      break;
    }
    if (exploredNodes >= limitsUsed.maxNodes) {
      truncatedByNodeLimit = true;
      break;
    }

    const currentNode = stack.pop()!;
    exploredNodes++;
    if (currentNode.depth > maxDepthReached) {
      maxDepthReached = currentNode.depth;
    }

    const nodeProblem: LpProblem = {
      ...problemNormalized,
      constraints: currentNode.constraints,
    };

    const nodeSolution = await solveTwoPhaseSimplexAsync(nodeProblem, simplexOpts);
    if (nodeSolution.status === 'cancelled' || isCancelledNow(options)) {
      wasCancelled = true;
      unresolvedBounds.push(currentNode.bound);
      break;
    }

    if (nodeSolution.status === 'optimal') {
      const nodeObj = nodeSolution.objectiveValue;

      if (
        bestIntegerSolution !== undefined &&
        ((isMaximize && nodeObj <= bestObjectiveValue + limitsUsed.eps) ||
          (!isMaximize && nodeObj >= bestObjectiveValue - limitsUsed.eps))
      ) {
        prunedByBound++;
      } else if (
        isSolutionInteger(nodeSolution.variableValues, problemNormalized.variables, limitsUsed.eps)
      ) {
        if (
          bestIntegerSolution === undefined ||
          (isMaximize && nodeObj > bestObjectiveValue + limitsUsed.eps) ||
          (!isMaximize && nodeObj < bestObjectiveValue - limitsUsed.eps)
        ) {
          bestObjectiveValue = nodeObj;
          bestIntegerSolution = nodeSolution.variableValues.map((v) => snapZero(v));
          integerSolutionsFound++;
        }
      } else if (currentNode.depth >= limitsUsed.maxDepth) {
        truncatedByDepth = true;
        depthLimitHitCount++;
        unresolvedBounds.push(nodeObj);
      } else {
        const children = createChildNodes(
          currentNode,
          nodeSolution,
          problemNormalized,
          limitsUsed.branchingStrategy,
          limitsUsed.eps,
          nextNodeIdRef
        );
        if (children.length === 0) {
          unresolvedBounds.push(nodeObj);
        } else {
          for (const child of children) {
            stack.push(child);
          }
        }
      }
    } else {
      prunedInfeasible++;
    }

    if (options.onProgress && (exploredNodes === 1 || exploredNodes % yieldEveryNodes === 0)) {
      options.onProgress({
        exploredNodes,
        maxNodes: limitsUsed.maxNodes,
        bestObjectiveValue: bestIntegerSolution ? snapZero(bestObjectiveValue) : undefined,
        bestIntegerSolution: bestIntegerSolution ? bestIntegerSolution.map((v) => snapZero(v)) : undefined,
        bestBound: computeOuterBound(
          isMaximize,
          unresolvedBounds,
          stack,
          bestIntegerSolution ? bestObjectiveValue : undefined
        ),
        openNodesRemaining: stack.length,
      });
    }

    if (exploredNodes % yieldEveryNodes === 0 && stack.length > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return finalizeBranchAndBoundResult({
    problem: problemNormalized,
    rootRelaxation,
    bestIntegerSolution,
    bestObjectiveValue,
    exploredNodes,
    prunedByBound,
    prunedInfeasible,
    integerSolutionsFound,
    maxDepthReached,
    accelerationsApplied,
    depthLimitHitCount,
    unresolvedBounds,
    stack,
    timedOut,
    wasCancelled,
    truncatedByNodeLimit,
    truncatedByDepth,
    startTime,
    limitsUsed,
    eps: limitsUsed.eps,
  });
}

function isSolutionInteger(values: number[], variables: VariableDef[], eps: number = EPS): boolean {
  for (let j = 0; j < variables.length; j++) {
    const v = variables[j];
    if (v.type === 'integer' || v.type === 'binary') {
      if (!isInteger(values[j], eps)) {
        return false;
      }
      if (v.type === 'binary') {
        const val = Math.round(values[j]);
        if (val !== 0 && val !== 1) {
          return false;
        }
      }
    }
  }
  return true;
}

function selectBranchingVariable(
  values: number[],
  variables: VariableDef[],
  strategy: BranchingStrategy,
  eps: number = EPS
): number {
  if (strategy === 'first_fractional') {
    for (let j = 0; j < variables.length; j++) {
      const v = variables[j];
      if ((v.type === 'integer' || v.type === 'binary') && !isInteger(values[j], eps)) {
        return j;
      }
    }
    return -1;
  }

  let bestIdx = -1;
  let minDistanceToHalf = Infinity;

  for (let j = 0; j < variables.length; j++) {
    const v = variables[j];
    if (v.type === 'integer' || v.type === 'binary') {
      const val = values[j];
      if (!isInteger(val, eps)) {
        const frac = val - Math.floor(val);
        const dist = Math.abs(frac - 0.5);
        if (dist < minDistanceToHalf) {
          minDistanceToHalf = dist;
          bestIdx = j;
        }
      }
    }
  }

  return bestIdx;
}

function runPrimalHeuristic(
  values: number[],
  problem: LpProblem,
  eps: number = EPS
): { values: number[]; objValue: number } | null {
  const roundedValues = [...values];

  for (let j = 0; j < problem.variables.length; j++) {
    const v = problem.variables[j];
    if (v.type === 'integer' || v.type === 'binary') {
      let r = Math.round(roundedValues[j]);
      if (v.type === 'binary') {
        r = r <= 0 ? 0 : 1;
      }
      if (r < v.lowerBound - eps || r > v.upperBound + eps) {
        return null;
      }
      roundedValues[j] = r;
    }
  }

  for (const c of problem.constraints) {
    let lhs = 0;
    for (let j = 0; j < problem.variables.length; j++) {
      lhs += (c.coeffs[j] ?? 0) * roundedValues[j];
    }
    if (c.op === '<=' && lhs > c.rhs + eps) return null;
    if (c.op === '>=' && lhs < c.rhs - eps) return null;
    if (c.op === '=' && Math.abs(lhs - c.rhs) > eps) return null;
  }

  let obj = 0;
  for (let j = 0; j < problem.variables.length; j++) {
    obj += problem.variables[j].objCoeff * roundedValues[j];
  }

  return {
    values: roundedValues,
    objValue: obj,
  };
}
