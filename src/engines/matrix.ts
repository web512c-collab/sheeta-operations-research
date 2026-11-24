/**
 * Sheeta Operations Research
 * Numerical Constants, Sparse CSR Matrix & Matrix Utilities
 */

export const EPS = 1e-7;
export const PIVOT_EPS = 1e-9;
export const ZERO_TOLERANCE = 1e-9;
export const SPARSITY_DENSITY_THRESHOLD = 0.45;

/**
 * Snaps values within tolerance to 0.0 to prevent floating-point drift
 */
export function snapZero(val: number, tol: number = ZERO_TOLERANCE): number {
  if (Math.abs(val) < tol) {
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

/**
 * Compressed Sparse Row (CSR) Matrix backed by typed arrays for memory-efficient
 * scanning and sparse linear algebra operations.
 */
export class CsrMatrix {
  public readonly numRows: number;
  public readonly numCols: number;
  public readonly rowPtr: Int32Array;
  public readonly colIdx: Int32Array;
  public readonly values: Float64Array;
  public readonly nnz: number;
  public readonly density: number;

  constructor(
    numRows: number,
    numCols: number,
    rowPtr: Int32Array,
    colIdx: Int32Array,
    values: Float64Array
  ) {
    this.numRows = numRows;
    this.numCols = numCols;
    this.rowPtr = rowPtr;
    this.colIdx = colIdx;
    this.values = values;
    this.nnz = values.length;
    const total = numRows * numCols;
    this.density = total > 0 ? this.nnz / total : 0;
  }

  public static fromDense(dense: number[][], tol: number = ZERO_TOLERANCE): CsrMatrix {
    const numRows = dense.length;
    const numCols = dense[0]?.length || 0;
    const rowPtr = new Int32Array(numRows + 1);
    const cols: number[] = [];
    const vals: number[] = [];

    for (let r = 0; r < numRows; r++) {
      rowPtr[r] = vals.length;
      const row = dense[r];
      for (let c = 0; c < numCols; c++) {
        const v = row[c] ?? 0;
        if (Math.abs(v) > tol) {
          cols.push(c);
          vals.push(v);
        }
      }
    }
    rowPtr[numRows] = vals.length;

    return new CsrMatrix(
      numRows,
      numCols,
      rowPtr,
      Int32Array.from(cols),
      Float64Array.from(vals)
    );
  }

  public static fromConstraints(
    constraints: { coeffs: number[] }[],
    numCols: number,
    tol: number = ZERO_TOLERANCE
  ): CsrMatrix {
    const numRows = constraints.length;
    const rowPtr = new Int32Array(numRows + 1);
    const cols: number[] = [];
    const vals: number[] = [];

    for (let r = 0; r < numRows; r++) {
      rowPtr[r] = vals.length;
      const coeffs = constraints[r].coeffs;
      for (let c = 0; c < numCols; c++) {
        const v = coeffs[c] ?? 0;
        if (Math.abs(v) > tol) {
          cols.push(c);
          vals.push(v);
        }
      }
    }
    rowPtr[numRows] = vals.length;

    return new CsrMatrix(
      numRows,
      numCols,
      rowPtr,
      Int32Array.from(cols),
      Float64Array.from(vals)
    );
  }

  public rowNnz(r: number): number {
    return this.rowPtr[r + 1] - this.rowPtr[r];
  }

  public get(r: number, c: number): number {
    const start = this.rowPtr[r];
    const end = this.rowPtr[r + 1];
    // Binary search inside sorted column indices of row r
    let lo = start;
    let hi = end - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const midCol = this.colIdx[mid];
      if (midCol === c) return this.values[mid];
      if (midCol < c) lo = mid + 1;
      else hi = mid - 1;
    }
    return 0;
  }

  public forEachInRow(r: number, cb: (col: number, val: number) => void): void {
    const start = this.rowPtr[r];
    const end = this.rowPtr[r + 1];
    for (let idx = start; idx < end; idx++) {
      cb(this.colIdx[idx], this.values[idx]);
    }
  }

  public rowDot(r: number, vec: ArrayLike<number>): number {
    const start = this.rowPtr[r];
    const end = this.rowPtr[r + 1];
    let sum = 0;
    for (let idx = start; idx < end; idx++) {
      sum += this.values[idx] * (vec[this.colIdx[idx]] ?? 0);
    }
    return sum;
  }

  public colCounts(): Int32Array {
    const counts = new Int32Array(this.numCols);
    for (let idx = 0; idx < this.nnz; idx++) {
      counts[this.colIdx[idx]]++;
    }
    return counts;
  }

  public toDense(): number[][] {
    const dense: number[][] = Array.from({ length: this.numRows }, () =>
      new Array<number>(this.numCols).fill(0)
    );
    for (let r = 0; r < this.numRows; r++) {
      const start = this.rowPtr[r];
      const end = this.rowPtr[r + 1];
      for (let idx = start; idx < end; idx++) {
        dense[r][this.colIdx[idx]] = this.values[idx];
      }
    }
    return dense;
  }

  public transpose(): CsrMatrix {
    const colCounts = this.colCounts();
    const tRowPtr = new Int32Array(this.numCols + 1);
    for (let c = 0; c < this.numCols; c++) {
      tRowPtr[c + 1] = tRowPtr[c] + colCounts[c];
    }

    const cursor = tRowPtr.slice();
    const tColIdx = new Int32Array(this.nnz);
    const tValues = new Float64Array(this.nnz);

    for (let r = 0; r < this.numRows; r++) {
      const start = this.rowPtr[r];
      const end = this.rowPtr[r + 1];
      for (let idx = start; idx < end; idx++) {
        const c = this.colIdx[idx];
        const dest = cursor[c]++;
        tColIdx[dest] = r;
        tValues[dest] = this.values[idx];
      }
    }

    return new CsrMatrix(this.numCols, this.numRows, tRowPtr, tColIdx, tValues);
  }
}
