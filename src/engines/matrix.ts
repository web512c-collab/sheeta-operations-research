/**
 * Sheeta Operations Research
 * Numerical Constants & Matrix Utilities
 */

export const EPS = 1e-7;
export const PIVOT_EPS = 1e-9;
export const ZERO_TOLERANCE = 1e-9;

/**
 * Snaps values within ZERO_TOLERANCE to 0.0 to prevent floating-point drift
 */
export function snapZero(val: number): number {
  if (Math.abs(val) < ZERO_TOLERANCE) {
    return 0;
  }
  return val;
}

/**
 * Checks if two numbers are approximately equal within epsilon
 */
export function approxEqual(a: number, b: number, eps: number = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Checks if a number is an integer within tolerance
 */
export function isInteger(val: number, eps: number = 1e-5): boolean {
  return Math.abs(val - Math.round(val)) < eps;
}

/**
 * Sparse Vector representation: Map of column index -> value
 */
export type SparseVector = Map<number, number>;

export class SparseMatrix {
  public rows: SparseVector[];
  public numRows: number;
  public numCols: number;

  constructor(numRows: number, numCols: number) {
    this.numRows = numRows;
    this.numCols = numCols;
    this.rows = Array.from({ length: numRows }, () => new Map<number, number>());
  }

  public set(r: number, c: number, val: number): void {
    if (Math.abs(val) > ZERO_TOLERANCE) {
      this.rows[r].set(c, val);
    } else {
      this.rows[r].delete(c);
    }
  }

  public get(r: number, c: number): number {
    return this.rows[r].get(c) || 0;
  }

  public static fromDense(dense: number[][]): SparseMatrix {
    const numRows = dense.length;
    const numCols = dense[0]?.length || 0;
    const sm = new SparseMatrix(numRows, numCols);
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const val = dense[r][c];
        if (Math.abs(val) > ZERO_TOLERANCE) {
          sm.set(r, c, val);
        }
      }
    }
    return sm;
  }

  public toDense(): number[][] {
    const dense: number[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = new Array<number>(this.numCols).fill(0);
      for (const [col, val] of this.rows[r].entries()) {
        row[col] = val;
      }
      dense.push(row);
    }
    return dense;
  }
}
