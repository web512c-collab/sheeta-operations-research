/**
 * Sheeta Operations Research
 * Multi-Pass Presolve Engine & Solution Reconstructor
 */

import { LpProblem, PresolveResult, PresolveStats, VariableDef, ConstraintDef } from '../types';
import { EPS, ZERO_TOLERANCE, snapZero } from './matrix';

export function runMultiPassPresolve(problem: LpProblem): PresolveResult {
  const startTime = performance.now();
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
  let constraints: ConstraintDef[] = problem.constraints.map((c) => ({
    ...c,
    coeffs: [...c.coeffs],
  }));

  const fixedVarValues = new Map<number, number>(); // originalIndex -> fixedValue

  // ========================================================
  // Pass 1: Empty Rows / Contradictions Detection
  // ========================================================
  const validConstraints: ConstraintDef[] = [];
  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i];
    let allZero = true;
    for (let j = 0; j < c.coeffs.length; j++) {
      if (Math.abs(c.coeffs[j]) > ZERO_TOLERANCE) {
        allZero = false;
        break;
      }
    }

    if (allZero) {
      eliminatedEmptyRows++;
      // Check for infeasibility
      if (c.op === '<=' && c.rhs < -EPS) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible empty constraint detected: 0 <= ${c.rhs}`,
          report,
          startTime
        );
      }
      if (c.op === '>=' && c.rhs > EPS) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible empty constraint detected: 0 >= ${c.rhs}`,
          report,
          startTime
        );
      }
      if (c.op === '=' && Math.abs(c.rhs) > EPS) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible empty constraint detected: 0 = ${c.rhs}`,
          report,
          startTime
        );
      }
      report.push(`Pass 1: Removed redundant empty constraint "${c.name}".`);
    } else {
      validConstraints.push(c);
    }
  }
  constraints = validConstraints;

  // ========================================================
  // Pass 2: Singleton Rows & Bound Tightening
  // ========================================================
  const nonSingletonConstraints: ConstraintDef[] = [];
  for (const c of constraints) {
    let nonZeroCount = 0;
    let nonZeroIdx = -1;
    let nonZeroCoeff = 0;

    for (let j = 0; j < c.coeffs.length; j++) {
      if (Math.abs(c.coeffs[j]) > ZERO_TOLERANCE) {
        nonZeroCount++;
        nonZeroIdx = j;
        nonZeroCoeff = c.coeffs[j];
      }
    }

    if (nonZeroCount === 1) {
      // Singleton row: nonZeroCoeff * x_j op c.rhs
      const j = nonZeroIdx;
      const rhs = c.rhs;
      const v = variables[j];

      if (c.op === '<=') {
        if (nonZeroCoeff > 0) {
          const newUb = rhs / nonZeroCoeff;
          if (newUb < v.upperBound) {
            v.upperBound = newUb;
            tightenedBoundsCount++;
            report.push(`Pass 2: Tightened UB of ${v.name} to ${newUb.toFixed(4)} from singleton row "${c.name}".`);
          }
        } else {
          const newLb = rhs / nonZeroCoeff;
          if (newLb > v.lowerBound) {
            v.lowerBound = newLb;
            tightenedBoundsCount++;
            report.push(`Pass 2: Tightened LB of ${v.name} to ${newLb.toFixed(4)} from singleton row "${c.name}".`);
          }
        }
      } else if (c.op === '>=') {
        if (nonZeroCoeff > 0) {
          const newLb = rhs / nonZeroCoeff;
          if (newLb > v.lowerBound) {
            v.lowerBound = newLb;
            tightenedBoundsCount++;
            report.push(`Pass 2: Tightened LB of ${v.name} to ${newLb.toFixed(4)} from singleton row "${c.name}".`);
          }
        } else {
          const newUb = rhs / nonZeroCoeff;
          if (newUb < v.upperBound) {
            v.upperBound = newUb;
            tightenedBoundsCount++;
            report.push(`Pass 2: Tightened UB of ${v.name} to ${newUb.toFixed(4)} from singleton row "${c.name}".`);
          }
        }
      } else if (c.op === '=') {
        const fixedVal = rhs / nonZeroCoeff;
        v.lowerBound = fixedVal;
        v.upperBound = fixedVal;
        tightenedBoundsCount += 2;
        report.push(`Pass 2: Fixed variable ${v.name} = ${fixedVal.toFixed(4)} from equality singleton "${c.name}".`);
      }

      // Check bounds consistency
      if (v.lowerBound > v.upperBound + EPS) {
        return createInfeasiblePresolve(
          problem,
          `Infeasible bounds on variable ${v.name}: LB (${v.lowerBound}) > UB (${v.upperBound})`,
          report,
          startTime
        );
      }
    } else {
      nonSingletonConstraints.push(c);
    }
  }
  constraints = nonSingletonConstraints;

  // ========================================================
  // Pass 3: Fixed Variables Detection & Substitution
  // ========================================================
  for (let j = 0; j < variables.length; j++) {
    const v = variables[j];
    if (Math.abs(v.upperBound - v.lowerBound) <= EPS) {
      const fixedVal = v.lowerBound;
      fixedVarValues.set(j, fixedVal);
      fixedVariablesCount++;
      report.push(`Pass 3: Variable ${v.name} is fixed to ${fixedVal.toFixed(4)}. Substituting into constraints.`);

      // Adjust RHS of all constraints
      for (const c of constraints) {
        const coeff = c.coeffs[j];
        if (Math.abs(coeff) > ZERO_TOLERANCE) {
          c.rhs -= coeff * fixedVal;
          c.coeffs[j] = 0;
        }
      }
    }
  }

  // ========================================================
  // Pass 4: Empty Columns Handling
  // ========================================================
  const isMaximize = problem.sense === 'maximize';
  for (let j = 0; j < variables.length; j++) {
    if (fixedVarValues.has(j)) continue;

    let hasNonZero = false;
    for (const c of constraints) {
      if (Math.abs(c.coeffs[j]) > ZERO_TOLERANCE) {
        hasNonZero = true;
        break;
      }
    }

    if (!hasNonZero) {
      const v = variables[j];
      eliminatedEmptyCols++;
      if (isMaximize) {
        if (v.objCoeff > EPS) {
          if (v.upperBound === Infinity) {
            report.push(`Pass 4: Variable ${v.name} is unconstrained with positive profit (Unbounded candidate).`);
          } else {
            fixedVarValues.set(j, v.upperBound);
            report.push(`Pass 4: Empty column ${v.name} fixed to UB (${v.upperBound}) to maximize objective.`);
          }
        } else {
          fixedVarValues.set(j, v.lowerBound);
          report.push(`Pass 4: Empty column ${v.name} fixed to LB (${v.lowerBound}) to maximize objective.`);
        }
      } else {
        if (v.objCoeff < -EPS) {
          if (v.upperBound === Infinity) {
            report.push(`Pass 4: Variable ${v.name} is unconstrained with negative cost (Unbounded candidate).`);
          } else {
            fixedVarValues.set(j, v.upperBound);
            report.push(`Pass 4: Empty column ${v.name} fixed to UB (${v.upperBound}) to minimize objective.`);
          }
        } else {
          fixedVarValues.set(j, v.lowerBound);
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

  // Build reduced problem
  const reducedVariables: VariableDef[] = activeVarIndices.map((origIdx) => variables[origIdx]);
  const reducedConstraints: ConstraintDef[] = constraints.map((c) => ({
    id: c.id,
    name: c.name,
    op: c.op,
    rhs: snapZero(c.rhs),
    coeffs: activeVarIndices.map((origIdx) => c.coeffs[origIdx]),
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
      `Vars: ${originalVarsCount} → ${reducedVariables.length}, ` +
      `Constraints: ${originalConstraintsCount} → ${reducedConstraints.length}.`
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
    fixedVarEntries: [],
    fixedVarValues: new Map(),
    reconstructSolution: () => new Array(originalVarsCount).fill(0),
    isInfeasible: true,
    infeasibilityReason: reason,
    report,
  };
}
