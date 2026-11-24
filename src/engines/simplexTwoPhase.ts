/**
 * Sheeta Operations Research
 * Two-Phase Simplex Solver with Bland's Rule, Sparse CSR Row Operations,
 * Dual Variables (Shadow Prices), Cooperative Async Yielding & Cancellation
 */

import {
  ConstraintSensitivity,
  LpProblem,
  SimplexSolution,
  SimplexStatus,
} from '../types';
import {
  CsrMatrix,
  EPS,
  PIVOT_EPS,
  SPARSITY_DENSITY_THRESHOLD,
  ZERO_TOLERANCE,
  snapZero,
} from './matrix';

const DEFAULT_MAX_ITERATIONS = 10000;
const DEFAULT_YIELD_EVERY = 25;

export interface SimplexOptions {
  eps?: number;
  pivotEps?: number;
  sparseEnabled?: boolean;
  forceSparse?: boolean;
  maxIterations?: number;
  shouldCancel?: () => boolean;
  cancelBuffer?: Int32Array;
  yieldEveryIterations?: number;
}

interface InternalConstraint {
  coeffs: number[];
  op: '<=' | '>=' | '=';
  rhs: number;
  originKind: 'constraint' | 'lb' | 'ub';
  originIndex: number; // constraint index or variable index
  flipped: boolean;
}

interface AuxVar {
  type: 'slack' | 'surplus' | 'artificial';
  rowIndex: number;
  colIndex: number;
}

interface PreparedSimplexState {
  earlyResult?: SimplexSolution;
  startTime: number;
  eps: number;
  pivotEps: number;
  zeroTol: number;
  maxIterations: number;
  useSparse: boolean;
  problem: LpProblem;
  numOriginalVars: number;
  constraints: InternalConstraint[];
  m: number;
  totalCols: number;
  rhsCol: number;
  auxVars: AuxVar[];
  artificialColIndices: number[];
  artificialSet: Set<number>;
  basis: number[];
  tableau: number[][];
  bInv: number[][];
}

function isCancelledNow(options: SimplexOptions): boolean {
  if (options.cancelBuffer && Atomics.load(options.cancelBuffer, 0) !== 0) {
    return true;
  }
  return Boolean(options.shouldCancel && options.shouldCancel());
}

/**
 * Computes exact slack/surplus values aligned 1-to-1 with problem.constraints
 */
export function computeOriginalConstraintDetails(
  problem: LpProblem,
  variableValues: number[],
  dualValues?: number[],
  tol: number = ZERO_TOLERANCE
): ConstraintSensitivity[] {
  return problem.constraints.map((c, idx) => {
    let lhs = 0;
    for (let j = 0; j < problem.variables.length; j++) {
      lhs += (c.coeffs[j] ?? 0) * (variableValues[j] ?? 0);
    }
    const cleanLhs = snapZero(lhs, tol);
    let slackOrSurplus = 0;
    let kind: 'slack' | 'surplus' | 'equality' = 'slack';
    if (c.op === '<=') {
      slackOrSurplus = Math.max(0, c.rhs - cleanLhs);
      kind = 'slack';
    } else if (c.op === '>=') {
      slackOrSurplus = Math.max(0, cleanLhs - c.rhs);
      kind = 'surplus';
    } else {
      slackOrSurplus = Math.abs(c.rhs - cleanLhs);
      kind = 'equality';
    }
    return {
      id: c.id,
      name: c.name,
      op: c.op,
      rhs: c.rhs,
      lhs: cleanLhs,
      slackOrSurplus: snapZero(slackOrSurplus, tol),
      kind,
      dualValue: snapZero(dualValues?.[idx] ?? 0, tol),
    };
  });
}

function prepareSimplex(problem: LpProblem, options: SimplexOptions): PreparedSimplexState {
  const startTime = performance.now();
  const eps = options.eps ?? EPS;
  const pivotEps = options.pivotEps ?? PIVOT_EPS;
  const zeroTol = Math.min(ZERO_TOLERANCE, pivotEps);
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const sparseEnabled = options.sparseEnabled ?? true;

  const numOriginalVars = problem.variables.length;
  if (numOriginalVars === 0) {
    return {
      earlyResult: {
        status: 'infeasible',
        objectiveValue: 0,
        variableValues: [],
        slackValues: [],
        dualValues: new Array(problem.constraints.length).fill(0),
        matrixModeUsed: 'dense',
        iterations: 0,
        executionTimeMs: 0,
        errorMessage: 'Problem has no decision variables.',
      },
      startTime,
      eps,
      pivotEps,
      zeroTol,
      maxIterations,
      useSparse: false,
      problem,
      numOriginalVars,
      constraints: [],
      m: 0,
      totalCols: 0,
      rhsCol: 0,
      auxVars: [],
      artificialColIndices: [],
      artificialSet: new Set(),
      basis: [],
      tableau: [],
      bInv: [],
    };
  }

  const normalizedVariables = problem.variables.map((v) => ({
    ...v,
    lowerBound:
      v.lowerBound !== null && v.lowerBound !== undefined && Number.isFinite(v.lowerBound)
        ? v.lowerBound
        : 0,
    upperBound:
      v.upperBound !== null && v.upperBound !== undefined && Number.isFinite(v.upperBound)
        ? v.upperBound
        : Infinity,
  }));

  for (const v of normalizedVariables) {
    if (v.lowerBound > v.upperBound + eps) {
      return {
        earlyResult: {
          status: 'infeasible',
          objectiveValue: 0,
          variableValues: new Array(numOriginalVars).fill(0),
          slackValues: new Array(problem.constraints.length).fill(0),
          dualValues: new Array(problem.constraints.length).fill(0),
          matrixModeUsed: 'dense',
          iterations: 0,
          executionTimeMs: performance.now() - startTime,
          errorMessage: `Conflicting bounds for variable ${v.name}: LB (${v.lowerBound}) > UB (${v.upperBound})`,
        },
        startTime,
        eps,
        pivotEps,
        zeroTol,
        maxIterations,
        useSparse: false,
        problem,
        numOriginalVars,
        constraints: [],
        m: 0,
        totalCols: 0,
        rhsCol: 0,
        auxVars: [],
        artificialColIndices: [],
        artificialSet: new Set(),
        basis: [],
        tableau: [],
        bInv: [],
      };
    }
  }

  const constraints: InternalConstraint[] = [];
  for (let i = 0; i < problem.constraints.length; i++) {
    const c = problem.constraints[i];
    constraints.push({
      coeffs: [...c.coeffs],
      op: c.op,
      rhs: c.rhs,
      originKind: 'constraint',
      originIndex: i,
      flipped: false,
    });
  }

  for (let j = 0; j < numOriginalVars; j++) {
    const v = normalizedVariables[j];
    if (v.lowerBound > eps) {
      const coeffs = new Array<number>(numOriginalVars).fill(0);
      coeffs[j] = 1;
      constraints.push({
        coeffs,
        op: '>=',
        rhs: v.lowerBound,
        originKind: 'lb',
        originIndex: j,
        flipped: false,
      });
    }
    if (v.upperBound < Infinity) {
      const coeffs = new Array<number>(numOriginalVars).fill(0);
      coeffs[j] = 1;
      constraints.push({
        coeffs,
        op: '<=',
        rhs: v.upperBound,
        originKind: 'ub',
        originIndex: j,
        flipped: false,
      });
    }
  }

  const m = constraints.length;

  if (m === 0) {
    const isMax = problem.sense === 'maximize';
    let unbounded = false;
    const vals = new Array<number>(numOriginalVars).fill(0);
    for (let j = 0; j < numOriginalVars; j++) {
      const c = problem.variables[j].objCoeff;
      if ((isMax && c > eps) || (!isMax && c < -eps)) {
        unbounded = true;
      }
    }
    return {
      earlyResult: unbounded
        ? {
            status: 'unbounded',
            objectiveValue: 0,
            variableValues: vals,
            slackValues: [],
            dualValues: [],
            matrixModeUsed: 'dense',
            iterations: 0,
            executionTimeMs: performance.now() - startTime,
            errorMessage: 'Unconstrained problem is unbounded.',
          }
        : {
            status: 'optimal',
            objectiveValue: 0,
            variableValues: vals,
            slackValues: [],
            dualValues: [],
            constraintDetails: [],
            matrixModeUsed: 'dense',
            iterations: 0,
            executionTimeMs: performance.now() - startTime,
          },
      startTime,
      eps,
      pivotEps,
      zeroTol,
      maxIterations,
      useSparse: false,
      problem,
      numOriginalVars,
      constraints,
      m: 0,
      totalCols: 0,
      rhsCol: 0,
      auxVars: [],
      artificialColIndices: [],
      artificialSet: new Set(),
      basis: [],
      tableau: [],
      bInv: [],
    };
  }

  // Decide sparse vs dense mode using CSR density over the normalized constraint matrix
  const csr = CsrMatrix.fromConstraints(constraints, numOriginalVars, zeroTol);
  const useSparse = Boolean(
    sparseEnabled &&
      (options.forceSparse || (csr.density <= SPARSITY_DENSITY_THRESHOLD && m * numOriginalVars >= 16))
  );

  // Step 1: Normalize constraints to have non-negative RHS
  for (let i = 0; i < m; i++) {
    if (constraints[i].rhs < 0) {
      constraints[i].rhs = -constraints[i].rhs;
      for (let j = 0; j < numOriginalVars; j++) {
        constraints[i].coeffs[j] = -constraints[i].coeffs[j];
      }
      if (constraints[i].op === '<=') {
        constraints[i].op = '>=';
      } else if (constraints[i].op === '>=') {
        constraints[i].op = '<=';
      }
      constraints[i].flipped = !constraints[i].flipped;
    }
  }

  // Step 2: Determine auxiliary variables
  const auxVars: AuxVar[] = [];
  let colCounter = numOriginalVars;
  const artificialColIndices: number[] = [];
  const initialBasis: number[] = new Array<number>(m).fill(-1);

  for (let i = 0; i < m; i++) {
    const op = constraints[i].op;
    if (op === '<=') {
      auxVars.push({ type: 'slack', rowIndex: i, colIndex: colCounter });
      initialBasis[i] = colCounter;
      colCounter++;
    } else if (op === '>=') {
      auxVars.push({ type: 'surplus', rowIndex: i, colIndex: colCounter });
      colCounter++;
      auxVars.push({ type: 'artificial', rowIndex: i, colIndex: colCounter });
      artificialColIndices.push(colCounter);
      initialBasis[i] = colCounter;
      colCounter++;
    } else if (op === '=') {
      auxVars.push({ type: 'artificial', rowIndex: i, colIndex: colCounter });
      artificialColIndices.push(colCounter);
      initialBasis[i] = colCounter;
      colCounter++;
    }
  }

  const totalCols = colCounter;
  const rhsCol = totalCols;
  const tableau: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(totalCols + 1).fill(0)
  );
  const bInv: number[][] = Array.from({ length: m }, (_, i) => {
    const row = new Array<number>(m).fill(0);
    row[i] = 1;
    return row;
  });

  // Populate constraint rows
  if (useSparse) {
    // Use CSR to populate only nonzero entries
    const normCsr = CsrMatrix.fromConstraints(constraints, numOriginalVars, zeroTol);
    for (let i = 0; i < m; i++) {
      const row = i + 1;
      normCsr.forEachInRow(i, (col, val) => {
        tableau[row][col] = val;
      });
      tableau[row][rhsCol] = constraints[i].rhs;
    }
  } else {
    for (let i = 0; i < m; i++) {
      const row = i + 1;
      for (let j = 0; j < numOriginalVars; j++) {
        tableau[row][j] = constraints[i].coeffs[j] ?? 0;
      }
      tableau[row][rhsCol] = constraints[i].rhs;
    }
  }

  for (const aux of auxVars) {
    const row = aux.rowIndex + 1;
    tableau[row][aux.colIndex] = aux.type === 'surplus' ? -1 : 1;
  }

  return {
    startTime,
    eps,
    pivotEps,
    zeroTol,
    maxIterations,
    useSparse,
    problem,
    numOriginalVars,
    constraints,
    m,
    totalCols,
    rhsCol,
    auxVars,
    artificialColIndices,
    artificialSet: new Set(artificialColIndices),
    basis: [...initialBasis],
    tableau,
    bInv,
  };
}

function finalizeSimplexSolution(
  state: PreparedSimplexState,
  phase2Status: SimplexStatus,
  iterations: number,
  origCost: number[]
): SimplexSolution {
  const {
    problem,
    numOriginalVars,
    constraints,
    m,
    rhsCol,
    basis,
    tableau,
    bInv,
    zeroTol,
    useSparse,
    startTime,
  } = state;
  const isMaximize = problem.sense === 'maximize';

  const varValues = new Array<number>(numOriginalVars).fill(0);
  for (let i = 0; i < m; i++) {
    const basicVar = basis[i];
    const val = snapZero(tableau[i + 1][rhsCol], zeroTol);
    if (basicVar < numOriginalVars) {
      varValues[basicVar] = val;
    }
  }
  const cleanVars = varValues.map((v) => snapZero(v, zeroTol));

  // Compute exact Dual Values (Shadow Prices) from inverse basis matrix B^{-1}:
  // y^T = c_B^T * B^{-1}. For Minimize, user Z = -(-Z) => negate reduced dual.
  // If row i was flipped during RHS normalization, negate again.
  const dualValues = new Array<number>(problem.constraints.length).fill(0);
  const boundDuals: { varIndex: number; kind: 'lb' | 'ub'; dualValue: number }[] = [];

  if (phase2Status === 'optimal') {
    for (let i = 0; i < m; i++) {
      let yNorm = 0;
      for (let r = 0; r < m; r++) {
        const bVar = basis[r];
        const cb = origCost[bVar] ?? 0;
        if (Math.abs(cb) > zeroTol) {
          yNorm += cb * bInv[r][i];
        }
      }
      let userDual = isMaximize ? yNorm : -yNorm;
      if (constraints[i].flipped) {
        userDual = -userDual;
      }
      userDual = snapZero(userDual, zeroTol);

      const originKind = constraints[i].originKind;
      if (originKind === 'constraint') {
        dualValues[constraints[i].originIndex] = userDual;
      } else {
        boundDuals.push({
          varIndex: constraints[i].originIndex,
          kind: originKind,
          dualValue: userDual,
        });
      }
    }
  }

  const constraintDetails = computeOriginalConstraintDetails(
    problem,
    cleanVars,
    dualValues,
    zeroTol
  );
  const slackValues = constraintDetails.map((d) => d.slackOrSurplus);

  const rawObj = tableau[0][rhsCol];
  const finalObj = snapZero(isMaximize ? rawObj : -rawObj, zeroTol);

  return {
    status: phase2Status,
    objectiveValue: finalObj,
    variableValues: cleanVars,
    slackValues,
    dualValues,
    constraintDetails,
    boundDuals,
    matrixModeUsed: useSparse ? 'sparse' : 'dense',
    iterations,
    executionTimeMs: performance.now() - startTime,
    errorMessage:
      phase2Status === 'unbounded'
        ? 'Problem is unbounded (objective can increase infinitely).'
        : phase2Status === 'iteration_limit'
        ? 'Simplex iteration safety limit reached.'
        : phase2Status === 'cancelled'
        ? 'Simplex computation cancelled.'
        : undefined,
  };
}

function stepPhase(
  state: PreparedSimplexState,
  skipArtificialCols: boolean
): 'done' | 'unbounded' | 'stepped' {
  const { tableau, bInv, basis, m, totalCols, rhsCol, eps, pivotEps, zeroTol, artificialSet, useSparse } =
    state;

  let pivotCol = -1;
  for (let j = 0; j < totalCols; j++) {
    if (skipArtificialCols && artificialSet.has(j)) continue;
    if (tableau[0][j] < -eps) {
      pivotCol = j;
      break; // Bland's rule
    }
  }

  if (pivotCol === -1) {
    return 'done';
  }

  let pivotRow = -1;
  let minRatio = Infinity;
  for (let i = 0; i < m; i++) {
    const a_ij = tableau[i + 1][pivotCol];
    if (a_ij > pivotEps) {
      const ratio = tableau[i + 1][rhsCol] / a_ij;
      if (ratio < minRatio - eps) {
        minRatio = ratio;
        pivotRow = i + 1;
      } else if (Math.abs(ratio - minRatio) <= eps) {
        if (pivotRow === -1 || basis[i] < basis[pivotRow - 1]) {
          pivotRow = i + 1;
        }
      }
    }
  }

  if (pivotRow === -1) {
    return 'unbounded';
  }

  pivotWithBInv(tableau, bInv, pivotRow, pivotCol, totalCols + 1, zeroTol, useSparse);
  basis[pivotRow - 1] = pivotCol;
  return 'stepped';
}

function setupPhase1(state: PreparedSimplexState): void {
  const { artificialColIndices, basis, m, rhsCol, tableau, artificialSet } = state;
  for (const artCol of artificialColIndices) {
    tableau[0][artCol] = 0;
  }
  for (let i = 0; i < m; i++) {
    if (artificialSet.has(basis[i])) {
      for (let j = 0; j <= rhsCol; j++) {
        tableau[0][j] -= tableau[i + 1][j];
      }
    }
  }
}

function checkPhase1FeasibilityAndSetupPhase2(
  state: PreparedSimplexState,
  iterations: number
): { infeasibleResult?: SimplexSolution; origCost?: number[] } {
  const {
    problem,
    numOriginalVars,
    m,
    totalCols,
    rhsCol,
    tableau,
    bInv,
    basis,
    eps,
    pivotEps,
    zeroTol,
    useSparse,
    artificialSet,
    startTime,
  } = state;

  const phase1Obj = Math.abs(tableau[0][rhsCol]);
  if (phase1Obj > Math.max(1e-4, eps * 100)) {
    return {
      infeasibleResult: {
        status: 'infeasible',
        objectiveValue: 0,
        variableValues: new Array<number>(numOriginalVars).fill(0),
        slackValues: new Array<number>(problem.constraints.length).fill(0),
        dualValues: new Array<number>(problem.constraints.length).fill(0),
        matrixModeUsed: useSparse ? 'sparse' : 'dense',
        iterations,
        executionTimeMs: performance.now() - startTime,
        errorMessage: 'Problem is infeasible (Phase I objective cannot reach zero).',
      },
    };
  }

  for (let i = 0; i < m; i++) {
    if (artificialSet.has(basis[i])) {
      if (tableau[i + 1][rhsCol] > eps) {
        return {
          infeasibleResult: {
            status: 'infeasible',
            objectiveValue: 0,
            variableValues: new Array<number>(numOriginalVars).fill(0),
            slackValues: new Array<number>(problem.constraints.length).fill(0),
            dualValues: new Array<number>(problem.constraints.length).fill(0),
            matrixModeUsed: useSparse ? 'sparse' : 'dense',
            iterations,
            executionTimeMs: performance.now() - startTime,
            errorMessage: 'Artificial variable remains positive in basis.',
          },
        };
      }
      for (let j = 0; j < totalCols; j++) {
        if (!artificialSet.has(j) && Math.abs(tableau[i + 1][j]) > pivotEps) {
          pivotWithBInv(tableau, bInv, i + 1, j, totalCols + 1, zeroTol, useSparse);
          basis[i] = j;
          break;
        }
      }
    }
  }

  const isMaximize = problem.sense === 'maximize';
  const origCost = new Array<number>(totalCols).fill(0);
  for (let j = 0; j < numOriginalVars; j++) {
    const coeff = problem.variables[j].objCoeff;
    origCost[j] = isMaximize ? coeff : -coeff;
  }

  tableau[0].fill(0);
  for (let j = 0; j < numOriginalVars; j++) {
    tableau[0][j] = -origCost[j];
  }

  for (const artCol of artificialSet) {
    for (let r = 0; r <= m; r++) {
      tableau[r][artCol] = 0;
    }
  }

  for (let i = 0; i < m; i++) {
    const basicVar = basis[i];
    if (basicVar < totalCols && !artificialSet.has(basicVar)) {
      const cb = origCost[basicVar];
      if (Math.abs(cb) > zeroTol) {
        for (let j = 0; j <= rhsCol; j++) {
          tableau[0][j] += cb * tableau[i + 1][j];
        }
      }
    }
  }

  return { origCost };
}

function makeCancelledResult(state: PreparedSimplexState, iterations: number): SimplexSolution {
  return {
    status: 'cancelled',
    objectiveValue: 0,
    variableValues: new Array<number>(state.numOriginalVars).fill(0),
    slackValues: new Array<number>(state.problem.constraints.length).fill(0),
    dualValues: new Array<number>(state.problem.constraints.length).fill(0),
    matrixModeUsed: state.useSparse ? 'sparse' : 'dense',
    iterations,
    executionTimeMs: performance.now() - state.startTime,
    errorMessage: 'Simplex computation cancelled by user.',
  };
}

export function solveTwoPhaseSimplex(
  problem: LpProblem,
  options: SimplexOptions = {}
): SimplexSolution {
  const state = prepareSimplex(problem, options);
  if (state.earlyResult) return state.earlyResult;

  let iterations = 0;

  if (state.artificialColIndices.length > 0) {
    setupPhase1(state);
    while (iterations < state.maxIterations) {
      if (isCancelledNow(options)) return makeCancelledResult(state, iterations);
      iterations++;
      const res = stepPhase(state, false);
      if (res !== 'stepped') break;
    }
  }

  const p2 = checkPhase1FeasibilityAndSetupPhase2(state, iterations);
  if (p2.infeasibleResult) return p2.infeasibleResult;

  let phase2Status: SimplexStatus = 'optimal';
  while (iterations < state.maxIterations) {
    if (isCancelledNow(options)) return makeCancelledResult(state, iterations);
    iterations++;
    const res = stepPhase(state, true);
    if (res === 'done') break;
    if (res === 'unbounded') {
      phase2Status = 'unbounded';
      break;
    }
  }

  if (iterations >= state.maxIterations && phase2Status === 'optimal') {
    phase2Status = 'iteration_limit';
  }

  return finalizeSimplexSolution(state, phase2Status, iterations, p2.origCost!);
}

export async function solveTwoPhaseSimplexAsync(
  problem: LpProblem,
  options: SimplexOptions = {}
): Promise<SimplexSolution> {
  const state = prepareSimplex(problem, options);
  if (state.earlyResult) return state.earlyResult;

  const yieldEvery = Math.max(1, options.yieldEveryIterations ?? DEFAULT_YIELD_EVERY);
  let iterations = 0;

  if (state.artificialColIndices.length > 0) {
    setupPhase1(state);
    while (iterations < state.maxIterations) {
      if (isCancelledNow(options)) return makeCancelledResult(state, iterations);
      iterations++;
      const res = stepPhase(state, false);
      if (res !== 'stepped') break;
      if (iterations % yieldEvery === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  const p2 = checkPhase1FeasibilityAndSetupPhase2(state, iterations);
  if (p2.infeasibleResult) return p2.infeasibleResult;

  let phase2Status: SimplexStatus = 'optimal';
  while (iterations < state.maxIterations) {
    if (isCancelledNow(options)) return makeCancelledResult(state, iterations);
    iterations++;
    const res = stepPhase(state, true);
    if (res === 'done') break;
    if (res === 'unbounded') {
      phase2Status = 'unbounded';
      break;
    }
    if (iterations % yieldEvery === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (iterations >= state.maxIterations && phase2Status === 'optimal') {
    phase2Status = 'iteration_limit';
  }

  return finalizeSimplexSolution(state, phase2Status, iterations, p2.origCost!);
}

/**
 * Elementary Row Operation Pivot updating both Tableau and Basis Inverse BInv.
 * When useSparse is active, only nonzero columns of the pivot row are visited.
 */
function pivotWithBInv(
  tableau: number[][],
  bInv: number[][],
  pivotRow: number,
  pivotCol: number,
  numCols: number,
  zeroTol: number,
  useSparse: boolean
): void {
  const pivotElement = tableau[pivotRow][pivotCol];
  const m = bInv.length;
  const bRowIdx = pivotRow - 1;

  // Scale pivot row and corresponding BInv row
  const activeCols: number[] = [];
  for (let j = 0; j < numCols; j++) {
    const scaled = tableau[pivotRow][j] / pivotElement;
    tableau[pivotRow][j] = scaled;
    if (useSparse && Math.abs(scaled) > zeroTol) {
      activeCols.push(j);
    }
  }
  tableau[pivotRow][pivotCol] = 1;

  for (let k = 0; k < m; k++) {
    bInv[bRowIdx][k] /= pivotElement;
  }

  if (useSparse) {
    // Eliminate other rows using ONLY nonzero columns in pivotRow + BInv nonzero entries
    const activeBInvCols: number[] = [];
    for (let k = 0; k < m; k++) {
      if (Math.abs(bInv[bRowIdx][k]) > zeroTol) {
        activeBInvCols.push(k);
      }
    }

    for (let i = 0; i < tableau.length; i++) {
      if (i === pivotRow) continue;
      const factor = tableau[i][pivotCol];
      if (Math.abs(factor) > zeroTol) {
        for (let idx = 0; idx < activeCols.length; idx++) {
          const j = activeCols[idx];
          tableau[i][j] -= factor * tableau[pivotRow][j];
        }
        tableau[i][pivotCol] = 0;

        if (i >= 1) {
          const rInv = i - 1;
          for (let idx = 0; idx < activeBInvCols.length; idx++) {
            const k = activeBInvCols[idx];
            bInv[rInv][k] -= factor * bInv[bRowIdx][k];
          }
        }
      }
    }
  } else {
    for (let i = 0; i < tableau.length; i++) {
      if (i === pivotRow) continue;
      const factor = tableau[i][pivotCol];
      if (Math.abs(factor) > zeroTol) {
        for (let j = 0; j < numCols; j++) {
          tableau[i][j] -= factor * tableau[pivotRow][j];
        }
        tableau[i][pivotCol] = 0;

        if (i >= 1) {
          const rInv = i - 1;
          for (let k = 0; k < m; k++) {
            bInv[rInv][k] -= factor * bInv[bRowIdx][k];
          }
        }
      }
    }
  }
}
