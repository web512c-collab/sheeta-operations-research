/**
 * Sheeta Operations Research v1.1.0
 * Audit Defect Regression & Feature Verification Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { solveTwoPhaseSimplex, solveTwoPhaseSimplexAsync } from '../engines/simplexTwoPhase';
import { solveBranchAndBound, solveBranchAndBoundAsync } from '../engines/branchAndBound';
import { runBbSolvePipeline, runLpSolvePipeline } from '../engines/lpSolvePipeline';
import { CsrMatrix } from '../engines/matrix';
import { PertValidationError, solvePertCpm } from '../engines/pertCpm';
import { runSimulationBatchAsync } from '../engines/simulation';
import { buildPdfFromJpegPages, uint8ToBase64 } from '../platform/pdfGenerator';
import {
  exportWorkspaceJson,
  importWorkspaceJson,
  validateAppSettings,
} from '../storage/db';
import { translations } from '../i18n/translations';
import { getRecommendedPoolSize } from '../workers/workerClient';
import { ActivityDef, LpProblem } from '../types';

// Exact 2-variable IP reproducing Defect 1:
// True integer optimum: x1 = 0, x2 = 2, Z = 28 (requires depth 2).
// At depth 1: x1 >= 1 forces x1 = 1, x2 = 0 (Z = 19), while x1 <= 0 yields fractional x2 = 2.15 (bound 30.1).
const DEFECT_1_DEPTH_IP: LpProblem = {
  title: 'Depth-1 Trap Integer Program',
  sense: 'maximize',
  isIntegerProgram: true,
  variables: [
    { id: 'x1', name: 'x1', type: 'integer', objCoeff: 19, lowerBound: 0, upperBound: Infinity },
    { id: 'x2', name: 'x2', type: 'integer', objCoeff: 14, lowerBound: 0, upperBound: Infinity },
  ],
  constraints: [
    { id: 'c1', name: 'Steep Cut', coeffs: [33, 10], op: '<=', rhs: 33 },
    { id: 'c2', name: 'Upper Cap', coeffs: [20, 20], op: '<=', rhs: 43 },
  ],
};

test('Defect 1: B&B never reports optimal when depth/node/time limits halt search prematurely', () => {
  const limited = solveBranchAndBound(DEFECT_1_DEPTH_IP, { maxDepth: 1, maxNodes: 500 });
  assert.equal(limited.status, 'depth_limit_reached');
  assert.notEqual(limited.status, 'optimal');
  assert.equal(limited.bestObjectiveValue, 19);
  assert.deepEqual(limited.bestIntegerSolution, [1, 0]);
  assert.ok(
    limited.bestBound !== undefined && limited.bestBound >= 28 - 1e-4,
    `Expected bestBound >= 28, got ${limited.bestBound}`
  );
  assert.ok(limited.stats.integralityGapPercent > 0);
  assert.equal(limited.limitsUsed?.maxDepth, 1);

  const full = solveBranchAndBound(DEFECT_1_DEPTH_IP, { maxDepth: 10, maxNodes: 500 });
  assert.equal(full.status, 'optimal');
  assert.equal(full.bestObjectiveValue, 28);
  assert.deepEqual(full.bestIntegerSolution, [0, 2]);
  assert.equal(full.bestBound, 28);
  assert.equal(full.stats.integralityGapPercent, 0);

  const nodeLimited = solveBranchAndBound(DEFECT_1_DEPTH_IP, { maxNodes: 2, maxDepth: 20 });
  assert.equal(nodeLimited.status, 'node_limit_reached');
  assert.ok(nodeLimited.stats.openNodesRemaining !== undefined);

  const timeLimited = solveBranchAndBound(DEFECT_1_DEPTH_IP, { timeoutMs: 0.0001, maxNodes: 10000 });
  assert.ok(
    timeLimited.status === 'time_limit_reached' || timeLimited.status === 'optimal',
    `Unexpected status on tiny timeout: ${timeLimited.status}`
  );
});

test('Defect 2: Cooperative cancellation halts Simplex, B&B, and Simulation mid-flight (callback & SharedArrayBuffer)', async () => {
  let calls = 0;
  const simplexCancelled = await solveTwoPhaseSimplexAsync(DEFECT_1_DEPTH_IP, {
    yieldEveryIterations: 1,
    shouldCancel: () => ++calls >= 1,
  });
  assert.equal(simplexCancelled.status, 'cancelled');

  // SharedArrayBuffer Atomics cancellation for B&B
  const cancelSab = new SharedArrayBuffer(4);
  const cancelView = new Int32Array(cancelSab);
  Atomics.store(cancelView, 0, 0);
  const bbCancelled = await solveBranchAndBoundAsync(DEFECT_1_DEPTH_IP, {
    cancelBuffer: cancelView,
    yieldEveryNodes: 1,
    onProgress: (p) => {
      if (p.exploredNodes >= 1) {
        Atomics.store(cancelView, 0, 1);
      }
    },
  });
  assert.equal(bbCancelled.status, 'cancelled');

  // Simulation batch cancellation via shouldCancel
  let doneCount = 0;
  const simSummary = await runSimulationBatchAsync({
    type: 'monte_carlo',
    numScenarios: 25,
    param: {
      id: 'p1',
      targetModule: 'lp',
      paramKey: 'rhs_0',
      label: 'RHS 0',
      distribution: 'uniform',
      min: 30,
      max: 40,
      mean: 35,
      stdDev: 2,
      mode: 35,
    },
    baseProblem: { ...DEFECT_1_DEPTH_IP, isIntegerProgram: false },
    yieldEveryScenarios: 1,
    shouldCancel: () => doneCount >= 3,
    onProgress: (c) => {
      doneCount = c;
    },
  });
  assert.equal(simSummary.cancelled, true);
  assert.ok(simSummary.totalScenarios < 25);
});

test('Defect 3: maxDepth=0, maxNodes, eps, pivotEps, sparseEnabled, and branchingStrategy are wired & respected', () => {
  const rootOnly = runBbSolvePipeline(DEFECT_1_DEPTH_IP, false, {
    maxDepth: 0,
    maxNodes: 100,
    timeoutMs: 5000,
    eps: 1e-6,
    pivotEps: 1e-8,
    sparseEnabled: false,
    branchingStrategy: 'first_fractional',
  });
  assert.equal(rootOnly.bb.limitsUsed?.maxDepth, 0);
  assert.equal(rootOnly.bb.limitsUsed?.maxNodes, 100);
  assert.equal(rootOnly.bb.limitsUsed?.eps, 1e-6);
  assert.equal(rootOnly.bb.limitsUsed?.pivotEps, 1e-8);
  assert.equal(rootOnly.bb.limitsUsed?.sparseEnabled, false);
  assert.equal(rootOnly.bb.limitsUsed?.branchingStrategy, 'first_fractional');
  assert.equal(rootOnly.bb.status, 'depth_limit_reached');
  assert.equal(rootOnly.bb.matrixModeUsed, 'dense');
});

test('Defect 4: CsrMatrix construction and sparse vs dense Two-Phase Simplex equivalence & speed', () => {
  const numVars = 60;
  const numConstraints = 40;
  const denseRows: number[][] = [];
  const constraints = [];
  const variables = [];

  for (let j = 0; j < numVars; j++) {
    variables.push({
      id: `v${j}`,
      name: `x${j + 1}`,
      type: 'continuous' as const,
      objCoeff: (j % 7) + 1,
      lowerBound: 0,
      upperBound: 10,
    });
  }

  for (let i = 0; i < numConstraints; i++) {
    const coeffs = new Array<number>(numVars).fill(0);
    const c1 = (i * 3) % numVars;
    const c2 = (i * 3 + 1) % numVars;
    coeffs[c1] = 2;
    coeffs[c2] = 3;
    denseRows.push(coeffs);
    constraints.push({
      id: `r${i}`,
      name: `Row ${i + 1}`,
      coeffs,
      op: '<=' as const,
      rhs: 25,
    });
  }

  const csr = CsrMatrix.fromDense(denseRows);
  assert.equal(csr.numRows, numConstraints);
  assert.equal(csr.numCols, numVars);
  assert.ok(csr.density < 0.1);
  assert.equal(csr.get(0, 0), 2);
  assert.equal(csr.get(0, 1), 3);
  assert.equal(csr.get(0, 5), 0);
  assert.deepEqual(csr.toDense(), denseRows);

  const sparseProblem: LpProblem = {
    title: 'Sparse 40x60 LP',
    sense: 'maximize',
    isIntegerProgram: false,
    variables,
    constraints,
  };

  const t0 = performance.now();
  const sparseSol = solveTwoPhaseSimplex(sparseProblem, { sparseEnabled: true });
  const elapsedMs = performance.now() - t0;
  const denseSol = solveTwoPhaseSimplex(sparseProblem, { sparseEnabled: false });

  assert.equal(sparseSol.status, 'optimal');
  assert.equal(denseSol.status, 'optimal');
  assert.equal(sparseSol.matrixModeUsed, 'sparse');
  assert.equal(denseSol.matrixModeUsed, 'dense');
  assert.ok(Math.abs(sparseSol.objectiveValue - denseSol.objectiveValue) < 1e-6);
  for (let j = 0; j < numVars; j++) {
    assert.ok(Math.abs(sparseSol.variableValues[j] - denseSol.variableValues[j]) < 1e-5);
  }
  assert.ok(elapsedMs < 2000, `Expected 40x60 sparse LP solve < 2000ms, got ${elapsedMs}ms`);
});

test('Defect 5: PERT/CPM strict validation errors and multi-critical-path enumeration', () => {
  assert.throws(
    () => solvePertCpm([]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'EMPTY_NETWORK'
  );

  assert.throws(
    () =>
      solvePertCpm([
        { id: ' ', name: 'Blank', predecessors: [], durationMode: 'single', duration: 2 },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'EMPTY_ID'
  );

  assert.throws(
    () =>
      solvePertCpm([
        { id: 'A', name: 'A1', predecessors: [], durationMode: 'single', duration: 2 },
        { id: 'A', name: 'A2', predecessors: [], durationMode: 'single', duration: 3 },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'DUPLICATE_ID'
  );

  assert.throws(
    () =>
      solvePertCpm([
        { id: 'A', name: 'Self', predecessors: ['A'], durationMode: 'single', duration: 2 },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'SELF_DEPENDENCY'
  );

  assert.throws(
    () =>
      solvePertCpm([
        { id: 'A', name: 'Missing', predecessors: ['Z'], durationMode: 'single', duration: 2 },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'UNKNOWN_PREDECESSOR'
  );

  assert.throws(
    () =>
      solvePertCpm([
        { id: 'A', name: 'Neg', predecessors: [], durationMode: 'single', duration: -1 },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'INVALID_DURATION'
  );

  assert.throws(
    () =>
      solvePertCpm([
        {
          id: 'A',
          name: 'Bad 3pt',
          predecessors: [],
          durationMode: 'three_point',
          duration: 0,
          optimistic: 6,
          mostLikely: 4,
          pessimistic: 8,
        },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'INVALID_THREE_POINT'
  );

  assert.throws(
    () =>
      solvePertCpm([
        { id: 'A', name: 'A', predecessors: ['B'], durationMode: 'single', duration: 3 },
        { id: 'B', name: 'B', predecessors: ['A'], durationMode: 'single', duration: 4 },
      ]),
    (err: unknown) => err instanceof PertValidationError && err.code === 'CYCLE_DETECTED'
  );

  // Symmetric diamond network yielding 2 distinct critical paths: A->B->D and A->C->D
  const diamond: ActivityDef[] = [
    { id: 'A', name: 'Start', predecessors: [], durationMode: 'single', duration: 2 },
    { id: 'B', name: 'Branch 1', predecessors: ['A'], durationMode: 'single', duration: 5 },
    { id: 'C', name: 'Branch 2', predecessors: ['A'], durationMode: 'single', duration: 5 },
    { id: 'D', name: 'End', predecessors: ['B', 'C'], durationMode: 'single', duration: 3 },
  ];
  const fullPaths = solvePertCpm(diamond);
  assert.equal(fullPaths.totalDuration, 10);
  assert.equal(fullPaths.criticalPaths.length, 2);
  assert.equal(fullPaths.pathsCapped, false);
  const joined = fullPaths.criticalPaths.map((p) => p.join('->')).sort();
  assert.deepEqual(joined, ['A->B->D', 'A->C->D']);

  const cappedPaths = solvePertCpm(diamond, { maxCriticalPaths: 1 });
  assert.equal(cappedPaths.criticalPaths.length, 1);
  assert.equal(cappedPaths.pathsCapped, true);
});

test('Defect 6: buildPdfFromJpegPages creates valid multi-page binary PDF-1.4 bytes', () => {
  const fakeJpeg1 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const fakeJpeg2 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x12, 0xff, 0xd9]);
  const pdfBytes = buildPdfFromJpegPages([
    { widthPx: 794, heightPx: 1123, jpegBytes: fakeJpeg1 },
    { widthPx: 794, heightPx: 1123, jpegBytes: fakeJpeg2 },
  ]);

  const headerText = Buffer.from(pdfBytes.subarray(0, 8)).toString('ascii');
  assert.ok(headerText.startsWith('%PDF-1.4'));

  const fullLatin1 = Buffer.from(pdfBytes).toString('latin1');
  assert.ok(fullLatin1.includes('/Count 2'));
  assert.ok(fullLatin1.includes('/Filter /DCTDecode'));
  assert.ok(fullLatin1.includes('xref'));
  assert.ok(fullLatin1.trimEnd().endsWith('%%EOF'));

  const b64 = uint8ToBase64(pdfBytes);
  assert.ok(b64.startsWith('JVBERi0xLjQK')); // Base64 of "%PDF-1.4\n"
});

test('Defect 7: public/assets/aistudio removed and EN/AR translation parity holds with no promotional hype', () => {
  const scratchDir = path.resolve(process.cwd(), 'public', 'assets', 'aistudio');
  assert.equal(fs.existsSync(scratchDir), false);

  function collectLeaves(obj: any, prefix = ''): string[] {
    const out: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        out.push(...collectLeaves(val, nextKey));
      } else {
        out.push(nextKey);
      }
    }
    return out;
  }

  const enLeaves = collectLeaves(translations.en);
  const arLeaves = collectLeaves(translations.ar);
  assert.deepEqual(enLeaves, arLeaves);

  const enSerialized = JSON.stringify(translations.en);
  assert.equal(/\bIndustrial\b/i.test(enSerialized), false);
});

test('Secondary: LP shadow prices (dual values) & slacks match finite-difference RHS perturbations (Presolve ON and OFF)', () => {
  // Max Z = 50 x1 + 40 x2 s.t. 2 x1 + 1 x2 <= 100, 1 x1 + 1 x2 <= 80, x1 <= 60 (tight at presolve bound!), x2 >= 0
  // Optimum: x1 = 20, x2 = 60 -> Z = 3400; duals: c1 = 10, c2 = 30, c3 = 0
  const baseLp: LpProblem = {
    title: 'Dual Sensitivity Check',
    sense: 'maximize',
    isIntegerProgram: false,
    variables: [
      { id: 'x1', name: 'x1', type: 'continuous', objCoeff: 50, lowerBound: 0, upperBound: Infinity },
      { id: 'x2', name: 'x2', type: 'continuous', objCoeff: 40, lowerBound: 0, upperBound: Infinity },
    ],
    constraints: [
      { id: 'c1', name: 'Labor', coeffs: [2, 1], op: '<=', rhs: 100 },
      { id: 'c2', name: 'Material', coeffs: [1, 1], op: '<=', rhs: 80 },
      { id: 'c3', name: 'Cap', coeffs: [1, 0], op: '<=', rhs: 60 },
    ],
  };

  for (const usePresolve of [false, true]) {
    const res = runLpSolvePipeline(baseLp, usePresolve);
    assert.equal(res.simplex.status, 'optimal');
    assert.ok(Math.abs(res.simplex.objectiveValue - 3400) < 1e-4);

    const details = res.simplex.constraintDetails ?? [];
    assert.equal(details.length, 3);
    assert.ok(Math.abs(details[0].dualValue - 10) < 1e-4);
    assert.ok(Math.abs(details[1].dualValue - 30) < 1e-4);
    assert.ok(Math.abs(details[2].dualValue - 0) < 1e-4);
    assert.ok(Math.abs(details[2].slackOrSurplus - 40) < 1e-4);

    // Finite difference verification on Labor (+0.1 RHS => +1.0 Z)
    const perturbed: LpProblem = {
      ...baseLp,
      constraints: baseLp.constraints.map((c, idx) => (idx === 0 ? { ...c, rhs: c.rhs + 0.1 } : c)),
    };
    const resPert = runLpSolvePipeline(perturbed, usePresolve);
    const deltaZ = resPert.simplex.objectiveValue - res.simplex.objectiveValue;
    assert.ok(Math.abs(deltaZ / 0.1 - details[0].dualValue) < 1e-4);
  }
});

test('Secondary: Settings validation & Workspace JSON import/export schema guards', async () => {
  assert.equal(validateAppSettings({ maxDepth: -1 }).valid, false);
  assert.equal(validateAppSettings({ maxDepth: 0 }).valid, true);
  assert.equal(validateAppSettings({ maxDepth: 0 }).sanitized.maxDepth, 0);
  assert.equal(validateAppSettings({ maxNodes: 0 }).valid, false);
  assert.equal(validateAppSettings({ eps: 0.5 }).valid, false);
  assert.equal(validateAppSettings({ pivotEps: 1e-5, eps: 1e-6 }).valid, false);

  const exported = await exportWorkspaceJson();
  const parsed = JSON.parse(exported);
  assert.equal(parsed.version, '1.1.0');
  assert.equal(parsed.app, 'Sheeta Operations Research');

  await assert.rejects(() => importWorkspaceJson('not-valid-json{'), /Malformed JSON/);
  await assert.rejects(
    () => importWorkspaceJson(JSON.stringify({ app: 'Wrong App', version: '1.1.0', problems: [] })),
    /signature/
  );
  await assert.rejects(
    () => importWorkspaceJson(JSON.stringify({ app: 'Sheeta Operations Research', version: '9.9.9', problems: [] })),
    /Unsupported backup schema/
  );
  await assert.rejects(
    () =>
      importWorkspaceJson(
        JSON.stringify({
          app: 'Sheeta Operations Research',
          version: '1.1.0',
          problems: [{ id: 'p1', title: 'Bad', module: 'unknown_mod', data: {} }],
        })
      ),
    /Invalid problem entry/
  );
});

test('Secondary: Hardware-bounded Worker Pool sizing for desktop vs mobile', () => {
  assert.equal(
    getRecommendedPoolSize({ hardwareConcurrency: 12, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }),
    4
  );
  assert.equal(
    getRecommendedPoolSize({ hardwareConcurrency: 8, userAgent: 'Mozilla/5.0 (Linux; Android 14)' }),
    2
  );
  assert.equal(
    getRecommendedPoolSize({ hardwareConcurrency: 1, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }),
    1
  );
});
