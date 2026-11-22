/**
 * Sheeta Operations Research
 * Default Sample Problems & Industrial Performance Benchmark
 */

import {
  ActivityDef,
  AssignmentProblem,
  EoqInputs,
  LpProblem,
  QueuingInputs,
  TransportationProblem,
} from '../types';

/**
 * 2-Variable LP problem ideal for the 2D Graphical Method
 * Maximize Z = 40 x1 + 30 x2
 * Subject to:
 * 1) 2 x1 + 1 x2 <= 100 (Labor hours)
 * 2) 1 x1 + 2 x2 <= 80  (Raw material kg)
 * 3) 1 x1 + 1 x2 <= 60  (Machine capacity)
 * x1, x2 >= 0
 * Optimal: x1 = 40, x2 = 20, Z = 2200
 */
export const SAMPLE_TWO_VAR_LP: LpProblem = {
  title: 'Two-Variable Production Optimization (Graphical Demo)',
  description: 'Classic product-mix model suitable for 2D graphical visualization and corner points analysis.',
  sense: 'maximize',
  isIntegerProgram: false,
  variables: [
    { id: 'x1', name: 'Product A (x1)', type: 'continuous', objCoeff: 40, lowerBound: 0, upperBound: Infinity },
    { id: 'x2', name: 'Product B (x2)', type: 'continuous', objCoeff: 30, lowerBound: 0, upperBound: Infinity },
  ],
  constraints: [
    { id: 'c1', name: 'Assembly Labor Hours', coeffs: [2, 1], op: '<=', rhs: 100 },
    { id: 'c2', name: 'Raw Material Processing', coeffs: [1, 2], op: '<=', rhs: 80 },
    { id: 'c3', name: 'Finishing Line Capacity', coeffs: [1, 1], op: '<=', rhs: 60 },
  ],
};

/**
 * Industrial Performance Benchmark Model
 * Multi-plant production, blending, and warehouse storage with integer and binary setup variables
 */
export const INDUSTRIAL_BENCHMARK_LP: LpProblem = {
  title: 'Industrial Supply & Blending Optimization (Benchmark)',
  description: 'Multi-variable industrial problem with continuous, integer, and binary variables for performance testing.',
  sense: 'maximize',
  isIntegerProgram: true,
  variables: [
    { id: 'x1', name: 'Plant 1 Standard (x1)', type: 'integer', objCoeff: 45, lowerBound: 0, upperBound: 50 },
    { id: 'x2', name: 'Plant 1 Premium (x2)', type: 'integer', objCoeff: 60, lowerBound: 0, upperBound: 40 },
    { id: 'x3', name: 'Plant 2 Standard (x3)', type: 'integer', objCoeff: 42, lowerBound: 0, upperBound: 60 },
    { id: 'x4', name: 'Plant 2 Premium (x4)', type: 'integer', objCoeff: 58, lowerBound: 0, upperBound: 45 },
    { id: 'x5', name: 'Component Alpha (x5)', type: 'continuous', objCoeff: 15, lowerBound: 10, upperBound: 120 },
    { id: 'x6', name: 'Component Beta (x6)', type: 'continuous', objCoeff: 18, lowerBound: 5, upperBound: 100 },
    { id: 'y1', name: 'Shift 1 Setup (y1)', type: 'binary', objCoeff: -120, lowerBound: 0, upperBound: 1 },
    { id: 'y2', name: 'Shift 2 Setup (y2)', type: 'binary', objCoeff: -150, lowerBound: 0, upperBound: 1 },
  ],
  constraints: [
    { id: 'c1', name: 'Plant 1 Production Capacity', coeffs: [1.2, 1.8, 0, 0, 0.4, 0.3, -80, 0], op: '<=', rhs: 0 },
    { id: 'c2', name: 'Plant 2 Production Capacity', coeffs: [0, 0, 1.1, 1.6, 0.3, 0.5, 0, -90], op: '<=', rhs: 0 },
    { id: 'c3', name: 'Total Raw Material Reserve', coeffs: [2, 3, 2, 3, 1, 1, 0, 0], op: '<=', rhs: 350 },
    { id: 'c4', name: 'Minimum Quality Blend Grade', coeffs: [0.5, 0.8, 0.4, 0.7, -0.2, -0.1, 0, 0], op: '>=', rhs: 25 },
    { id: 'c5', name: 'Market Demand Quota for Standard', coeffs: [1, 0, 1, 0, 0, 0, 0, 0], op: '>=', rhs: 40 },
    { id: 'c6', name: 'Environmental Emission Budget', coeffs: [0.8, 1.4, 0.7, 1.3, 0.2, 0.2, 0, 0], op: '<=', rhs: 140 },
  ],
};

/**
 * Sample Transportation Problem: 3 Plants -> 4 Distribution Warehouses
 */
export const SAMPLE_TRANSPORTATION: TransportationProblem = {
  title: 'National Distribution Logistics (3 Plants -> 4 Warehouses)',
  method: 'vam',
  sources: [
    { id: 'p1', name: 'Alexandria Plant', capacity: 250 },
    { id: 'p2', name: 'Cairo Plant', capacity: 350 },
    { id: 'p3', name: 'Suez Plant', capacity: 400 },
  ],
  destinations: [
    { id: 'w1', name: 'Giza Hub', demand: 200 },
    { id: 'w2', name: 'Tanta Hub', demand: 225 },
    { id: 'w3', name: 'Mansoura Hub', demand: 275 },
    { id: 'w4', name: 'Assiut Hub', demand: 250 },
  ],
  costs: [
    [10, 12, 16, 22],
    [8, 11, 14, 18],
    [15, 14, 12, 16],
  ],
};

/**
 * Sample Hungarian Assignment Problem: 4 Engineers -> 4 Specialized Projects
 */
export const SAMPLE_ASSIGNMENT: AssignmentProblem = {
  title: 'Consulting Engineers Project Assignment',
  sense: 'minimize',
  workers: ['Engineer Ahmed', 'Engineer Sara', 'Engineer Tarek', 'Engineer Laila'],
  tasks: ['Project Alpha (Design)', 'Project Beta (Audit)', 'Project Gamma (Security)', 'Project Delta (Cloud)'],
  costs: [
    [90, 75, 75, 80],
    [35, 85, 55, 65],
    [125, 95, 90, 105],
    [45, 110, 95, 115],
  ],
};

/**
 * Sample PERT / CPM Problem: Industrial Facility Construction
 */
export const SAMPLE_PERT_CPM: ActivityDef[] = [
  { id: 'A', name: 'Site Clearing & Grading', predecessors: [], durationMode: 'three_point', duration: 4, optimistic: 2, mostLikely: 4, pessimistic: 6 },
  { id: 'B', name: 'Foundation Excavation & Pouring', predecessors: ['A'], durationMode: 'three_point', duration: 6, optimistic: 4, mostLikely: 6, pessimistic: 8 },
  { id: 'C', name: 'Structural Steel Framing', predecessors: ['B'], durationMode: 'three_point', duration: 8, optimistic: 5, mostLikely: 8, pessimistic: 11 },
  { id: 'D', name: 'Plumbing & Drainage Piping', predecessors: ['B'], durationMode: 'three_point', duration: 5, optimistic: 3, mostLikely: 5, pessimistic: 7 },
  { id: 'E', name: 'Electrical & Automation Wiring', predecessors: ['C'], durationMode: 'three_point', duration: 7, optimistic: 4, mostLikely: 7, pessimistic: 10 },
  { id: 'F', name: 'HVAC & Cleanroom Systems', predecessors: ['C', 'D'], durationMode: 'three_point', duration: 6, optimistic: 4, mostLikely: 6, pessimistic: 8 },
  { id: 'G', name: 'Interior Finishing & Flooring', predecessors: ['E', 'F'], durationMode: 'three_point', duration: 4, optimistic: 2, mostLikely: 4, pessimistic: 6 },
  { id: 'H', name: 'Final Inspection & Commissioning', predecessors: ['G'], durationMode: 'three_point', duration: 3, optimistic: 1, mostLikely: 3, pessimistic: 5 },
];

/**
 * Sample Queuing Inputs
 */
export const SAMPLE_QUEUING: QueuingInputs = {
  model: 'mmc',
  arrivalRate: 18, // 18 customers/hour
  serviceRate: 8,  // 8 customers/hour per server
  servers: 3,      // 3 servers => capacity 24 > 18
  capacity: 20,
};

/**
 * Sample EOQ Inputs
 */
export const SAMPLE_EOQ: EoqInputs = {
  model: 'classical',
  annualDemand: 12000,
  orderCost: 150,
  holdingCost: 4.5,
  unitCost: 25,
  backorderCost: 10,
  productionRate: 30000,
  leadTimeDays: 7,
  workingDaysPerYear: 300,
  discountTiers: [
    { minQty: 0, unitPrice: 25 },
    { minQty: 800, unitPrice: 23.5 },
    { minQty: 1500, unitPrice: 22.0 },
  ],
};
