/**
 * Sheeta Operations Research
 * Branch and Bound Engine with Primal Heuristic, Accelerations & Safety Limits
 */

import {
  BranchAndBoundResult,
  BranchAndBoundStats,
  BranchingStrategy,
  ConstraintDef,
  LpProblem,
  VariableDef,
} from '../types';
import { EPS, isInteger, snapZero } from './matrix';
import { solveTwoPhaseSimplex } from './simplexTwoPhase';

interface BAndBNode {
  id: number;
  depth: number;
  constraints: ConstraintDef[];
  bound: number; // Relaxation objective value
}

export interface BAndBOptions {
  branchingStrategy?: BranchingStrategy;
  maxNodes?: number;
  maxDepth?: number;
  timeoutMs?: number;
  shouldCancel?: () => boolean;
  onProgress?: (stats: Partial<BranchAndBoundStats>) => void;
}

export function solveBranchAndBound(
  problem: LpProblem,
  options: BAndBOptions = {}
): BranchAndBoundResult {
  const startTime = performance.now();
  const branchingStrategy = options.branchingStrategy || 'most_fractional';
  const maxNodes = options.maxNodes || 2000;
  const maxDepth = options.maxDepth || 60;
  const timeoutMs = options.timeoutMs || 30000;
  const shouldCancel = options.shouldCancel || (() => false);

  const isMaximize = problem.sense === 'maximize';

  // Normalize problem variables to protect against JSON null for Infinity
  const problemNormalized: LpProblem = {
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

  // 1. Solve root LP Relaxation
  const rootRelaxation = solveTwoPhaseSimplex(problemNormalized);

  if (rootRelaxation.status !== 'optimal') {
    return {
      status: rootRelaxation.status === 'infeasible' ? 'infeasible' : 'unbounded',
      lpRelaxation: rootRelaxation,
      stats: {
        exploredNodes: 1,
        prunedByBound: 0,
        prunedInfeasible: rootRelaxation.status === 'infeasible' ? 1 : 0,
        integerSolutionsFound: 0,
        maxDepthReached: 0,
        executionTimeMs: performance.now() - startTime,
        integralityGapPercent: 0,
        accelerationsApplied: 0,
      },
      warning: rootRelaxation.errorMessage,
    };
  }

  // Check if root LP relaxation is already fully integer
  if (isSolutionInteger(rootRelaxation.variableValues, problem.variables)) {
    return {
      status: 'optimal',
      bestIntegerSolution: rootRelaxation.variableValues.map(snapZero),
      bestObjectiveValue: snapZero(rootRelaxation.objectiveValue),
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
      },
    };
  }

  // 2. Fast Primal Heuristic: round relaxed solution and test feasibility to establish an early incumbent
  let bestIntegerSolution: number[] | undefined = undefined;
  let bestObjectiveValue = isMaximize ? -Infinity : Infinity;
  let integerSolutionsFound = 0;
  let accelerationsApplied = 0;

  const heuristicCandidate = runPrimalHeuristic(rootRelaxation.variableValues, problem);
  if (heuristicCandidate) {
    bestIntegerSolution = heuristicCandidate.values;
    bestObjectiveValue = heuristicCandidate.objValue;
    integerSolutionsFound++;
    accelerationsApplied++;
  }

  // 3. Branch and Bound Tree Exploration
  let exploredNodes = 0;
  let prunedByBound = 0;
  let prunedInfeasible = 0;
  let maxDepthReached = 0;
  let timedOut = false;
  let wasCancelled = false;

  let nextNodeId = 1;

  // Stack for Depth-First Search with child ordering to maximize early bound pruning
  const stack: BAndBNode[] = [
    {
      id: nextNodeId++,
      depth: 0,
      constraints: [...problem.constraints],
      bound: rootRelaxation.objectiveValue,
    },
  ];

  while (stack.length > 0) {
    if (shouldCancel()) {
      wasCancelled = true;
      break;
    }

    if (performance.now() - startTime > timeoutMs) {
      timedOut = true;
      break;
    }

    if (exploredNodes >= maxNodes) {
      break;
    }

    const currentNode = stack.pop()!;
    exploredNodes++;

    if (currentNode.depth > maxDepthReached) {
      maxDepthReached = currentNode.depth;
    }

    // Solve relaxation at current node
    const nodeProblem: LpProblem = {
      ...problem,
      constraints: currentNode.constraints,
    };

    const nodeSolution = solveTwoPhaseSimplex(nodeProblem);

    // Pruning Condition 1: Infeasible node
    if (nodeSolution.status !== 'optimal') {
      prunedInfeasible++;
      continue;
    }

    const nodeObj = nodeSolution.objectiveValue;

    // Pruning Condition 2: Bound pruning
    if (isMaximize) {
      if (nodeObj <= bestObjectiveValue + EPS) {
        prunedByBound++;
        continue;
      }
    } else {
      if (nodeObj >= bestObjectiveValue - EPS) {
        prunedByBound++;
        continue;
      }
    }

    // Check Integrality
    if (isSolutionInteger(nodeSolution.variableValues, problem.variables)) {
      // New integer solution found!
      if (
        (isMaximize && nodeObj > bestObjectiveValue + EPS) ||
        (!isMaximize && nodeObj < bestObjectiveValue - EPS)
      ) {
        bestObjectiveValue = nodeObj;
        bestIntegerSolution = nodeSolution.variableValues.map(snapZero);
        integerSolutionsFound++;
      }
      continue; // Prune by integrality
    }

    // Check tree depth limit
    if (currentNode.depth >= maxDepth) {
      continue;
    }

    // Select branching variable
    const branchVarIdx = selectBranchingVariable(
      nodeSolution.variableValues,
      problem.variables,
      branchingStrategy
    );

    if (branchVarIdx === -1) {
      continue;
    }

    const varVal = nodeSolution.variableValues[branchVarIdx];
    const floorVal = Math.floor(varVal);
    const ceilVal = Math.ceil(varVal);

    // Create constraint vectors for x[j] <= floorVal and x[j] >= ceilVal
    const leftCoeffs = new Array(problem.variables.length).fill(0);
    leftCoeffs[branchVarIdx] = 1;
    const leftConstraint: ConstraintDef = {
      id: `bb_L_${currentNode.id}_${branchVarIdx}_${floorVal}`,
      name: `${problem.variables[branchVarIdx].name} <= ${floorVal}`,
      coeffs: leftCoeffs,
      op: '<=',
      rhs: floorVal,
    };

    const rightCoeffs = new Array(problem.variables.length).fill(0);
    rightCoeffs[branchVarIdx] = 1;
    const rightConstraint: ConstraintDef = {
      id: `bb_R_${currentNode.id}_${branchVarIdx}_${ceilVal}`,
      name: `${problem.variables[branchVarIdx].name} >= ${ceilVal}`,
      coeffs: rightCoeffs,
      op: '>=',
      rhs: ceilVal,
    };

    const leftNode: BAndBNode = {
      id: nextNodeId++,
      depth: currentNode.depth + 1,
      constraints: [...currentNode.constraints, leftConstraint],
      bound: nodeObj,
    };

    const rightNode: BAndBNode = {
      id: nextNodeId++,
      depth: currentNode.depth + 1,
      constraints: [...currentNode.constraints, rightConstraint],
      bound: nodeObj,
    };

    // Child Ordering Acceleration: Explore the branch closest to the rounded integer first
    const distToFloor = varVal - floorVal;
    const distToCeil = ceilVal - varVal;

    if (distToFloor <= distToCeil) {
      // Closer to floor: push right first, then left (so left is popped and explored first)
      stack.push(rightNode);
      stack.push(leftNode);
    } else {
      stack.push(leftNode);
      stack.push(rightNode);
    }
  }

  const executionTimeMs = performance.now() - startTime;

  // Calculate Integrality Gap
  let integralityGapPercent = 0;
  if (bestIntegerSolution && Math.abs(rootRelaxation.objectiveValue) > EPS) {
    const diff = Math.abs(rootRelaxation.objectiveValue - bestObjectiveValue);
    integralityGapPercent = (diff / Math.abs(rootRelaxation.objectiveValue)) * 100;
  }

  const stats: BranchAndBoundStats = {
    exploredNodes,
    prunedByBound,
    prunedInfeasible,
    integerSolutionsFound,
    maxDepthReached,
    executionTimeMs,
    integralityGapPercent: Math.min(100, snapZero(integralityGapPercent)),
    accelerationsApplied,
  };

  let status: 'optimal' | 'feasible_timeout' | 'infeasible' | 'cancelled' = 'optimal';
  let warning: string | undefined = undefined;

  if (wasCancelled) {
    status = 'cancelled';
    warning = 'Computation stopped manually. Showing best integer solution found so far.';
  } else if (timedOut || exploredNodes >= maxNodes) {
    status = bestIntegerSolution ? 'feasible_timeout' : 'infeasible';
    warning = timedOut
      ? 'Safety timeout reached. Displaying best integer solution found.'
      : 'Maximum node limit reached. Displaying best integer solution found.';
  } else if (!bestIntegerSolution) {
    status = 'infeasible';
    warning = 'No feasible integer solution exists within the constraints.';
  }

  return {
    status,
    bestIntegerSolution: bestIntegerSolution ? bestIntegerSolution.map(snapZero) : undefined,
    bestObjectiveValue: bestIntegerSolution ? snapZero(bestObjectiveValue) : undefined,
    lpRelaxation: rootRelaxation,
    stats,
    warning,
  };
}

/**
 * Checks if all required integer/binary variables have integer values
 */
function isSolutionInteger(values: number[], variables: VariableDef[]): boolean {
  for (let j = 0; j < variables.length; j++) {
    const v = variables[j];
    if (v.type === 'integer' || v.type === 'binary') {
      if (!isInteger(values[j])) {
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

/**
 * Selects branching variable according to chosen strategy
 */
function selectBranchingVariable(
  values: number[],
  variables: VariableDef[],
  strategy: BranchingStrategy
): number {
  if (strategy === 'first_fractional') {
    for (let j = 0; j < variables.length; j++) {
      const v = variables[j];
      if ((v.type === 'integer' || v.type === 'binary') && !isInteger(values[j])) {
        return j;
      }
    }
    return -1;
  }

  // Most Fractional Strategy: find variable whose fractional part is closest to 0.5
  let bestIdx = -1;
  let minDistanceToHalf = Infinity;

  for (let j = 0; j < variables.length; j++) {
    const v = variables[j];
    if (v.type === 'integer' || v.type === 'binary') {
      const val = values[j];
      if (!isInteger(val)) {
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

/**
 * Fast Primal Heuristic:
 * Rounds fractional values of integer/binary variables and checks constraint feasibility
 */
function runPrimalHeuristic(
  values: number[],
  problem: LpProblem
): { values: number[]; objValue: number } | null {
  const roundedValues = [...values];

  for (let j = 0; j < problem.variables.length; j++) {
    const v = problem.variables[j];
    if (v.type === 'integer' || v.type === 'binary') {
      let r = Math.round(roundedValues[j]);
      if (v.type === 'binary') {
        r = r <= 0 ? 0 : 1;
      }
      // Check variable direct bounds
      if (r < v.lowerBound || r > v.upperBound) {
        return null;
      }
      roundedValues[j] = r;
    }
  }

  // Verify all constraints
  for (const c of problem.constraints) {
    let lhs = 0;
    for (let j = 0; j < problem.variables.length; j++) {
      lhs += c.coeffs[j] * roundedValues[j];
    }
    if (c.op === '<=' && lhs > c.rhs + EPS) {
      return null;
    }
    if (c.op === '>=' && lhs < c.rhs - EPS) {
      return null;
    }
    if (c.op === '=' && Math.abs(lhs - c.rhs) > EPS) {
      return null;
    }
  }

  // Compute objective
  let obj = 0;
  for (let j = 0; j < problem.variables.length; j++) {
    obj += problem.variables[j].objCoeff * roundedValues[j];
  }

  return {
    values: roundedValues,
    objValue: obj,
  };
}
