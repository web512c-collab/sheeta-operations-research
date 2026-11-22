/**
 * Sheeta Operations Research
 * Queuing Theory (M/M/1, M/M/c, M/M/1/K) & Inventory (EOQ/EPQ/Discounts) Engines
 */

import {
  EoqInputs,
  EoqResult,
  QueuingInputs,
  QueuingResult,
} from '../types';
import { snapZero } from './matrix';

// ==========================================
// Queuing Theory Solver
// ==========================================

export function solveQueuing(inputs: QueuingInputs): QueuingResult {
  const { model, arrivalRate, serviceRate, servers, capacity } = inputs;
  const lambda = Math.max(0.0001, arrivalRate);
  const mu = Math.max(0.0001, serviceRate);

  if (model === 'mm1') {
    const rho = lambda / mu;
    if (rho >= 1) {
      return createUnstableQueue(rho);
    }
    const p0 = 1 - rho;
    const l = rho / (1 - rho);
    const lq = (rho * rho) / (1 - rho);
    const w = 1 / (mu - lambda);
    const wq = rho / (mu - lambda);

    const stateProbabilities: { n: number; prob: number }[] = [];
    for (let n = 0; n <= 10; n++) {
      stateProbabilities.push({ n, prob: snapZero(p0 * Math.pow(rho, n)) });
    }

    return {
      rho: snapZero(rho),
      p0: snapZero(p0),
      l: snapZero(l),
      lq: snapZero(lq),
      w: snapZero(w),
      wq: snapZero(wq),
      stateProbabilities,
    };
  }

  if (model === 'mmc') {
    const c = Math.max(1, Math.floor(servers));
    const r = lambda / mu; // traffic intensity
    const rho = r / c; // server utilization

    if (rho >= 1) {
      return createUnstableQueue(rho);
    }

    // Compute P0 via Erlang-C
    let sumTerms = 0;
    for (let n = 0; n < c; n++) {
      sumTerms += Math.pow(r, n) / factorial(n);
    }
    const cTerm = Math.pow(r, c) / (factorial(c) * (1 - rho));
    const p0 = 1 / (sumTerms + cTerm);

    const lq = (p0 * Math.pow(r, c) * rho) / (factorial(c) * Math.pow(1 - rho, 2));
    const wq = lq / lambda;
    const w = wq + 1 / mu;
    const l = lambda * w;

    const stateProbabilities: { n: number; prob: number }[] = [];
    for (let n = 0; n <= Math.min(15, c + 8); n++) {
      let prob: number;
      if (n <= c) {
        prob = (Math.pow(r, n) / factorial(n)) * p0;
      } else {
        prob = (Math.pow(r, n) / (factorial(c) * Math.pow(c, n - c))) * p0;
      }
      stateProbabilities.push({ n, prob: snapZero(prob) });
    }

    return {
      rho: snapZero(rho),
      p0: snapZero(p0),
      l: snapZero(l),
      lq: snapZero(lq),
      w: snapZero(w),
      wq: snapZero(wq),
      stateProbabilities,
    };
  }

  // Model: M/M/1/K (Finite system capacity)
  const K = Math.max(1, Math.floor(capacity));
  const rho = lambda / mu;

  let p0: number;
  let pk: number;
  if (Math.abs(rho - 1) < 1e-6) {
    p0 = 1 / (K + 1);
    pk = 1 / (K + 1);
  } else {
    p0 = (1 - rho) / (1 - Math.pow(rho, K + 1));
    pk = p0 * Math.pow(rho, K);
  }

  const lambdaEff = lambda * (1 - pk);

  let l = 0;
  const stateProbabilities: { n: number; prob: number }[] = [];
  for (let n = 0; n <= K; n++) {
    const prob = p0 * Math.pow(rho, n);
    stateProbabilities.push({ n, prob: snapZero(prob) });
    l += n * prob;
  }

  const w = lambdaEff > 0 ? l / lambdaEff : 0;
  const wq = Math.max(0, w - 1 / mu);
  const lq = lambdaEff * wq;

  return {
    rho: snapZero(rho),
    p0: snapZero(p0),
    l: snapZero(l),
    lq: snapZero(lq),
    w: snapZero(w),
    wq: snapZero(wq),
    pk: snapZero(pk),
    lambdaEff: snapZero(lambdaEff),
    stateProbabilities,
  };
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function createUnstableQueue(rho: number): QueuingResult {
  return {
    rho: snapZero(rho),
    p0: 0,
    l: Infinity,
    lq: Infinity,
    w: Infinity,
    wq: Infinity,
    stateProbabilities: [],
  };
}

// ==========================================
// Inventory & EOQ/EPQ Solver
// ==========================================

export function solveEoq(inputs: EoqInputs): EoqResult {
  const D = Math.max(0.001, inputs.annualDemand);
  const S = Math.max(0.001, inputs.orderCost);
  const H = Math.max(0.001, inputs.holdingCost);
  const C = Math.max(0, inputs.unitCost);
  const workingDays = inputs.workingDaysPerYear || 300;
  const leadTimeDays = inputs.leadTimeDays || 0;

  const reorderPoint = (D / workingDays) * leadTimeDays;

  if (inputs.model === 'classical') {
    const Q = Math.sqrt((2 * D * S) / H);
    const ordersPerYear = D / Q;
    const cycleTimeDays = (Q / D) * workingDays;

    const annualOrderCost = (D / Q) * S;
    const annualHoldingCost = (Q / 2) * H;
    const annualPurchaseCost = D * C;
    const totalAnnualCost = annualOrderCost + annualHoldingCost + annualPurchaseCost;

    return {
      optimalQty: snapZero(Q),
      maxInventory: snapZero(Q),
      ordersPerYear: snapZero(ordersPerYear),
      cycleTimeDays: snapZero(cycleTimeDays),
      reorderPoint: snapZero(reorderPoint),
      annualPurchaseCost: snapZero(annualPurchaseCost),
      annualOrderCost: snapZero(annualOrderCost),
      annualHoldingCost: snapZero(annualHoldingCost),
      totalAnnualCost: snapZero(totalAnnualCost),
      costBreakdown: [
        { name: 'Purchase Cost', value: snapZero(annualPurchaseCost) },
        { name: 'Ordering Cost', value: snapZero(annualOrderCost) },
        { name: 'Holding Cost', value: snapZero(annualHoldingCost) },
      ],
    };
  }

  if (inputs.model === 'backorder') {
    const B = Math.max(0.001, inputs.backorderCost || H);
    // EOQ with shortages
    const Q = Math.sqrt(((2 * D * S) / H) * ((H + B) / B));
    const maxBackorder = Q * (H / (H + B));
    const maxInventory = Q - maxBackorder;

    const ordersPerYear = D / Q;
    const cycleTimeDays = (Q / D) * workingDays;

    const annualOrderCost = (D / Q) * S;
    const annualHoldingCost = (Math.pow(maxInventory, 2) / (2 * Q)) * H;
    const annualBackorderCost = (Math.pow(maxBackorder, 2) / (2 * Q)) * B;
    const annualPurchaseCost = D * C;
    const totalAnnualCost = annualOrderCost + annualHoldingCost + annualBackorderCost + annualPurchaseCost;

    return {
      optimalQty: snapZero(Q),
      maxInventory: snapZero(maxInventory),
      maxBackorder: snapZero(maxBackorder),
      ordersPerYear: snapZero(ordersPerYear),
      cycleTimeDays: snapZero(cycleTimeDays),
      reorderPoint: snapZero(reorderPoint),
      annualPurchaseCost: snapZero(annualPurchaseCost),
      annualOrderCost: snapZero(annualOrderCost),
      annualHoldingCost: snapZero(annualHoldingCost),
      annualBackorderCost: snapZero(annualBackorderCost),
      totalAnnualCost: snapZero(totalAnnualCost),
      costBreakdown: [
        { name: 'Purchase Cost', value: snapZero(annualPurchaseCost) },
        { name: 'Ordering Cost', value: snapZero(annualOrderCost) },
        { name: 'Holding Cost', value: snapZero(annualHoldingCost) },
        { name: 'Backorder Cost', value: snapZero(annualBackorderCost) },
      ],
    };
  }

  if (inputs.model === 'epq') {
    const P = Math.max(D + 0.001, inputs.productionRate || D * 2);
    const Q = Math.sqrt((2 * D * S) / (H * (1 - D / P)));
    const maxInventory = Q * (1 - D / P);

    const ordersPerYear = D / Q;
    const cycleTimeDays = (Q / D) * workingDays;

    const annualOrderCost = (D / Q) * S;
    const annualHoldingCost = (maxInventory / 2) * H;
    const annualPurchaseCost = D * C;
    const totalAnnualCost = annualOrderCost + annualHoldingCost + annualPurchaseCost;

    return {
      optimalQty: snapZero(Q),
      maxInventory: snapZero(maxInventory),
      ordersPerYear: snapZero(ordersPerYear),
      cycleTimeDays: snapZero(cycleTimeDays),
      reorderPoint: snapZero(reorderPoint),
      annualPurchaseCost: snapZero(annualPurchaseCost),
      annualOrderCost: snapZero(annualOrderCost),
      annualHoldingCost: snapZero(annualHoldingCost),
      totalAnnualCost: snapZero(totalAnnualCost),
      costBreakdown: [
        { name: 'Purchase Cost', value: snapZero(annualPurchaseCost) },
        { name: 'Setup Cost', value: snapZero(annualOrderCost) },
        { name: 'Holding Cost', value: snapZero(annualHoldingCost) },
      ],
    };
  }

  // Model: Quantity Discounts
  const tiers = inputs.discountTiers && inputs.discountTiers.length > 0
    ? [...inputs.discountTiers].sort((a, b) => a.minQty - b.minQty)
    : [
        { minQty: 0, unitPrice: C },
        { minQty: 500, unitPrice: C * 0.95 },
        { minQty: 1000, unitPrice: C * 0.9 },
      ];

  let bestQty = 0;
  let minTotalCost = Infinity;
  let bestPurchaseCost = 0;
  let bestOrderCost = 0;
  let bestHoldingCost = 0;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const nextTier = tiers[i + 1];
    const unitPrice = tier.unitPrice;
    const tierHoldingCost = H; // or H * unitPrice if percentage

    // Calculate EOQ for this tier
    const rawQ = Math.sqrt((2 * D * S) / tierHoldingCost);
    let candidateQ = rawQ;

    // Check if rawQ falls within tier
    if (rawQ < tier.minQty) {
      candidateQ = tier.minQty; // bump up to minimum quantity to get discount
    } else if (nextTier && rawQ >= nextTier.minQty) {
      continue; // handled by next tier
    }

    const orderCost = (D / candidateQ) * S;
    const holdingCost = (candidateQ / 2) * tierHoldingCost;
    const purchaseCost = D * unitPrice;
    const totalCost = orderCost + holdingCost + purchaseCost;

    if (totalCost < minTotalCost) {
      minTotalCost = totalCost;
      bestQty = candidateQ;
      bestOrderCost = orderCost;
      bestHoldingCost = holdingCost;
      bestPurchaseCost = purchaseCost;
    }
  }

  const ordersPerYear = D / bestQty;
  const cycleTimeDays = (bestQty / D) * workingDays;

  return {
    optimalQty: snapZero(bestQty),
    maxInventory: snapZero(bestQty),
    ordersPerYear: snapZero(ordersPerYear),
    cycleTimeDays: snapZero(cycleTimeDays),
    reorderPoint: snapZero(reorderPoint),
    annualPurchaseCost: snapZero(bestPurchaseCost),
    annualOrderCost: snapZero(bestOrderCost),
    annualHoldingCost: snapZero(bestHoldingCost),
    totalAnnualCost: snapZero(minTotalCost),
    costBreakdown: [
      { name: 'Purchase Cost', value: snapZero(bestPurchaseCost) },
      { name: 'Ordering Cost', value: snapZero(bestOrderCost) },
      { name: 'Holding Cost', value: snapZero(bestHoldingCost) },
    ],
  };
}
