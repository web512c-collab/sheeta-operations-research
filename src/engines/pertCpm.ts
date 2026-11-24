/**
 * Sheeta Operations Research
 * Project Network Management (PERT / CPM) Engine with Strict Graph Validation
 * & Multi-Critical-Path Enumeration
 */

import { ActivityDef, ActivityResult, PertCpmResult, PertValidationErrorCode } from '../types';
import { EPS } from './matrix';

export class PertValidationError extends Error {
  code: PertValidationErrorCode;
  details?: {
    activityId?: string;
    predecessorId?: string;
    cycle?: string[];
  };

  constructor(
    code: PertValidationErrorCode,
    message: string,
    details?: {
      activityId?: string;
      predecessorId?: string;
      cycle?: string[];
    }
  ) {
    super(message);
    this.name = 'PertValidationError';
    this.code = code;
    this.details = details;
  }
}

export interface PertSolveOptions {
  maxCriticalPaths?: number;
  eps?: number;
}

const DEFAULT_MAX_CRITICAL_PATHS = 50;

export function solvePertCpm(
  activities: ActivityDef[],
  options: PertSolveOptions = {}
): PertCpmResult {
  const eps = options.eps ?? EPS;
  const maxCriticalPaths = Math.max(1, Math.floor(options.maxCriticalPaths ?? DEFAULT_MAX_CRITICAL_PATHS));
  const n = activities.length;

  if (n === 0) {
    throw new PertValidationError(
      'EMPTY_NETWORK',
      'Project network must contain at least one activity.'
    );
  }

  // Step 1: Validate IDs, durations, and normalize predecessor lists
  const idSet = new Set<string>();
  const normalizedActivities: ActivityDef[] = [];

  for (const act of activities) {
    const cleanId = (act.id ?? '').trim();
    if (!cleanId) {
      throw new PertValidationError(
        'EMPTY_ID',
        'Every activity must have a non-empty identifier.'
      );
    }
    if (idSet.has(cleanId)) {
      throw new PertValidationError(
        'DUPLICATE_ID',
        `Duplicate activity ID detected: "${cleanId}".`,
        { activityId: cleanId }
      );
    }
    idSet.add(cleanId);

    if (act.durationMode === 'three_point') {
      const a = act.optimistic;
      const m = act.mostLikely;
      const b = act.pessimistic;
      if (
        a === undefined ||
        m === undefined ||
        b === undefined ||
        !Number.isFinite(a) ||
        !Number.isFinite(m) ||
        !Number.isFinite(b) ||
        a < 0 ||
        m < 0 ||
        b < 0
      ) {
        throw new PertValidationError(
          'INVALID_DURATION',
          `Invalid three-point duration for activity "${cleanId}". Values must be finite and non-negative.`,
          { activityId: cleanId }
        );
      }
      if (!(a <= m && m <= b)) {
        throw new PertValidationError(
          'INVALID_THREE_POINT',
          `Activity "${cleanId}" violates three-point ordering (optimistic <= most likely <= pessimistic): (${a}, ${m}, ${b}).`,
          { activityId: cleanId }
        );
      }
    } else {
      if (!Number.isFinite(act.duration) || act.duration < 0) {
        throw new PertValidationError(
          'INVALID_DURATION',
          `Invalid duration for activity "${cleanId}". Duration must be finite and non-negative.`,
          { activityId: cleanId }
        );
      }
    }

    const cleanPreds: string[] = [];
    const seenPreds = new Set<string>();
    for (const rawPred of act.predecessors ?? []) {
      const p = (rawPred ?? '').trim();
      if (!p) continue;
      if (!seenPreds.has(p)) {
        seenPreds.add(p);
        cleanPreds.push(p);
      }
    }

    normalizedActivities.push({
      ...act,
      id: cleanId,
      predecessors: cleanPreds,
    });
  }

  // Step 2: Validate references (self-dependencies & unknown predecessors)
  for (const act of normalizedActivities) {
    for (const predId of act.predecessors) {
      if (predId === act.id) {
        throw new PertValidationError(
          'SELF_DEPENDENCY',
          `Activity "${act.id}" cannot depend on itself.`,
          { activityId: act.id, predecessorId: predId }
        );
      }
      if (!idSet.has(predId)) {
        throw new PertValidationError(
          'UNKNOWN_PREDECESSOR',
          `Activity "${act.id}" references unknown predecessor "${predId}".`,
          { activityId: act.id, predecessorId: predId }
        );
      }
    }
  }

  // Step 3: Build expected duration, variance, and graph
  const calculatedActivities: ActivityResult[] = normalizedActivities.map((act) => {
    let te = act.duration;
    let variance = 0;
    let stdDev = 0;

    if (act.durationMode === 'three_point') {
      const a = act.optimistic!;
      const m = act.mostLikely!;
      const b = act.pessimistic!;
      te = (a + 4 * m + b) / 6;
      stdDev = (b - a) / 6;
      variance = stdDev * stdDev;
    }

    return {
      ...act,
      expectedDuration: te,
      variance,
      stdDev,
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      slack: 0,
      freeFloat: 0,
      isCritical: false,
    };
  });

  const actMap = new Map<string, ActivityResult>();
  const successorsMap = new Map<string, string[]>();
  for (const a of calculatedActivities) {
    actMap.set(a.id, a);
    successorsMap.set(a.id, []);
  }
  for (const a of calculatedActivities) {
    for (const predId of a.predecessors) {
      successorsMap.get(predId)!.push(a.id);
    }
  }

  // Step 4: Explicit Cycle Detection (3-color DFS) before topological sort
  const color = new Map<string, 0 | 1 | 2>();
  for (const a of calculatedActivities) {
    color.set(a.id, 0);
  }
  const dfsStack: string[] = [];

  function detectCycleDfs(nodeId: string): void {
    color.set(nodeId, 1);
    dfsStack.push(nodeId);

    const succs = successorsMap.get(nodeId) ?? [];
    for (const nextId of succs) {
      const c = color.get(nextId);
      if (c === 1) {
        const idx = dfsStack.indexOf(nextId);
        const cycle = [...dfsStack.slice(idx), nextId];
        throw new PertValidationError(
          'CYCLE_DETECTED',
          `Dependency cycle detected: ${cycle.join(' -> ')}.`,
          { cycle }
        );
      }
      if (c === 0) {
        detectCycleDfs(nextId);
      }
    }

    dfsStack.pop();
    color.set(nodeId, 2);
  }

  for (const a of calculatedActivities) {
    if (color.get(a.id) === 0) {
      detectCycleDfs(a.id);
    }
  }

  // Step 5: Topological Sort (guaranteed acyclic)
  const inDegree = new Map<string, number>();
  for (const a of calculatedActivities) {
    inDegree.set(a.id, a.predecessors.length);
  }

  const queue: string[] = [];
  for (const a of calculatedActivities) {
    if ((inDegree.get(a.id) ?? 0) === 0) {
      queue.push(a.id);
    }
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const succ of successorsMap.get(curr) ?? []) {
      const nextDeg = (inDegree.get(succ) ?? 0) - 1;
      inDegree.set(succ, nextDeg);
      if (nextDeg === 0) {
        queue.push(succ);
      }
    }
  }

  // Step 6: Forward Pass (ES & EF)
  for (const actId of topoOrder) {
    const act = actMap.get(actId)!;
    let maxEf = 0;
    for (const predId of act.predecessors) {
      const pred = actMap.get(predId)!;
      if (pred.ef > maxEf) {
        maxEf = pred.ef;
      }
    }
    act.es = maxEf;
    act.ef = act.es + act.expectedDuration;
  }

  let totalDuration = 0;
  for (const a of calculatedActivities) {
    if (a.ef > totalDuration) {
      totalDuration = a.ef;
    }
  }

  // Step 7: Backward Pass (LF, LS, Total Slack, Free Float)
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const actId = topoOrder[i];
    const act = actMap.get(actId)!;
    const successors = successorsMap.get(actId) ?? [];

    if (successors.length === 0) {
      act.lf = totalDuration;
    } else {
      let minLs = Infinity;
      for (const succId of successors) {
        const succ = actMap.get(succId)!;
        if (succ.ls < minLs) {
          minLs = succ.ls;
        }
      }
      act.lf = minLs === Infinity ? totalDuration : minLs;
    }

    act.ls = act.lf - act.expectedDuration;
    const rawSlack = act.ls - act.es;
    act.slack = Math.abs(rawSlack) <= eps ? 0 : Math.max(0, rawSlack);

    if (successors.length === 0) {
      const rawFf = totalDuration - act.ef;
      act.freeFloat = Math.abs(rawFf) <= eps ? 0 : Math.max(0, rawFf);
    } else {
      let minSuccEs = Infinity;
      for (const succId of successors) {
        const succ = actMap.get(succId)!;
        if (succ.es < minSuccEs) {
          minSuccEs = succ.es;
        }
      }
      const rawFf = minSuccEs - act.ef;
      act.freeFloat = Math.abs(rawFf) <= eps ? 0 : Math.max(0, rawFf);
    }

    act.isCritical = act.slack <= eps;
  }

  // Step 8: Enumerate all distinct start-to-finish Critical Paths via tight critical edges
  const tightCritSuccessors = new Map<string, string[]>();
  for (const a of calculatedActivities) {
    if (!a.isCritical) continue;
    const succs = (successorsMap.get(a.id) ?? []).filter((succId) => {
      const succ = actMap.get(succId)!;
      return succ.isCritical && Math.abs(succ.es - a.ef) <= eps;
    });
    tightCritSuccessors.set(a.id, succs);
  }

  const startCriticalNodes = calculatedActivities.filter(
    (a) => a.isCritical && Math.abs(a.es) <= eps && a.predecessors.length === 0
  );
  // Fallback if all nodes with no predecessors were non-zero? Shouldn't happen in a valid DAG since root nodes have es=0.
  const effectiveStarts =
    startCriticalNodes.length > 0
      ? startCriticalNodes
      : calculatedActivities.filter((a) => a.isCritical && Math.abs(a.es) <= eps);

  const criticalPaths: string[][] = [];
  let pathsCapped = false;
  const currentPath: string[] = [];

  function enumerateCriticalPaths(nodeId: string): void {
    if (criticalPaths.length >= maxCriticalPaths) {
      pathsCapped = true;
      return;
    }

    const act = actMap.get(nodeId)!;
    currentPath.push(nodeId);
    const nextCritSuccs = tightCritSuccessors.get(nodeId) ?? [];

    if (nextCritSuccs.length === 0) {
      if (Math.abs(act.ef - totalDuration) <= eps) {
        criticalPaths.push([...currentPath]);
      }
    } else {
      let extended = false;
      for (const nextId of nextCritSuccs) {
        extended = true;
        enumerateCriticalPaths(nextId);
        if (criticalPaths.length >= maxCriticalPaths) {
          pathsCapped = true;
          break;
        }
      }
      if (!extended && Math.abs(act.ef - totalDuration) <= eps) {
        criticalPaths.push([...currentPath]);
      }
    }

    currentPath.pop();
  }

  for (const startAct of effectiveStarts) {
    if (criticalPaths.length >= maxCriticalPaths) {
      pathsCapped = true;
      break;
    }
    enumerateCriticalPaths(startAct.id);
  }

  const criticalPath = criticalPaths[0] ?? [];
  let projectVariance = 0;
  for (const actId of criticalPath) {
    projectVariance += actMap.get(actId)?.variance ?? 0;
  }
  const projectStdDev = Math.sqrt(projectVariance);

  const probabilityForTargetTime = (targetTime: number): number => {
    if (projectStdDev <= eps) {
      return targetTime >= totalDuration ? 1 : 0;
    }
    const z = (targetTime - totalDuration) / projectStdDev;
    return normalCdf(z);
  };

  return {
    activities: calculatedActivities,
    criticalPath,
    criticalPaths,
    pathsCapped,
    maxCriticalPaths,
    totalDuration,
    projectVariance,
    projectStdDev,
    probabilityForTargetTime,
  };
}

/**
 * Standard Normal Cumulative Distribution Function approximation
 */
export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  let sum = 0;
  let term = z;
  let n = 3;
  while (Math.abs(term) > 1e-10 && n < 100) {
    sum += term;
    term = (term * z * z) / n;
    n += 2;
  }
  return 0.5 + (sum / Math.sqrt(2 * Math.PI)) * Math.exp((-z * z) / 2);
}
