/**
 * Sheeta Operations Research
 * Project Network Management (PERT / CPM) Engine
 */

import { ActivityDef, ActivityResult, PertCpmResult } from '../types';
import { EPS } from './matrix';

export function solvePertCpm(activities: ActivityDef[]): PertCpmResult {
  const n = activities.length;
  if (n === 0) {
    return {
      activities: [],
      criticalPath: [],
      totalDuration: 0,
      projectVariance: 0,
      projectStdDev: 0,
    };
  }

  // Step 1: Compute expected duration and variance for each activity
  const calculatedActivities: ActivityResult[] = activities.map((act) => {
    let te = act.duration;
    let variance = 0;
    let stdDev = 0;

    if (act.durationMode === 'three_point') {
      const a = act.optimistic ?? act.duration;
      const m = act.mostLikely ?? act.duration;
      const b = act.pessimistic ?? act.duration;
      te = (a + 4 * m + b) / 6;
      variance = Math.pow((b - a) / 6, 2);
      stdDev = (b - a) / 6;
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
  calculatedActivities.forEach((a) => actMap.set(a.id, a));

  // Build adjacency graph & successors
  const successorsMap = new Map<string, string[]>();
  calculatedActivities.forEach((a) => successorsMap.set(a.id, []));

  calculatedActivities.forEach((a) => {
    a.predecessors.forEach((predId) => {
      const cleanPred = predId.trim();
      if (cleanPred && successorsMap.has(cleanPred)) {
        successorsMap.get(cleanPred)!.push(a.id);
      }
    });
  });

  // Step 2: Topological sorting
  const inDegree = new Map<string, number>();
  calculatedActivities.forEach((a) => {
    const validPreds = a.predecessors.filter((p) => p.trim() && actMap.has(p.trim()));
    inDegree.set(a.id, validPreds.length);
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    const successors = successorsMap.get(curr) || [];
    for (const succ of successors) {
      inDegree.set(succ, (inDegree.get(succ) || 0) - 1);
      if (inDegree.get(succ) === 0) {
        queue.push(succ);
      }
    }
  }

  // Handle cycle fallback: if topological sort didn't include all, append remainder
  calculatedActivities.forEach((a) => {
    if (!topoOrder.includes(a.id)) topoOrder.push(a.id);
  });

  // Step 3: Forward Pass (ES & EF)
  for (const actId of topoOrder) {
    const act = actMap.get(actId)!;
    let maxEf = 0;
    for (const p of act.predecessors) {
      const pred = actMap.get(p.trim());
      if (pred && pred.ef > maxEf) {
        maxEf = pred.ef;
      }
    }
    act.es = maxEf;
    act.ef = act.es + act.expectedDuration;
  }

  // Total project duration is max EF among all activities
  let totalDuration = 0;
  calculatedActivities.forEach((a) => {
    if (a.ef > totalDuration) totalDuration = a.ef;
  });

  // Step 4: Backward Pass (LF & LS)
  // Process in reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const actId = topoOrder[i];
    const act = actMap.get(actId)!;
    const successors = successorsMap.get(actId) || [];

    if (successors.length === 0) {
      act.lf = totalDuration;
    } else {
      let minLs = Infinity;
      for (const succId of successors) {
        const succ = actMap.get(succId);
        if (succ && succ.ls < minLs) {
          minLs = succ.ls;
        }
      }
      act.lf = minLs === Infinity ? totalDuration : minLs;
    }
    act.ls = act.lf - act.expectedDuration;

    // Slack / Total Float
    act.slack = Math.max(0, act.ls - act.es);

    // Free Float: min(ES of successors) - EF
    if (successors.length === 0) {
      act.freeFloat = Math.max(0, totalDuration - act.ef);
    } else {
      let minSuccEs = Infinity;
      for (const succId of successors) {
        const succ = actMap.get(succId);
        if (succ && succ.es < minSuccEs) {
          minSuccEs = succ.es;
        }
      }
      act.freeFloat = Math.max(0, minSuccEs - act.ef);
    }

    act.isCritical = act.slack <= EPS;
  }

  // Step 5: Critical Path & Variance
  const criticalPath: string[] = [];
  let projectVariance = 0;

  for (const actId of topoOrder) {
    const act = actMap.get(actId)!;
    if (act.isCritical) {
      criticalPath.push(act.id);
      projectVariance += act.variance;
    }
  }

  const projectStdDev = Math.sqrt(projectVariance);

  const probabilityForTargetTime = (targetTime: number): number => {
    if (projectStdDev <= EPS) {
      return targetTime >= totalDuration ? 1 : 0;
    }
    const z = (targetTime - totalDuration) / projectStdDev;
    return normalCdf(z);
  };

  return {
    activities: calculatedActivities,
    criticalPath,
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
