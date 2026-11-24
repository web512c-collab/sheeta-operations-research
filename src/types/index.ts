/**
 * Sheeta Operations Research
 * Core Type Definitions
 */

export type Language = 'ar' | 'en';

export type ORModuleType =
  | 'lp'
  | 'transportation'
  | 'pert'
  | 'queuing_eoq'
  | 'simulation';

export type RunStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'warning'
  | 'error';

// ==========================================
// Linear & Integer Programming Types
// ==========================================

export type ObjectiveSense = 'maximize' | 'minimize';
export type ConstraintOp = '<=' | '>=' | '=';
export type VariableType = 'continuous' | 'integer' | 'binary';
export type BranchingStrategy = 'most_fractional' | 'first_fractional';

export interface SolverSettings {
  presolveEnabled: boolean;
  sparseEnabled: boolean;
  webWorkerEnabled: boolean;
  branchingStrategy: BranchingStrategy;
  maxNodes: number;
  maxDepth: number;
  timeoutSeconds: number;
  eps: number;
  pivotEps: number;
}

export interface VariableDef {
  id: string;
  name: string;
  type: VariableType;
  objCoeff: number;
  lowerBound: number; // default 0
  upperBound: number; // default Infinity, or 1 for binary
}

export interface ConstraintDef {
  id: string;
  name: string;
  coeffs: number[]; // length matches variables length
  op: ConstraintOp;
  rhs: number;
}

export interface LpProblem {
  title: string;
  description?: string;
  sense: ObjectiveSense;
  isIntegerProgram: boolean; // toggle for Integer/Binary programming
  variables: VariableDef[];
  constraints: ConstraintDef[];
}

export type SimplexStatus =
  | 'optimal'
  | 'infeasible'
  | 'unbounded'
  | 'iteration_limit'
  | 'cancelled';

export interface ConstraintSensitivity {
  id: string;
  name: string;
  op: ConstraintOp;
  rhs: number;
  lhs: number;
  slackOrSurplus: number;
  kind: 'slack' | 'surplus' | 'equality';
  dualValue: number;
}

export interface SimplexSolution {
  status: SimplexStatus;
  objectiveValue: number;
  variableValues: number[]; // values of original variables
  slackValues: number[];
  dualValues?: number[];
  constraintDetails?: ConstraintSensitivity[];
  boundDuals?: { varIndex: number; kind: 'lb' | 'ub'; dualValue: number }[];
  matrixModeUsed?: 'dense' | 'sparse';
  iterations: number;
  executionTimeMs: number;
  errorMessage?: string;
}

export interface PresolveStats {
  originalVars: number;
  reducedVars: number;
  originalConstraints: number;
  reducedConstraints: number;
  eliminatedEmptyRows: number;
  eliminatedEmptyCols: number;
  fixedVariablesCount: number;
  tightenedBoundsCount: number;
  executionTimeMs: number;
}

export interface SingletonBoundSource {
  varIndex: number;
  bound: 'lb' | 'ub' | 'fixed';
  origConstraintIndex: number;
  coeff: number;
  effectiveBound: number;
}

export interface PresolveResult {
  problem: LpProblem;
  stats: PresolveStats;
  originalVarsCount: number;
  activeVarIndices: number[];
  activeConstraintIndices: number[];
  singletonBoundSources?: SingletonBoundSource[];
  fixedVarEntries: [number, number][]; // [varIndex, fixedValue][]
  fixedVarValues?: Map<number, number>; // varIndex -> fixed value
  reconstructSolution?: (reducedVarValues: number[]) => number[];
  isInfeasible: boolean;
  infeasibilityReason?: string;
  report: string[];
}

export type BranchAndBoundStatus =
  | 'optimal'
  | 'feasible_not_proven'
  | 'depth_limit_reached'
  | 'node_limit_reached'
  | 'time_limit_reached'
  | 'cancelled'
  | 'infeasible'
  | 'unbounded';

export type BranchAndBoundWarningCode =
  | 'cancelled'
  | 'time_limit_reached'
  | 'node_limit_reached'
  | 'depth_limit_reached'
  | 'feasible_not_proven'
  | 'infeasible'
  | 'unbounded';

export interface SolverLimitsUsed {
  maxNodes: number;
  maxDepth: number;
  timeoutMs: number;
  branchingStrategy: BranchingStrategy;
  sparseEnabled: boolean;
  eps: number;
  pivotEps: number;
}

export interface BranchAndBoundStats {
  exploredNodes: number;
  prunedByBound: number;
  prunedInfeasible: number;
  integerSolutionsFound: number;
  maxDepthReached: number;
  executionTimeMs: number;
  integralityGapPercent: number;
  accelerationsApplied: number;
  depthLimitHitCount?: number;
  openNodesRemaining?: number;
}

export interface BranchAndBoundProgress {
  exploredNodes: number;
  maxNodes: number;
  bestObjectiveValue?: number;
  bestIntegerSolution?: number[];
  bestBound?: number;
  openNodesRemaining: number;
}

export interface BranchAndBoundResult {
  status: BranchAndBoundStatus;
  bestIntegerSolution?: number[];
  bestObjectiveValue?: number;
  bestBound?: number;
  lpRelaxation: SimplexSolution;
  stats: BranchAndBoundStats;
  limitsUsed?: SolverLimitsUsed;
  matrixModeUsed?: 'dense' | 'sparse';
  warning?: string;
  warningCode?: BranchAndBoundWarningCode;
  nodeHistory?: {
    nodeId: number;
    depth: number;
    bound: number;
    integerCandidate: boolean;
    prunedReason?: string;
  }[];
}

// ==========================================
// Transportation & Assignment Types
// ==========================================

export interface TransportationProblem {
  title: string;
  sources: { id: string; name: string; capacity: number }[];
  destinations: { id: string; name: string; demand: number }[];
  costs: number[][]; // [sourceIdx][destIdx]
  method: 'vam' | 'northwest' | 'least_cost';
}

export interface TransportationResult {
  allocations: number[][];
  unitCosts: number[][];
  totalCost: number;
  isBalanced: boolean;
  dummyAdded: 'source' | 'destination' | 'none';
  stepsExplanation: string[];
  executionTimeMs: number;
}

export interface AssignmentProblem {
  title: string;
  workers: string[];
  tasks: string[];
  costs: number[][]; // [workerIdx][taskIdx]
  sense: 'minimize' | 'maximize';
}

export interface AssignmentResult {
  assignments: { workerIdx: number; workerName: string; taskIdx: number; taskName: string; cost: number }[];
  totalCost: number;
  costMatrix: number[][];
  executionTimeMs: number;
}

// ==========================================
// PERT / CPM Types
// ==========================================

export type PertValidationErrorCode =
  | 'EMPTY_NETWORK'
  | 'EMPTY_ID'
  | 'DUPLICATE_ID'
  | 'SELF_DEPENDENCY'
  | 'UNKNOWN_PREDECESSOR'
  | 'INVALID_DURATION'
  | 'INVALID_THREE_POINT'
  | 'CYCLE_DETECTED';

export interface ActivityDef {
  id: string;
  name: string;
  predecessors: string[]; // activity IDs
  durationMode: 'single' | 'three_point';
  duration: number; // for single
  optimistic?: number; // a
  mostLikely?: number; // m
  pessimistic?: number; // b
}

export interface ActivityResult extends ActivityDef {
  expectedDuration: number;
  variance: number;
  stdDev: number;
  es: number; // Early Start
  ef: number; // Early Finish
  ls: number; // Late Start
  lf: number; // Late Finish
  slack: number; // Total Float = LS - ES
  freeFloat: number;
  isCritical: boolean;
}

export interface PertCpmResult {
  activities: ActivityResult[];
  criticalPath: string[]; // Primary Critical Path Activity IDs
  criticalPaths: string[][]; // All distinct Critical Paths (capped at maxCriticalPaths)
  pathsCapped?: boolean;
  maxCriticalPaths?: number;
  totalDuration: number;
  projectVariance: number;
  projectStdDev: number;
  probabilityForTargetTime?: (targetTime: number) => number;
}

// ==========================================
// Queuing Theory & EOQ Types
// ==========================================

export type QueuingModelType = 'mm1' | 'mmc' | 'mm1k';

export interface QueuingInputs {
  model: QueuingModelType;
  arrivalRate: number; // lambda
  serviceRate: number; // mu
  servers: number; // c (for M/M/c)
  capacity: number; // K (for M/M/1/K)
}

export interface QueuingResult {
  rho: number; // utilization
  p0: number; // prob of 0 in system
  lq: number; // avg queue length
  l: number;  // avg number in system
  wq: number; // avg queue wait time
  w: number;  // avg time in system
  pk?: number; // blocking probability (M/M/1/K)
  lambdaEff?: number; // effective arrival rate
  stateProbabilities: { n: number; prob: number }[];
}

export type EoqModelType = 'classical' | 'backorder' | 'epq' | 'discounts';

export interface DiscountTier {
  minQty: number;
  unitPrice: number;
}

export interface EoqInputs {
  model: EoqModelType;
  annualDemand: number; // D
  orderCost: number; // S
  holdingCost: number; // H (annual holding cost per unit)
  unitCost: number; // C
  backorderCost?: number; // B (for planned shortage)
  productionRate?: number; // P (annual production rate for EPQ)
  leadTimeDays?: number;
  workingDaysPerYear?: number; // default 300
  discountTiers?: DiscountTier[];
}

export interface EoqResult {
  optimalQty: number;
  maxInventory: number;
  maxBackorder?: number;
  ordersPerYear: number;
  cycleTimeDays: number;
  reorderPoint?: number;
  annualPurchaseCost: number;
  annualOrderCost: number;
  annualHoldingCost: number;
  annualBackorderCost?: number;
  totalAnnualCost: number;
  costBreakdown: { name: string; value: number }[];
}

// ==========================================
// Simulation & Scenarios Types
// ==========================================

export type SimulationType = 'monte_carlo' | 'parameter_sweep';
export type DistributionType = 'normal' | 'uniform' | 'triangular';

export interface StochasticParam {
  id: string;
  targetModule: ORModuleType;
  paramKey: string; // e.g. "rhs_0" or "obj_1" or "demand"
  label: string;
  distribution: DistributionType;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  mode: number;
  // For parameter sweep
  sweepStart?: number;
  sweepEnd?: number;
  sweepSteps?: number;
}

export interface ScenarioRun {
  id: number;
  title: string;
  paramValues: Record<string, number>;
  objectiveValue: number;
  isFeasible: boolean;
  status: string;
  summary: string;
  problemSnapshot: any;
}

export interface SimulationSummary {
  type: SimulationType;
  totalScenarios: number;
  feasibleCount: number;
  infeasibleCount: number;
  bestValue: number;
  worstValue: number;
  meanValue: number;
  medianValue: number;
  stdDevValue: number;
  distributionBins: { binStart: number; binEnd: number; count: number }[];
  scenarios: ScenarioRun[];
  cancelled?: boolean;
  workerPoolSize?: number;
  limitsUsed?: Partial<SolverSettings>;
}

// ==========================================
// Storage & Workspace Types
// ==========================================

export interface SavedProblem {
  id: string;
  title: string;
  module: ORModuleType;
  description: string;
  createdAt: string;
  updatedAt: string;
  data: LpProblem | TransportationProblem | AssignmentProblem | ActivityDef[] | QueuingInputs | EoqInputs | any;
  lastResults?: any;
}

export interface AppSettings extends SolverSettings {
  autoCopyReport: boolean;
  theme: 'light' | 'dark';
}
