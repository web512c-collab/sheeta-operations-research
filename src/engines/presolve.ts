/**
 * Sheeta Operations Research
 * Multi-Pass Presolve Engine & Solution Reconstructor (CSR-Aware)
 */

import {
  ConstraintDef,
  LpProblem,
  PresolveResult,
  PresolveStats,
  SingletonBoundSource,
  VariableDef,
} from '../types';
import { CsrMatrix, EPS, ZERO_TOLERANCE, snapZero } from './matrix';

export interface PresolveOptions {
  eps?: number;
  pivotEps?: number;
  sparseEnabled?: boolean;
}

interface IndexedConstraint {
  origIndex: number;
  def: ConstraintDef;
}

export function runMultiPassPresolve(
  problem: LpProblem,
  options: PresolveOptions = {}
): PresolveResult {
  const startTime = performance.now();
  const eps = options.eps ?? EPS;
  const zeroTol = Math.min(ZERO_TOLERANCE, options.pivotEps ?? ZERO_TOLERANCE);
  const sparseEnabled = options.sparseEnabled ?? true;
  const report: string[] = [];

  const originalVarsCount = problem.variables.length;
  const originalConstraintsCount = problem.constraints.length;

  let eliminatedEmptyRows = 0;
  let eliminatedEmptyCols = 0;
  let fixedVariablesCount = 0;
  let tightenedBoundsCount = 0;

  report.push(`Starting Presolve: ${originalVarsCount} variables, ${originalConstraintsCount} constraints.`);

  // Deep copy variables and constraints with bound normalization
  const variables: VariableDef[] = problem.variables.map((v) => ({
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

  let constraints: IndexedConstraint[] = problem.constraints.map((c, idx) => ({
    origIndex: idx,
    def: {
      ...c,
      coeffs: [...c.coeffs],
    },
  }));

  // Build CSR representation when sparse mode is enabled to scan nonzeros cleanly
  const initialCsr = sparseEnabled
    ? CsrMatrix.fromConstraints(
        constraints.map((c) => c.def),
        originalVarsCount,
        zeroTol
      )
    : null;

  if (initialCsr && sparseEnabled) {
    report.push(
      `CSR scan initialized: nnz=${initialCsr.nnz}, density=${(initialCsr.density * 100).toFixed(1)}%.`
    );
  }

  const fixedVarValues = new Map<number, number>(); // originalIndex -> fixedValue
  const singletonBoundSources: SingletonBoundSource[] = [];

  // ========================================================
  // Pass 1: Empty Rows / Contradictions Detection
  // ========================================================
  const validConstraints: IndexedConstraint[] = [];
  for (let i = 0; i < constraints.length; i++) {
    const item = constraints[i];
    const c = item.def;
    const isEmpty = initialCsr
      ? initialCsr.rowNnz(i) === 0
      : c.coeffs.every((val) => Math.abs(val) <= zeroTol);

    if (isEmpty) {
      eliminatedEmptyRows++;
      if (c.op === '<=' && c.rhs < -eps) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible empty constraint detected: 0 <= ${c.rhs}`,
          report,
          startTime
        );
      }
      if (c.op === '>=' && c.rhs > eps) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible empty constraint detected: 0 >= ${c.rhs}`,
          report,
          startTime
        );
      }
      if (c.op === '=' && Math.abs(c.rhs) > eps) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible empty constraint detected: 0 = ${c.rhs}`,
          report,
          startTime
        );
      }
      report.push(`Pass 1: Removed redundant empty constraint "${c.name}".`);
    } else {
      validConstraints.push(item);
    }
  }
  constraints = validConstraints;

  // ========================================================
  // Pass 2: Singleton Rows & Bound Tightening
  // ========================================================
  const nonSingletonConstraints: IndexedConstraint[] = [];
  for (const item of constraints) {
    const c = item.def;
    let nonZeroCount = 0;
    let nonZeroIdx = -1;
    let nonZeroCoeff = 0;

    for (let j = 0; j < c.coeffs.length; j++) {
      if (Math.abs(c.coeffs[j]) > zeroTol) {
        nonZeroCount++;
        nonZeroIdx = j;
        nonZeroCoeff = c.coeffs[j];
        if (nonZeroCount > 1) break;
      }
    }

    if (nonZeroCount === 1) {
      const j = nonZeroIdx;
      const rhs = c.rhs;
      const v = variables[j];

      if (c.op === '<=') {
        if (nonZeroCoeff > 0) {
          const newUb = rhs / nonZeroCoeff;
          if (newUb < v.upperBound - eps) {
            v.upperBound = newUb;
            tightenedBoundsCount++;
            singletonBoundSources.push({
              varIndex: j,
              bound: 'ub',
              origConstraintIndex: item.origIndex,
              coeff: nonZeroCoeff,
              effectiveBound: newUb,
            });
            report.push(`Pass 2: Tightened UB of ${v.name} to ${newUb.toFixed(4)} from singleton row "${c.name}".`);
          }
        } else {
          const newLb = rhs / nonZeroCoeff;
          if (newLb > v.lowerBound + eps) {
            v.lowerBound = newLb;
            tightenedBoundsCount++;
            singletonBoundSources.push({
              varIndex: j,
              bound: 'lb',
              origConstraintIndex: item.origIndex,
              coeff: nonZeroCoeff,
              effectiveBound: newLb,
            });
            report.push(`Pass 2: Tightened LB of ${v.name} to ${newLb.toFixed(4)} from singleton row "${c.name}".`);
          }
        }
      } else if (c.op === '>=') {
        if (nonZeroCoeff > 0) {
          const newLb = rhs / nonZeroCoeff;
          if (newLb > v.lowerBound + eps) {
            v.lowerBound = newLb;
            tightenedBoundsCount++;
            singletonBoundSources.push({
              varIndex: j,
              bound: 'lb',
              origConstraintIndex: item.origIndex,
              coeff: nonZeroCoeff,
              effectiveBound: newLb,
            });
            report.push(`Pass 2: Tightened LB of ${v.name} to ${newLb.toFixed(4)} from singleton row "${c.name}".`);
          }
        } else {
          const newUb = rhs / nonZeroCoeff;
          if (newUb < v.upperBound - eps) {
            v.upperBound = newUb;
            tightenedBoundsCount++;
            singletonBoundSources.push({
              varIndex: j,
              bound: 'ub',
              origConstraintIndex: item.origIndex,
              coeff: nonZeroCoeff,
              effectiveBound: newUb,
            });
            report.push(`Pass 2: Tightened UB of ${v.name} to ${newUb.toFixed(4)} from singleton row "${c.name}".`);
          }
        }
      } else if (c.op === '=') {
        const fixedVal = rhs / nonZeroCoeff;
        if (fixedVal < v.lowerBound - eps || fixedVal > v.upperBound + eps) {
          return createInfeasiblePresolve(
            problem,
            `Infeasible equality singleton on ${v.name}: ${fixedVal} outside [${v.lowerBound}, ${v.upperBound}]`,
            report,
            startTime
          );
        }
        v.lowerBound = fixedVal;
        v.upperBound = fixedVal;
        tightenedBoundsCount += 2;
        singletonBoundSources.push({
          varIndex: j,
          bound: 'fixed',
          origConstraintIndex: item.origIndex,
          coeff: nonZeroCoeff,
          effectiveBound: fixedVal,
        });
        report.push(`Pass 2: Fixed variable ${v.name} = ${fixedVal.toFixed(4)} from equality singleton "${c.name}".`);
      }

      if (v.lowerBound > v.upperBound + eps) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible bounds on variable ${v.name}: LB (${v.lowerBound}) > UB (${v.upperBound})`,
          report,
          startTime
        );
      }
    } else {
      nonSingletonConstraints.push(item);
    }
  }
  constraints = nonSingletonConstraints;

  // ========================================================
  // Pass 3: Fixed Variables Detection & Substitution
  // ========================================================
  for (let j = 0; j < variables.length; j++) {
    const v = variables[j];
    if (Math.abs(v.upperBound - v.lowerBound) <= eps) {
      const fixedVal = v.lowerBound;
      fixedVarValues.set(j, fixedVal);
      fixedVariablesCount++;
      report.push(`Pass 3: Variable ${v.name} is fixed to ${fixedVal.toFixed(4)}. Substituting into constraints.`);

      for (const item of constraints) {
        const coeff = item.def.coeffs[j];
        if (Math.abs(coeff) > zeroTol) {
          item.def.rhs -= coeff * fixedVal;
          item.def.coeffs[j] = 0;
        }
      }
    }
  }

  // Re-check constraints that might have become empty after fixed variable substitution
  const postFixedConstraints: IndexedConstraint[] = [];
  for (const item of constraints) {
    const c = item.def;
    let allZero = true;
    for (let j = 0; j < c.coeffs.length; j++) {
      if (Math.abs(c.coeffs[j]) > zeroTol) {
        allZero = false;
        break;
      }
    }
    if (allZero) {
      eliminatedEmptyRows++;
      if (
        (c.op === '<=' && c.rhs < -eps) ||
        (c.op === '>=' && c.rhs > eps) ||
        (c.op === '=' && Math.abs(c.rhs) > eps)
      ) {
        return createInfeasiblePresolve(
          problem,
          `Constraint "${c.name}" became infeasible (0 ${c.op} ${c.rhs}) after variable substitution.`,
          report,
          startTime
        );
      }
      report.push(`Pass 3: Removed constraint "${c.name}" reduced to trivial identity after substitution.`);
    } else {
      postFixedConstraints.push(item);
    }
  }
  constraints = postFixedConstraints;

  // ========================================================
  // Pass 4: Empty Columns Handling (via CSR column counts when sparseEnabled)
  // ========================================================
  const survCsr = sparseEnabled && constraints.length > 0
    ? CsrMatrix.fromConstraints(
        constraints.map((c) => c.def),
        variables.length,
        zeroTol
      )
    : null;
  const colNnz = survCsr ? survCsr.colCounts() : null;

  const isMaximize = problem.sense === 'maximize';
  for (let j = 0; j < variables.length; j++) {
    if (fixedVarValues.has(j)) continue;

    let hasNonZero = false;
    if (colNnz) {
      hasNonZero = colNnz[j] > 0;
    } else {
      for (const item of constraints) {
        if (Math.abs(item.def.coeffs[j]) > zeroTol) {
          hasNonZero = true;
          break;
        }
      }
    }

    if (!hasNonZero) {
      const v = variables[j];
      eliminatedEmptyCols++;
      if (isMaximize) {
        if (v.objCoeff > eps) {
          if (v.upperBound === Infinity) {
            report.push(`Pass 4: Variable ${v.name} is unconstrained with positive profit (Unbounded candidate).`);
          } else {
            fixedVarValues.set(j, v.upperBound);
            fixedVariablesCount++;
            report.push(`Pass 4: Empty column ${v.name} fixed to UB (${v.upperBound}) to maximize objective.`);
          }
        } else {
          fixedVarValues.set(j, v.lowerBound);
          fixedVariablesCount++;
          report.push(`Pass 4: Empty column ${v.name} fixed to LB (${v.lowerBound}) to maximize objective.`);
        }
      } else {
        if (v.objCoeff < -eps) {
          if (v.upperBound === Infinity) {
            report.push(`Pass 4: Variable ${v.name} is unconstrained with negative cost (Unbounded candidate).`);
          } else {
            fixedVarValues.set(j, v.upperBound);
            fixedVariablesCount++;
            report.push(`Pass 4: Empty column ${v.name} fixed to UB (${v.upperBound}) to minimize objective.`);
          }
        } else {
          fixedVarValues.set(j, v.lowerBound);
          fixedVariablesCount++;
          report.push(`Pass 4: Empty column ${v.name} fixed to LB (${v.lowerBound}) to minimize objective.`);
        }
      }
    }
  }

  // Build mapping from reduced variable index to original variable index
  const activeVarIndices: number[] = [];
  for (let j = 0; j < variables.length; j++) {
    if (!fixedVarValues.has(j)) {
      activeVarIndices.push(j);
    }
  }

  const activeConstraintIndices = constraints.map((item) => item.origIndex);

  // Build reduced problem
  const reducedVariables: VariableDef[] = activeVarIndices.map((origIdx) => variables[origIdx]);
  const reducedConstraints: ConstraintDef[] = constraints.map((item) => ({
    id: item.def.id,
    name: item.def.name,
    op: item.def.op,
    rhs: snapZero(item.def.rhs, zeroTol),
    coeffs: activeVarIndices.map((origIdx) => item.def.coeffs[origIdx]),
  }));

  const reducedProblem: LpProblem = {
    title: `${problem.title} (Presolved)`,
    description: problem.description,
    sense: problem.sense,
    isIntegerProgram: problem.isIntegerProgram,
    variables: reducedVariables,
    constraints: reducedConstraints,
  };

  const executionTimeMs = performance.now() - startTime;
  report.push(
    `Presolve completed in ${executionTimeMs.toFixed(2)}ms: ` +
      `Vars: ${originalVarsCount} -> ${reducedVariables.length}, ` +
      `Constraints: ${originalConstraintsCount} -> ${reducedConstraints.length}.`
  );

  const stats: PresolveStats = {
    originalVars: originalVarsCount,
    reducedVars: reducedVariables.length,
    originalConstraints: originalConstraintsCount,
    reducedConstraints: reducedConstraints.length,
    eliminatedEmptyRows,
    eliminatedEmptyCols,
    fixedVariablesCount,
    tightenedBoundsCount,
    executionTimeMs,
  };

  const fixedVarEntries: [number, number][] = Array.from(fixedVarValues.entries());

  return {
    problem: reducedProblem,
    stats,
    originalVarsCount,
    activeVarIndices,
    activeConstraintIndices,
    singletonBoundSources,
    fixedVarEntries,
    fixedVarValues,
    reconstructSolution: (reducedVarValues: number[]) =>
      reconstructFullSolution(originalVarsCount, fixedVarEntries, activeVarIndices, reducedVarValues),
    isInfeasible: false,
    report,
  };
}

export function reconstructFullSolution(
  originalVarsCount: number,
  fixedVarEntries: [number, number][],
  activeVarIndices: number[],
  reducedVarValues: number[]
): number[] {
  const fullSolution = new Array<number>(originalVarsCount).fill(0);
  for (const [origIdx, fixedVal] of fixedVarEntries) {
    fullSolution[origIdx] = fixedVal;
  }
  for (let i = 0; i < activeVarIndices.length; i++) {
    const origIdx = activeVarIndices[i];
    fullSolution[origIdx] = reducedVarValues[i] ?? 0;
  }
  return fullSolution;
}

function createInfeasiblePresolve(
  problem: LpProblem,
  reason: string,
  report: string[],
  startTime: number
): PresolveResult {
  report.push(`Presolve detected infeasibility: ${reason}`);
  const originalVarsCount = problem.variables.length;
  return {
    problem,
    stats: {
      originalVars: originalVarsCount,
      reducedVars: 0,
      originalConstraints: problem.constraints.length,
      reducedConstraints: 0,
      eliminatedEmptyRows: 0,
      eliminatedEmptyCols: 0,
      fixedVariablesCount: 0,
      tightenedBoundsCount: 0,
      executionTimeMs: performance.now() - startTime,
    },
    originalVarsCount,
    activeVarIndices: [],
    activeConstraintIndices: [],
    singletonBoundSources: [],
    fixedVarEntries: [],
    fixedVarValues: new Map(),
    reconstructSolution: () => new Array(originalVarsCount).fill(0),
    isInfeasible: true,
    infeasibilityReason: reason,
    report,
  };
}
