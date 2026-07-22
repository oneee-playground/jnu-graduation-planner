/**
 * Coordinate helpers and the name->location resolver that lets formulas
 * reference cells by logical name instead of fragile hand-built A1 strings.
 */

/** Column letter for a 1-based column index, e.g. 1 -> "A", 28 -> "AB". */
export function colLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Absolute A1 reference for a single cell, e.g. (3, 2) -> "$B$3". */
export function abs(row: number, col: number): string {
  return `$${colLetter(col)}$${row}`;
}

/** Absolute A1 range, e.g. "$A$2:$A$10". */
export function absRange(
  row1: number,
  col1: number,
  row2: number,
  col2: number,
): string {
  return `${abs(row1, col1)}:${abs(row2, col2)}`;
}

/** Wraps a sheet name for use in a formula, escaping single quotes. */
export function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/** A single resolved cell location. */
export interface CellLocation {
  sheet: string;
  row: number;
  col: number;
}

/** A resolved span covering a tagged table column's data rows. */
export interface ColumnSpan {
  sheet: string;
  col: number;
  firstRow: number;
  lastRow: number;
}

/** A resolved rectangular range, e.g. a whole table's data area. */
export interface RangeSpan {
  sheet: string;
  firstRow: number;
  firstCol: number;
  lastRow: number;
  lastCol: number;
}

/**
 * Read-only API handed to formula callbacks. References resolve to absolute A1,
 * sheet-qualified automatically when the target lives on a different sheet than
 * the formula being written.
 */
export interface RefApi {
  /** Absolute A1 of a named cell (sheet-qualified across sheets). */
  ref(name: string): string;
  /** Absolute A1 range of a named table column's data span. */
  refColumn(name: string): string;
  /**
   * A range over a named column starting at `fromA1` (a same-row A1 like "C10")
   * down to the column's last (reserved) row, e.g. "C10:$C$309". Used for
   * "from this row downward" tests such as last-occurrence detection.
   */
  refColumnDownFrom(name: string, fromA1: string): string;
  /** Maps each named cell through `fn` and joins with `sep` (default "+"). */
  refMany(names: string[], fn?: (a1: string) => string, sep?: string): string;
}

/**
 * Accumulates name -> location bindings during the layout pass, then produces a
 * {@link RefApi} bound to a specific "current" sheet for the write pass.
 */
export class RefResolver {
  private readonly cells = new Map<string, CellLocation>();
  private readonly columns = new Map<string, ColumnSpan>();
  private readonly ranges = new Map<string, RangeSpan>();

  bindCell(name: string, loc: CellLocation): void {
    if (this.cells.has(name)) {
      throw new Error(`Duplicate cell name: ${name}`);
    }
    this.cells.set(name, loc);
  }

  bindColumn(name: string, span: ColumnSpan): void {
    if (this.columns.has(name)) {
      throw new Error(`Duplicate column name: ${name}`);
    }
    this.columns.set(name, span);
  }

  bindRange(name: string, span: RangeSpan): void {
    if (this.ranges.has(name)) {
      throw new Error(`Duplicate range name: ${name}`);
    }
    this.ranges.set(name, span);
  }

  /** Sheet-qualified absolute A1 of a named cell (always qualified). */
  qualifiedCell(name: string): string {
    const loc = this.cells.get(name);
    if (!loc) throw new Error(`Unknown cell name: ${name}`);
    return `${quoteSheet(loc.sheet)}!${abs(loc.row, loc.col)}`;
  }

  /** 1-based column index of a bound column (throws if unknown). */
  columnIndex(name: string): number {
    const span = this.columns.get(name);
    if (!span) throw new Error(`Unknown column name: ${name}`);
    return span.col;
  }

  /** Sheet-qualified absolute A1 range of a named column's data span. */
  qualifiedColumn(name: string): string {
    const span = this.columns.get(name);
    if (!span) throw new Error(`Unknown column name: ${name}`);
    return `${quoteSheet(span.sheet)}!${absRange(span.firstRow, span.col, span.lastRow, span.col)}`;
  }

  /** Sheet-qualified absolute A1 of a named rectangular range. */
  qualifiedRange(name: string): string {
    const span = this.ranges.get(name);
    if (!span) throw new Error(`Unknown range name: ${name}`);
    return `${quoteSheet(span.sheet)}!${absRange(span.firstRow, span.firstCol, span.lastRow, span.lastCol)}`;
  }

  /** Builds a {@link RefApi} whose references are relative to `currentSheet`. */
  forSheet(currentSheet: string): RefApi {
    const cellA1 = (name: string): string => {
      const loc = this.cells.get(name);
      if (!loc) throw new Error(`Unknown cell name: ${name}`);
      const a1 = abs(loc.row, loc.col);
      return loc.sheet === currentSheet ? a1 : `${quoteSheet(loc.sheet)}!${a1}`;
    };
    const columnA1 = (name: string): string => {
      const span = this.columns.get(name);
      if (!span) throw new Error(`Unknown column name: ${name}`);
      const range = absRange(span.firstRow, span.col, span.lastRow, span.col);
      return span.sheet === currentSheet
        ? range
        : `${quoteSheet(span.sheet)}!${range}`;
    };
    const columnDownFrom = (name: string, fromA1: string): string => {
      const span = this.columns.get(name);
      if (!span) throw new Error(`Unknown column name: ${name}`);
      const end = abs(span.lastRow, span.col);
      const range = `${fromA1}:${end}`;
      return span.sheet === currentSheet
        ? range
        : `${quoteSheet(span.sheet)}!${range}`;
    };
    return {
      ref: cellA1,
      refColumn: columnA1,
      refColumnDownFrom: columnDownFrom,
      refMany: (names, fn = (a) => a, sep = '+') =>
        names.map((n) => fn(cellA1(n))).join(sep),
    };
  }
}
