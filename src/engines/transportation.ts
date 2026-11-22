/**
 * Sheeta Operations Research
 * Transportation (VAM + MODI) & Hungarian Assignment Solver
 */

import {
  AssignmentProblem,
  AssignmentResult,
  TransportationProblem,
  TransportationResult,
} from '../types';
import { EPS } from './matrix';

// ==========================================
// Transportation Problem Solver
// ==========================================

export function solveTransportation(problem: TransportationProblem): TransportationResult {
  const startTime = performance.now();
  const steps: string[] = [];

  let sources = problem.sources.map((s) => ({ ...s }));
  let destinations = problem.destinations.map((d) => ({ ...d }));
  let costs = problem.costs.map((row) => [...row]);

  const totalSupply = sources.reduce((sum, s) => sum + s.capacity, 0);
  const totalDemand = destinations.reduce((sum, d) => sum + d.demand, 0);

  let dummyAdded: 'source' | 'destination' | 'none' = 'none';

  if (Math.abs(totalSupply - totalDemand) > EPS) {
    if (totalSupply > totalDemand) {
      // Add dummy destination
      dummyAdded = 'destination';
      const diff = totalSupply - totalDemand;
      destinations.push({ id: 'dummy_dest', name: 'Dummy Market', demand: diff });
      for (let i = 0; i < costs.length; i++) {
        costs[i].push(0);
      }
      steps.push(`Unbalanced problem: Added Dummy Destination with demand ${diff} at zero cost.`);
    } else {
      // Add dummy source
      dummyAdded = 'source';
      const diff = totalDemand - totalSupply;
      sources.push({ id: 'dummy_source', name: 'Dummy Supplier', capacity: diff });
      costs.push(new Array(destinations.length).fill(0));
      steps.push(`Unbalanced problem: Added Dummy Source with capacity ${diff} at zero cost.`);
    }
  }

  const numRows = sources.length;
  const numCols = destinations.length;

  // Step 1: Initial Basic Feasible Solution
  let allocations: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));

  if (problem.method === 'northwest') {
    allocations = getNorthwestCornerAllocation(sources, destinations);
    steps.push('Generated Initial Basic Feasible Solution using Northwest Corner Method.');
  } else if (problem.method === 'least_cost') {
    allocations = getLeastCostAllocation(sources, destinations, costs);
    steps.push('Generated Initial Basic Feasible Solution using Least Cost Method.');
  } else {
    // Default: VAM
    allocations = getVamAllocation(sources, destinations, costs);
    steps.push('Generated Initial Basic Feasible Solution using Vogel’s Approximation Method (VAM).');
  }

  // Step 2: MODI Optimization (Modified Distribution / u-v method)
  let isOptimal = false;
  let iterations = 0;
  const maxIterations = 50;

  while (!isOptimal && iterations < maxIterations) {
    iterations++;

    // Ensure non-degeneracy: exactly m + n - 1 basic cells
    const basicCells: [number, number][] = [];
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        if (allocations[r][c] > 0) {
          basicCells.push([r, c]);
        }
      }
    }

    // Solve for u and v using basic cells: u_r + v_c = costs[r][c]
    const u: (number | null)[] = new Array(numRows).fill(null);
    const v: (number | null)[] = new Array(numCols).fill(null);
    u[0] = 0; // arbitrary reference

    let updated = true;
    let passes = 0;
    while (updated && passes < numRows + numCols + 5) {
      updated = false;
      passes++;
      for (const [r, c] of basicCells) {
        if (u[r] !== null && v[c] === null) {
          v[c] = costs[r][c] - u[r]!;
          updated = true;
        } else if (v[c] !== null && u[r] === null) {
          u[r] = costs[r][c] - v[c]!;
          updated = true;
        }
      }
    }

    // For any unassigned components, assign 0
    for (let r = 0; r < numRows; r++) if (u[r] === null) u[r] = 0;
    for (let c = 0; c < numCols; c++) if (v[c] === null) v[c] = 0;

    // Calculate Opportunity Costs Delta_rc = costs[r][c] - (u_r + v_c)
    let minDelta = 0;
    let enterRow = -1;
    let enterCol = -1;

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        if (allocations[r][c] === 0) {
          const delta = costs[r][c] - (u[r]! + v[c]!);
          if (delta < minDelta - EPS) {
            minDelta = delta;
            enterRow = r;
            enterCol = c;
          }
        }
      }
    }

    if (enterRow === -1 || minDelta >= -EPS) {
      isOptimal = true;
      steps.push(`Optimality reached at iteration ${iterations}. All opportunity costs Δ_ij >= 0.`);
      break;
    }

    // Find loop to reallocate
    const loop = findSteppingStoneLoop(allocations, enterRow, enterCol, numRows, numCols);
    if (!loop || loop.length < 4) {
      // Cannot find stepping stone loop; accept current allocation
      break;
    }

    // Find theta: min allocation in negative loop positions (odd indices)
    let theta = Infinity;
    for (let k = 1; k < loop.length; k += 2) {
      const [r, c] = loop[k];
      if (allocations[r][c] < theta) {
        theta = allocations[r][c];
      }
    }

    if (theta === Infinity || theta <= 0) {
      break;
    }

    // Shift allocations along the loop
    for (let k = 0; k < loop.length; k++) {
      const [r, c] = loop[k];
      if (k % 2 === 0) {
        allocations[r][c] += theta;
      } else {
        allocations[r][c] -= theta;
      }
    }
  }

  // Calculate total cost
  let totalCost = 0;
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      totalCost += allocations[r][c] * costs[r][c];
    }
  }

  return {
    allocations,
    unitCosts: costs,
    totalCost,
    isBalanced: dummyAdded === 'none',
    dummyAdded,
    stepsExplanation: steps,
    executionTimeMs: performance.now() - startTime,
  };
}

/**
 * Initial Basic Feasible Solution via Vogel's Approximation Method (VAM)
 */
function getVamAllocation(
  sources: { capacity: number }[],
  destinations: { demand: number }[],
  costs: number[][]
): number[][] {
  const numRows = sources.length;
  const numCols = destinations.length;
  const remSupply = sources.map((s) => s.capacity);
  const remDemand = destinations.map((d) => d.demand);
  const alloc: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));

  const activeRows = new Set<number>(Array.from({ length: numRows }, (_, i) => i));
  const activeCols = new Set<number>(Array.from({ length: numCols }, (_, j) => j));

  while (activeRows.size > 0 && activeCols.size > 0) {
    // If only 1 row or 1 col left, allocate directly
    if (activeRows.size === 1) {
      const r = Array.from(activeRows)[0];
      for (const c of activeCols) {
        const amt = Math.min(remSupply[r], remDemand[c]);
        alloc[r][c] = amt;
        remSupply[r] -= amt;
        remDemand[c] -= amt;
      }
      break;
    }
    if (activeCols.size === 1) {
      const c = Array.from(activeCols)[0];
      for (const r of activeRows) {
        const amt = Math.min(remSupply[r], remDemand[c]);
        alloc[r][c] = amt;
        remSupply[r] -= amt;
        remDemand[c] -= amt;
      }
      break;
    }

    // Calculate penalties for rows
    let maxPenalty = -1;
    let selectedType: 'row' | 'col' = 'row';
    let selectedIdx = -1;

    for (const r of activeRows) {
      const rowCosts = Array.from(activeCols).map((c) => costs[r][c]).sort((a, b) => a - b);
      const penalty = rowCosts.length >= 2 ? rowCosts[1] - rowCosts[0] : rowCosts[0];
      if (penalty > maxPenalty) {
        maxPenalty = penalty;
        selectedType = 'row';
        selectedIdx = r;
      }
    }

    // Calculate penalties for columns
    for (const c of activeCols) {
      const colCosts = Array.from(activeRows).map((r) => costs[r][c]).sort((a, b) => a - b);
      const penalty = colCosts.length >= 2 ? colCosts[1] - colCosts[0] : colCosts[0];
      if (penalty > maxPenalty) {
        maxPenalty = penalty;
        selectedType = 'col';
        selectedIdx = c;
      }
    }

    // Allocate in cell with lowest cost
    if (selectedType === 'row') {
      const r = selectedIdx;
      let minCost = Infinity;
      let bestC = -1;
      for (const c of activeCols) {
        if (costs[r][c] < minCost) {
          minCost = costs[r][c];
          bestC = c;
        }
      }
      const qty = Math.min(remSupply[r], remDemand[bestC]);
      alloc[r][bestC] = qty;
      remSupply[r] -= qty;
      remDemand[bestC] -= qty;
      if (remSupply[r] <= EPS) activeRows.delete(r);
      if (remDemand[bestC] <= EPS) activeCols.delete(bestC);
    } else {
      const c = selectedIdx;
      let minCost = Infinity;
      let bestR = -1;
      for (const r of activeRows) {
        if (costs[r][c] < minCost) {
          minCost = costs[r][c];
          bestR = r;
        }
      }
      const qty = Math.min(remSupply[bestR], remDemand[c]);
      alloc[bestR][c] = qty;
      remSupply[bestR] -= qty;
      remDemand[c] -= qty;
      if (remSupply[bestR] <= EPS) activeRows.delete(bestR);
      if (remDemand[c] <= EPS) activeCols.delete(c);
    }
  }

  return alloc;
}

/**
 * Northwest Corner Method
 */
function getNorthwestCornerAllocation(
  sources: { capacity: number }[],
  destinations: { demand: number }[]
): number[][] {
  const numRows = sources.length;
  const numCols = destinations.length;
  const remSupply = sources.map((s) => s.capacity);
  const remDemand = destinations.map((d) => d.demand);
  const alloc: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));

  let r = 0;
  let c = 0;

  while (r < numRows && c < numCols) {
    const qty = Math.min(remSupply[r], remDemand[c]);
    alloc[r][c] = qty;
    remSupply[r] -= qty;
    remDemand[c] -= qty;

    if (remSupply[r] <= EPS) r++;
    if (remDemand[c] <= EPS) c++;
  }

  return alloc;
}

/**
 * Least Cost Method
 */
function getLeastCostAllocation(
  sources: { capacity: number }[],
  destinations: { demand: number }[],
  costs: number[][]
): number[][] {
  const numRows = sources.length;
  const numCols = destinations.length;
  const remSupply = sources.map((s) => s.capacity);
  const remDemand = destinations.map((d) => d.demand);
  const alloc: number[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(0));

  const remainingCells: [number, number][] = [];
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      remainingCells.push([r, c]);
    }
  }

  remainingCells.sort((a, b) => costs[a[0]][a[1]] - costs[b[0]][b[1]]);

  for (const [r, c] of remainingCells) {
    if (remSupply[r] > EPS && remDemand[c] > EPS) {
      const qty = Math.min(remSupply[r], remDemand[c]);
      alloc[r][c] = qty;
      remSupply[r] -= qty;
      remDemand[c] -= qty;
    }
  }

  return alloc;
}

/**
 * Finds stepping stone loop for MODI entering cell
 */
function findSteppingStoneLoop(
  allocations: number[][],
  startR: number,
  startC: number,
  numRows: number,
  numCols: number
): [number, number][] | null {
  const visited = new Set<string>();
  const path: [number, number][] = [[startR, startC]];

  function dfs(currR: number, currC: number, lookingForHorizontal: boolean): boolean {
    if (lookingForHorizontal) {
      // Look along row currR for other basic cells
      for (let c = 0; c < numCols; c++) {
        if (c === currC) continue;
        if (c === startC && currR === startR && path.length >= 4) {
          return true;
        }
        if (allocations[currR][c] > 0) {
          const key = `${currR},${c}`;
          if (!visited.has(key)) {
            visited.add(key);
            path.push([currR, c]);
            if (dfs(currR, c, false)) return true;
            path.pop();
            visited.delete(key);
          }
        }
      }
    } else {
      // Look along col currC for other basic cells
      for (let r = 0; r < numRows; r++) {
        if (r === currR) continue;
        if (r === startR && currC === startC && path.length >= 4) {
          return true;
        }
        if (allocations[r][currC] > 0) {
          const key = `${r},${currC}`;
          if (!visited.has(key)) {
            visited.add(key);
            path.push([r, currC]);
            if (dfs(r, currC, true)) return true;
            path.pop();
            visited.delete(key);
          }
        }
      }
    }
    return false;
  }

  // Try both horizontal first and vertical first
  if (dfs(startR, startC, true)) return path;
  if (dfs(startR, startC, false)) return path;

  return null;
}

// ==========================================
// Hungarian Assignment Solver
// ==========================================

export function solveHungarianAssignment(problem: AssignmentProblem): AssignmentResult {
  const startTime = performance.now();
  const numWorkers = problem.workers.length;
  const numTasks = problem.tasks.length;
  const n = Math.max(numWorkers, numTasks);

  // Pad matrix to n x n
  let matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  let maxVal = -Infinity;
  for (let i = 0; i < numWorkers; i++) {
    for (let j = 0; j < numTasks; j++) {
      const c = problem.costs[i]?.[j] ?? 0;
      matrix[i][j] = c;
      if (c > maxVal) maxVal = c;
    }
  }

  // If maximize: invert costs
  if (problem.sense === 'maximize') {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        matrix[i][j] = maxVal - matrix[i][j];
      }
    }
  }

  // Step 1: Row reduction
  for (let i = 0; i < n; i++) {
    let minRow = Infinity;
    for (let j = 0; j < n; j++) {
      if (matrix[i][j] < minRow) minRow = matrix[i][j];
    }
    for (let j = 0; j < n; j++) {
      matrix[i][j] -= minRow;
    }
  }

  // Step 2: Column reduction
  for (let j = 0; j < n; j++) {
    let minCol = Infinity;
    for (let i = 0; i < n; i++) {
      if (matrix[i][j] < minCol) minCol = matrix[i][j];
    }
    for (let i = 0; i < n; i++) {
      matrix[i][j] -= minCol;
    }
  }

  // Maximum Bipartite Matching on zeros
  const assignment = hungarianMatch(matrix, n);

  const assignmentsList: {
    workerIdx: number;
    workerName: string;
    taskIdx: number;
    taskName: string;
    cost: number;
  }[] = [];

  let totalCost = 0;
  for (let i = 0; i < numWorkers; i++) {
    const taskIdx = assignment[i];
    if (taskIdx < numTasks) {
      const originalCost = problem.costs[i]?.[taskIdx] ?? 0;
      totalCost += originalCost;
      assignmentsList.push({
        workerIdx: i,
        workerName: problem.workers[i],
        taskIdx,
        taskName: problem.tasks[taskIdx],
        cost: originalCost,
      });
    }
  }

  return {
    assignments: assignmentsList,
    totalCost,
    costMatrix: problem.costs,
    executionTimeMs: performance.now() - startTime,
  };
}

/**
 * Hungarian Matching using augmenting paths
 */
function hungarianMatch(costMatrix: number[][], n: number): number[] {
  // Potentials u and v
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0 && p[j] <= n) {
      result[p[j] - 1] = j - 1;
    }
  }

  return result;
}
