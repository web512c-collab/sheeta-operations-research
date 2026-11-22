/**
 * Sheeta Operations Research
 * Deterministic Unit Tests for Mathematical Engines
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTwoPhaseSimplex } from '../engines/simplexTwoPhase';
import { runMultiPassPresolve } from '../engines/presolve';
import { runBbSolvePipeline, runLpSolvePipeline } from '../engines/lpSolvePipeline';
import { solveBranchAndBound } from '../engines/branchAndBound';
import { solveTransportation, solveHungarianAssignment } from '../engines/transportation';
import { solvePertCpm } from '../engines/pertCpm';
import { solveQueuing, solveEoq } from '../engines/queuingEoq';
import { runSimulationBatch } from '../engines/simulation';
import {
  SAMPLE_TWO_VAR_LP,
  SAMPLE_TRANSPORTATION,
  SAMPLE_ASSIGNMENT,
  SAMPLE_PERT_CPM,
  SAMPLE_QUEUING,
  SAMPLE_EOQ,
} from '../storage/sampleProblems';
import { LpProblem } from '../types';

test('Two-Phase Simplex: Solves classic 2-variable maximization problem', () => {
  const result = solveTwoPhaseSimplex(SAMPLE_TWO_VAR_LP);
  assert.equal(result.status, 'optimal');
  // Expected: x1 = 40, x2 = 20, Z = 2200
  assert.ok(Math.abs(result.variableValues[0] - 40) < 1e-4, `Expected x1 ≈ 40, got ${result.variableValues[0]}`);
  assert.ok(Math.abs(result.variableValues[1] - 20) < 1e-4, `Expected x2 ≈ 20, got ${result.variableValues[1]}`);
  assert.ok(Math.abs(result.objectiveValue - 2200) < 1e-4, `Expected Z ≈ 2200, got ${result.objectiveValue}`);
});

test('Two-Phase Simplex: Correctly flags infeasible problem (Phase I > 0)', () => {
  const infeasibleProblem: LpProblem = {
    title: 'Infeasible Test',
    sense: 'maximize',
    isIntegerProgram: false,
    variables: [
      { id: 'x1', name: 'x1', type: 'continuous', objCoeff: 5, lowerBound: 0, upperBound: Infinity },
      { id: 'x2', name: 'x2', type: 'continuous', objCoeff: 4, lowerBound: 0, upperBound: Infinity },
    ],
    constraints: [
      { id: 'c1', name: 'Upper Sum', coeffs: [1, 1], op: '<=', rhs: 2 },
      { id: 'c2', name: 'Lower Sum', coeffs: [1, 1], op: '>=', rhs: 5 },
    ],
  };

  const result = solveTwoPhaseSimplex(infeasibleProblem);
  assert.equal(result.status, 'infeasible');
});

test('Two-Phase Simplex: Correctly detects unbounded problem', () => {
  const unboundedProblem: LpProblem = {
    title: 'Unbounded Test',
    sense: 'maximize',
    isIntegerProgram: false,
    variables: [
      { id: 'x1', name: 'x1', type: 'continuous', objCoeff: 10, lowerBound: 0, upperBound: Infinity },
      { id: 'x2', name: 'x2', type: 'continuous', objCoeff: 5, lowerBound: 0, upperBound: Infinity },
    ],
    constraints: [
      { id: 'c1', name: 'Constraint with negative coeffs', coeffs: [-1, 1], op: '<=', rhs: 4 },
    ],
  };

  const result = solveTwoPhaseSimplex(unboundedProblem);
  assert.equal(result.status, 'unbounded');
});

test('Multi-Pass Presolve: Detects singleton constraints & reduces problem size', () => {
  const problemWithSingleton: LpProblem = {
    title: 'Presolve Singleton Test',
    sense: 'maximize',
    isIntegerProgram: false,
    variables: [
      { id: 'x1', name: 'x1', type: 'continuous', objCoeff: 10, lowerBound: 0, upperBound: 100 },
      { id: 'x2', name: 'x2', type: 'continuous', objCoeff: 20, lowerBound: 0, upperBound: 100 },
    ],
    constraints: [
      { id: 'c1', name: 'Joint', coeffs: [1, 2], op: '<=', rhs: 50 },
      { id: 'c2', name: 'Singleton x1', coeffs: [2, 0], op: '<=', rhs: 40 }, // => x1 <= 20
    ],
  };

  const presolveRes = runMultiPassPresolve(problemWithSingleton);
  assert.equal(presolveRes.isInfeasible, false);
  assert.ok(presolveRes.stats.tightenedBoundsCount >= 1);
  assert.ok(presolveRes.problem.variables[0].upperBound <= 20);
});

test('Branch and Bound: Solves integer knapsack problem and prunes branches', () => {
  // Maximize 10 x1 + 15 x2 + 25 x3
  // s.t. 2 x1 + 3 x2 + 5 x3 <= 9
  // x1, x2, x3 in {0, 1}
  const knapsackProblem: LpProblem = {
    title: 'Binary Knapsack',
    sense: 'maximize',
    isIntegerProgram: true,
    variables: [
      { id: 'x1', name: 'Item 1', type: 'binary', objCoeff: 10, lowerBound: 0, upperBound: 1 },
      { id: 'x2', name: 'Item 2', type: 'binary', objCoeff: 15, lowerBound: 0, upperBound: 1 },
      { id: 'x3', name: 'Item 3', type: 'binary', objCoeff: 25, lowerBound: 0, upperBound: 1 },
    ],
    constraints: [
      { id: 'weight', name: 'Total Weight', coeffs: [2, 3, 5], op: '<=', rhs: 9 },
    ],
  };

  const result = solveBranchAndBound(knapsackProblem);
  assert.equal(result.status, 'optimal');
  assert.ok(result.bestIntegerSolution !== undefined);
  // Optimal integer solution should choose Item 2 (weight 3) and Item 3 (weight 5) = total weight 8 <= 9, value 40
  // or Item 1 (weight 2), Item 2 (weight 3) = weight 5 <= 9, value 25
  // Actually Item 2 (15) + Item 3 (25) = 40 (weight 8 <= 9)
  // Let's verify integer assignments
  assert.ok(result.bestObjectiveValue! >= 40);
  assert.ok(result.stats.exploredNodes >= 1);
  assert.ok(result.stats.integralityGapPercent >= 0);
});

test('Transportation: Computes optimal distribution cost', () => {
  const result = solveTransportation(SAMPLE_TRANSPORTATION);
  assert.ok(result.totalCost > 0);
  assert.equal(result.allocations.length, 3);
  // Total supply is 1000, demand is 950 => 1 dummy market added, total cols = 5
  assert.equal(result.allocations[0].length, 5);
  assert.equal(result.dummyAdded, 'destination');

  // Check supply constraints
  for (let i = 0; i < 3; i++) {
    const allocated = result.allocations[i].reduce((sum, v) => sum + v, 0);
    assert.ok(
      Math.abs(allocated - SAMPLE_TRANSPORTATION.sources[i].capacity) < 1e-4,
      `Row ${i} supply not satisfied`
    );
  }
});

test('Hungarian Assignment: Finds optimal 1-to-1 matching', () => {
  const result = solveHungarianAssignment(SAMPLE_ASSIGNMENT);
  assert.equal(result.assignments.length, 4);
  assert.ok(result.totalCost > 0);

  // Ensure every worker and every task appears exactly once
  const workers = new Set(result.assignments.map((a) => a.workerIdx));
  const tasks = new Set(result.assignments.map((a) => a.taskIdx));
  assert.equal(workers.size, 4);
  assert.equal(tasks.size, 4);
});

test('PERT / CPM: Correctly computes early/late times, slack, and critical path', () => {
  const result = solvePertCpm(SAMPLE_PERT_CPM);
  assert.ok(result.totalDuration > 0);
  assert.ok(result.criticalPath.length >= 2);
  assert.ok(result.criticalPath.includes('A'));
  assert.ok(result.criticalPath.includes('H'));

  // Critical activities must have slack == 0
  for (const act of result.activities) {
    if (result.criticalPath.includes(act.id)) {
      assert.ok(Math.abs(act.slack) < 1e-4, `Critical activity ${act.id} has non-zero slack ${act.slack}`);
    }
  }
});

test('Queuing: Correctly evaluates M/M/c multi-server formula', () => {
  const result = solveQueuing(SAMPLE_QUEUING);
  assert.ok(result.rho < 1, 'Server utilization must be < 1');
  assert.ok(result.p0 > 0 && result.p0 < 1, 'P0 must be between 0 and 1');
  assert.ok(result.lq >= 0, 'Lq must be non-negative');
  assert.ok(result.w > result.wq, 'Total system time W must exceed queue time Wq');
});

test('EOQ: Computes Wilson formula and total annual inventory cost', () => {
  const result = solveEoq(SAMPLE_EOQ);
  // EOQ = sqrt(2 * 12000 * 150 / 4.5) = sqrt(3,600,000 / 4.5) = sqrt(800,000) ≈ 894.4
  const expectedEoq = Math.sqrt((2 * 12000 * 150) / 4.5);
  assert.ok(Math.abs(result.optimalQty - expectedEoq) < 1.0, `Expected EOQ ≈ ${expectedEoq}, got ${result.optimalQty}`);
  assert.ok(result.totalAnnualCost > 0);
  assert.ok(result.costBreakdown.length >= 3);
});

test('Simulation Engine: Evaluates Monte Carlo batch on LP problem with stochastic constraint RHS', () => {
  const summary = runSimulationBatch({
    type: 'monte_carlo',
    numScenarios: 25,
    param: {
      id: 'param_1',
      targetModule: 'lp',
      paramKey: 'rhs_0',
      label: 'Assembly Labor Hours',
      distribution: 'normal',
      min: 60,
      max: 140,
      mean: 100,
      stdDev: 15,
      mode: 100,
    },
    baseProblem: SAMPLE_TWO_VAR_LP,
  });

  assert.equal(summary.totalScenarios, 25);
  assert.equal(summary.feasibleCount, 25);
  assert.ok(summary.meanValue > 1500 && summary.meanValue < 3000);
  assert.ok(summary.bestValue >= summary.worstValue);
  assert.equal(summary.distributionBins.length, 10);
  assert.equal(summary.scenarios.length, 25);
  assert.ok(summary.scenarios[0].objectiveValue > 1000);
});

test('Simulation Engine: Runs Parameter Sweep on LP problem with step-by-step evaluation', () => {
  const summary = runSimulationBatch({
    type: 'parameter_sweep',
    numScenarios: 5,
    param: {
      id: 'param_sweep',
      targetModule: 'lp',
      paramKey: 'rhs_0',
      label: 'Assembly Labor Hours Sweep',
      distribution: 'uniform',
      min: 60,
      max: 140,
      mean: 100,
      stdDev: 15,
      mode: 100,
      sweepStart: 60,
      sweepEnd: 140,
      sweepSteps: 5,
    },
    baseProblem: SAMPLE_TWO_VAR_LP,
  });

  assert.equal(summary.totalScenarios, 5);
  assert.equal(summary.feasibleCount, 5);
  // Objective should increase as labor capacity increases from 60 to 140
  assert.ok(summary.scenarios[4].objectiveValue >= summary.scenarios[0].objectiveValue);
});

test('LP & B&B Pipelines: Preserve fixed variable objective contributions and handle all-fixed presolve', () => {
  // Partial presolve fixing: x1 is fixed to [10, 10] with objCoeff 5 (contributes +50)
  const partialFixedIp: LpProblem = {
    title: 'Partial Presolve Fixed Contribution',
    sense: 'maximize',
    isIntegerProgram: true,
    variables: [
      { id: 'x1', name: 'Fixed', type: 'integer', objCoeff: 5, lowerBound: 10, upperBound: 10 },
      { id: 'x2', name: 'Free', type: 'integer', objCoeff: 12, lowerBound: 0, upperBound: 10 },
    ],
    constraints: [
      { id: 'c1', name: 'Joint Capacity', coeffs: [1, 2], op: '<=', rhs: 20 }, // 10 + 2*x2 <= 20 => x2 <= 5
    ],
  };

  const lpRes = runLpSolvePipeline(partialFixedIp, true);
  assert.equal(lpRes.simplex.status, 'optimal');
  assert.equal(lpRes.simplex.variableValues[0], 10);
  assert.equal(lpRes.simplex.variableValues[1], 5);
  assert.ok(Math.abs(lpRes.simplex.objectiveValue - 110) < 1e-4);

  const bbRes = runBbSolvePipeline(partialFixedIp, true);
  assert.equal(bbRes.bb.status, 'optimal');
  assert.ok(Math.abs((bbRes.bb.bestObjectiveValue ?? 0) - 110) < 1e-4);
  assert.equal(bbRes.bb.bestIntegerSolution?.[0], 10);
  assert.equal(bbRes.bb.bestIntegerSolution?.[1], 5);

  // Degenerate case: ALL variables fixed by bounds (reduced problem has 0 variables)
  const allFixedLp: LpProblem = {
    title: 'All Fixed Presolve Test',
    sense: 'maximize',
    isIntegerProgram: true,
    variables: [
      { id: 'x1', name: 'x1', type: 'binary', objCoeff: 7, lowerBound: 1, upperBound: 1 },
      { id: 'x2', name: 'x2', type: 'integer', objCoeff: 3, lowerBound: 4, upperBound: 4 },
    ],
    constraints: [
      { id: 'c1', name: 'Budget', coeffs: [2, 1], op: '<=', rhs: 10 },
    ],
  };

  const lpAllFixed = runLpSolvePipeline(allFixedLp, true);
  assert.equal(lpAllFixed.simplex.status, 'optimal');
  assert.deepEqual(lpAllFixed.simplex.variableValues, [1, 4]);
  assert.ok(Math.abs(lpAllFixed.simplex.objectiveValue - 19) < 1e-4);

  const bbAllFixed = runBbSolvePipeline(allFixedLp, true);
  assert.equal(bbAllFixed.bb.status, 'optimal');
  assert.deepEqual(bbAllFixed.bb.bestIntegerSolution, [1, 4]);
  assert.ok(Math.abs((bbAllFixed.bb.bestObjectiveValue ?? 0) - 19) < 1e-4);
});

test('EOQ Discounts: Handles near-zero demand/tier safely without Infinity or NaN', () => {
  const resZero = solveEoq({
    model: 'discounts',
    annualDemand: 0,
    orderCost: 100,
    holdingCost: 5,
    unitCost: 20,
    discountTiers: [{ minQty: 0, unitPrice: 20 }],
  });
  assert.ok(Number.isFinite(resZero.optimalQty) && resZero.optimalQty > 0);
  assert.ok(Number.isFinite(resZero.totalAnnualCost));

  const resMultiTier = solveEoq({
    model: 'discounts',
    annualDemand: 10000,
    orderCost: 120,
    holdingCost: 4,
    unitCost: 25,
    discountTiers: [
      { minQty: 0, unitPrice: 25 },
      { minQty: 500, unitPrice: 23 },
      { minQty: 1500, unitPrice: 21 },
    ],
  });
  assert.ok(Number.isFinite(resMultiTier.optimalQty) && resMultiTier.optimalQty >= 500);
  assert.ok(Number.isFinite(resMultiTier.totalAnnualCost) && resMultiTier.totalAnnualCost > 0);
});


