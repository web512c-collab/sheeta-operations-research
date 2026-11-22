/**
 * Sheeta Operations Research
 * Two-Phase Simplex Solver with Bland's Rule, Infeasibility & Unboundedness Detection
 */

import { LpProblem, SimplexSolution, SimplexStatus } from '../types';
import { EPS, PIVOT_EPS, ZERO_TOLERANCE, snapZero } from './matrix';

const MAX_ITERATIONS = 10000;

interface InternalConstraint {
  coeffs: number[];
  op: '<=' | '>=' | '=';
  rhs: number;
}

export function solveTwoPhaseSimplex(problem: LpProblem): SimplexSolution {
  const startTime = performance.now();

  // Immutability: Deep clone variables and constraints
  const numOriginalVars = problem.variables.length;
  if (numOriginalVars === 0) {
    return {
      status: 'infeasible',
      objectiveValue: 0,
      variableValues: [],
      slackValues: [],
      iterations: 0,
      executionTimeMs: 0,
      errorMessage: 'Problem has no decision variables.',
    };
  }

  // Pre-check for conflicting direct bounds and normalize (JSON null -> Infinity)
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
    if (v.lowerBound > v.upperBound) {
      return {
        status: 'infeasible',
        objectiveValue: 0,
        variableValues: new Array(numOriginalVars).fill(0),
        slackValues: [],
        iterations: 0,
        executionTimeMs: performance.now() - startTime,
        errorMessage: `Conflicting bounds for variable ${v.name}: LB (${v.lowerBound}) > UB (${v.upperBound})`,
      };
    }
  }

  // Collect all constraints, including explicit bounds as constraints
  const constraints: InternalConstraint[] = [];

  for (const c of problem.constraints) {
    constraints.push({
      coeffs: [...c.coeffs],
      op: c.op,
      rhs: c.rhs,
    });
  }

  // Add lower bound constraints if > 0 and finite upper bounds
  for (let j = 0; j < numOriginalVars; j++) {
    const v = normalizedVariables[j];
    if (v.lowerBound > 0) {
      const coeffs = new Array(numOriginalVars).fill(0);
      coeffs[j] = 1;
      constraints.push({ coeffs, op: '>=', rhs: v.lowerBound });
    }
    if (v.upperBound < Infinity) {
      const coeffs = new Array(numOriginalVars).fill(0);
      coeffs[j] = 1;
      constraints.push({ coeffs, op: '<=', rhs: v.upperBound });
    }
  }

  const m = constraints.length;

  // If no constraints at all, problem is either trivial or unbounded
  if (m === 0) {
    // Check if any objective coeff drives it to infinity
    const isMax = problem.sense === 'maximize';
    let unbounded = false;
    const vals = new Array(numOriginalVars).fill(0);
    for (let j = 0; j < numOriginalVars; j++) {
      const c = problem.variables[j].objCoeff;
      if ((isMax && c > EPS) || (!isMax && c < -EPS)) {
        unbounded = true;
      }
    }
    if (unbounded) {
      return {
        status: 'unbounded',
        objectiveValue: 0,
        variableValues: vals,
        slackValues: [],
        iterations: 0,
        executionTimeMs: performance.now() - startTime,
        errorMessage: 'Unconstrained problem is unbounded.',
      };
    }
    return {
      status: 'optimal',
      objectiveValue: 0,
      variableValues: vals,
      slackValues: [],
      iterations: 0,
      executionTimeMs: performance.now() - startTime,
    };
  }

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
    }
  }

  // Step 2: Determine auxiliary variables needed (slack, surplus, artificial)
  interface AuxVar {
    type: 'slack' | 'surplus' | 'artificial';
    rowIndex: number;
    colIndex: number;
  }

  const auxVars: AuxVar[] = [];
  let colCounter = numOriginalVars;

  // Track which constraint gets which variables
  const artificialColIndices: number[] = [];
  const initialBasis: number[] = new Array(m).fill(-1);

  for (let i = 0; i < m; i++) {
    const op = constraints[i].op;
    if (op === '<=') {
      // Slack variable (+1)
      auxVars.push({ type: 'slack', rowIndex: i, colIndex: colCounter });
      initialBasis[i] = colCounter;
      colCounter++;
    } else if (op === '>=') {
      // Surplus variable (-1)
      auxVars.push({ type: 'surplus', rowIndex: i, colIndex: colCounter });
      colCounter++;
      // Artificial variable (+1)
      auxVars.push({ type: 'artificial', rowIndex: i, colIndex: colCounter });
      artificialColIndices.push(colCounter);
      initialBasis[i] = colCounter;
      colCounter++;
    } else if (op === '=') {
      // Artificial variable (+1)
      auxVars.push({ type: 'artificial', rowIndex: i, colIndex: colCounter });
      artificialColIndices.push(colCounter);
      initialBasis[i] = colCounter;
      colCounter++;
    }
  }

  const totalCols = colCounter; // Variables + Auxiliaries
  const numArtificials = artificialColIndices.length;

  // Build Phase I tableau
  // Rows: row 0 is Phase I objective, rows 1..m are constraints
  // Columns: 0..totalCols - 1, and the last column is RHS
  const rhsCol = totalCols;
  const tableau: number[][] = Array.from({ length: m + 1 }, () => new Array(totalCols + 1).fill(0));

  // Populate constraint rows
  for (let i = 0; i < m; i++) {
    const row = i + 1;
    for (let j = 0; j < numOriginalVars; j++) {
      tableau[row][j] = constraints[i].coeffs[j];
    }
    tableau[row][rhsCol] = constraints[i].rhs;
  }

  // Populate auxiliary columns in constraint rows
  for (const aux of auxVars) {
    const row = aux.rowIndex + 1;
    if (aux.type === 'slack' || aux.type === 'artificial') {
      tableau[row][aux.colIndex] = 1;
    } else if (aux.type === 'surplus') {
      tableau[row][aux.colIndex] = -1;
    }
  }

  let basis = [...initialBasis];
  let iterations = 0;

  // ==========================================
  // PHASE I: Minimize W = sum of artificials
  // ==========================================
  if (numArtificials > 0) {
    // In canonical form, W = sum(a_k) = sum(b_i - sum(A_ij x_j))
    // Row 0 starts as 0, then we subtract each artificial constraint row from row 0
    for (const artCol of artificialColIndices) {
      tableau[0][artCol] = 0;
    }

    // Add constraint rows having artificial variables to row 0 (since W - sum(a) = 0 => W + sum(constraints) where a coeff is -1)
    for (let i = 0; i < m; i++) {
      if (artificialColIndices.includes(basis[i])) {
        for (let j = 0; j <= rhsCol; j++) {
          tableau[0][j] -= tableau[i + 1][j];
        }
      }
    }

    // Simplex loop for Phase I (minimizing W, so we look for most negative reduced cost)
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Bland's rule: find the lowest index column with reduced cost < -EPS
      let pivotCol = -1;
      for (let j = 0; j < totalCols; j++) {
        if (tableau[0][j] < -EPS) {
          pivotCol = j;
          break; // Bland's rule selects smallest index
        }
      }

      if (pivotCol === -1) {
        // Phase I optimal reached
        break;
      }

      // Ratio test to find leaving variable
      let pivotRow = -1;
      let minRatio = Infinity;
      for (let i = 0; i < m; i++) {
        const a_ij = tableau[i + 1][pivotCol];
        if (a_ij > PIVOT_EPS) {
          const ratio = tableau[i + 1][rhsCol] / a_ij;
          if (ratio < minRatio - EPS) {
            minRatio = ratio;
            pivotRow = i + 1;
          } else if (Math.abs(ratio - minRatio) <= EPS) {
            // Bland's rule tie-breaker: choose smallest basic variable index
            if (pivotRow === -1 || basis[i] < basis[pivotRow - 1]) {
              pivotRow = i + 1;
            }
          }
        }
      }

      if (pivotRow === -1) {
        // Unbounded in Phase I (should not happen since W >= 0)
        break;
      }

      // Perform pivot operation
      pivot(tableau, pivotRow, pivotCol, totalCols + 1);
      basis[pivotRow - 1] = pivotCol;
    }

    // Check Phase I optimal value: W must be 0 (b_0 must be 0)
    // Note: tableau[0][rhsCol] is -W, so -tableau[0][rhsCol] is W
    const phase1Obj = Math.abs(tableau[0][rhsCol]);
    if (phase1Obj > 1e-4) {
      return {
        status: 'infeasible',
        objectiveValue: 0,
        variableValues: new Array(numOriginalVars).fill(0),
        slackValues: [],
        iterations,
        executionTimeMs: performance.now() - startTime,
        errorMessage: 'Problem is infeasible (Phase I objective cannot reach zero).',
      };
    }

    // Check if any artificial variable remains in basis
    for (let i = 0; i < m; i++) {
      if (artificialColIndices.includes(basis[i])) {
        // If it is basic with value > EPS, infeasible
        if (tableau[i + 1][rhsCol] > EPS) {
          return {
            status: 'infeasible',
            objectiveValue: 0,
            variableValues: new Array(numOriginalVars).fill(0),
            slackValues: [],
            iterations,
            executionTimeMs: performance.now() - startTime,
            errorMessage: 'Artificial variable remains positive in basis.',
          };
        }
        // Degenerate: try to pivot it out with any non-artificial variable having non-zero entry
        for (let j = 0; j < totalCols; j++) {
          if (!artificialColIndices.includes(j) && Math.abs(tableau[i + 1][j]) > PIVOT_EPS) {
            pivot(tableau, i + 1, j, totalCols + 1);
            basis[i] = j;
            break;
          }
        }
        // If row is entirely zero in non-artificial columns, row is redundant
      }
    }
  }

  // ==========================================
  // PHASE II: Optimize original objective
  // ==========================================
  // Set up original objective row in tableau[0]
  // We want to maximize Z: Z - sum(c_j x_j) = 0 => row 0 coeffs are -c_j
  // For minimize: Min Z = Max (-Z), so Z + sum(-c_j x_j) = 0
  const isMaximize = problem.sense === 'maximize';
  const origCost = new Array(totalCols).fill(0);
  for (let j = 0; j < numOriginalVars; j++) {
    const coeff = problem.variables[j].objCoeff;
    origCost[j] = isMaximize ? coeff : -coeff;
  }

  // Reset row 0
  tableau[0].fill(0);
  for (let j = 0; j < numOriginalVars; j++) {
    tableau[0][j] = -origCost[j];
  }

  // Artificial columns are eliminated (zeroed out or not considered)
  for (const artCol of artificialColIndices) {
    for (let r = 0; r <= m; r++) {
      tableau[r][artCol] = 0;
    }
  }

  // Canonicalize Phase II objective row with current basis
  for (let i = 0; i < m; i++) {
    const basicVar = basis[i];
    if (basicVar < totalCols && !artificialColIndices.includes(basicVar)) {
      const cb = origCost[basicVar];
      if (Math.abs(cb) > ZERO_TOLERANCE) {
        for (let j = 0; j <= rhsCol; j++) {
          tableau[0][j] += cb * tableau[i + 1][j];
        }
      }
    }
  }

  // Phase II Simplex Iterations
  let phase2Status: SimplexStatus = 'optimal';

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Bland's rule: find smallest column index with negative reduced cost
    let pivotCol = -1;
    for (let j = 0; j < totalCols; j++) {
      if (artificialColIndices.includes(j)) continue;
      if (tableau[0][j] < -EPS) {
        pivotCol = j;
        break; // Bland's rule
      }
    }

    if (pivotCol === -1) {
      // Optimal solution reached!
      break;
    }

    // Ratio test
    let pivotRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      const a_ij = tableau[i + 1][pivotCol];
      if (a_ij > PIVOT_EPS) {
        const ratio = tableau[i + 1][rhsCol] / a_ij;
        if (ratio < minRatio - EPS) {
          minRatio = ratio;
          pivotRow = i + 1;
        } else if (Math.abs(ratio - minRatio) <= EPS) {
          // Tie-break with Bland's rule
          if (pivotRow === -1 || basis[i] < basis[pivotRow - 1]) {
            pivotRow = i + 1;
          }
        }
      }
    }

    if (pivotRow === -1) {
      // All entries in pivot column <= 0 => Unbounded!
      phase2Status = 'unbounded';
      break;
    }

    // Pivot
    pivot(tableau, pivotRow, pivotCol, totalCols + 1);
    basis[pivotRow - 1] = pivotCol;
  }

  if (iterations >= MAX_ITERATIONS && phase2Status === 'optimal') {
    phase2Status = 'iteration_limit';
  }

  // Extract variable values
  const varValues = new Array(numOriginalVars).fill(0);
  const slackValues: number[] = [];

  for (let i = 0; i < m; i++) {
    const basicVar = basis[i];
    const val = snapZero(tableau[i + 1][rhsCol]);
    if (basicVar < numOriginalVars) {
      varValues[basicVar] = val;
    } else {
      // Auxiliary variable
      const aux = auxVars.find((a) => a.colIndex === basicVar);
      if (aux && aux.type === 'slack') {
        slackValues.push(val);
      }
    }
  }

  // Calculate objective value
  let rawObj = tableau[0][rhsCol];
  let finalObj = isMaximize ? rawObj : -rawObj;
  finalObj = snapZero(finalObj);

  return {
    status: phase2Status,
    objectiveValue: finalObj,
    variableValues: varValues.map(snapZero),
    slackValues: slackValues.map(snapZero),
    iterations,
    executionTimeMs: performance.now() - startTime,
    errorMessage:
      phase2Status === 'unbounded'
        ? 'Problem is unbounded (objective can increase infinitely).'
        : phase2Status === 'iteration_limit'
        ? 'Simplex iteration safety limit reached.'
        : undefined,
  };
}

/**
 * Elementary Row Operation Pivot on tableau
 */
function pivot(tableau: number[][], pivotRow: number, pivotCol: number, numCols: number): void {
  const pivotElement = tableau[pivotRow][pivotCol];

  // Divide pivot row by pivot element
  for (let j = 0; j < numCols; j++) {
    tableau[pivotRow][j] = tableau[pivotRow][j] / pivotElement;
  }
  tableau[pivotRow][pivotCol] = 1; // exact 1

  // Eliminate other rows
  for (let i = 0; i < tableau.length; i++) {
    if (i !== pivotRow) {
      const factor = tableau[i][pivotCol];
      if (Math.abs(factor) > ZERO_TOLERANCE) {
        for (let j = 0; j < numCols; j++) {
          tableau[i][j] -= factor * tableau[pivotRow][j];
        }
        tableau[i][pivotCol] = 0; // exact 0
      }
    }
  }
}
