import type { RefApi } from './refs.js';
import type { StyleRef } from './style.js';

/**
 * Declarative descriptors for the template DSL. A sheet is a stack of
 * `Region`s; each region lowers to concrete cells during rendering. Formulas
 * are authored as callbacks receiving a {@link RefApi}, so cell references are
 * resolved by logical name rather than hand-built A1 strings.
 */

/** One styled run of a rich-text cell value. */
export interface RichRun {
  text: string;
  /** Render this run bold (used to bold only the selected 세부전공 token). */
  bold?: boolean;
}

/**
 * A rich-text cell value: an ordered list of runs concatenated in the cell,
 * each with its own font styling. Use this to bold only PART of a cell's text
 * (the whole cell keeps its named `style` for fill/border/base font).
 */
export type RichText = RichRun[];

/** A literal value, or `undefined` to leave the cell blank. */
export type CellValue = string | number | RichText | undefined;

/** One placed cell. */
export interface CellSpec {
  /** Logical name; lets other formulas reference this cell via `ref(name)`. */
  name?: string;
  /** Literal value. Ignored when `formula` is present. */
  value?: CellValue;
  /** In-cell formula body (without leading `=`), built from named refs. */
  formula?: (r: RefApi) => string;
  /** Named style preset(s). */
  style?: StyleRef;
  /** Number format, e.g. "0.00". */
  numFmt?: string;
  /** Dropdown list applied to this cell. */
  dropdown?: string[];
  /**
   * Dropdown backed by a range/name instead of an inline literal list. The value
   * is a data-validation `formulae[0]` (e.g. a defined name like
   * "MicroDegreeNameList" or an A1 range). Use this when the option set is too
   * large for the ~255-char inline `"a,b,c"` list limit. Takes precedence over
   * `dropdown` when both are set.
   */
  dropdownFormula?: string;
  /** Row height in points, applied to this cell's row. */
  height?: number;
  /**
   * Cell protection lock state. Only takes effect when the sheet is protected
   * (see `SheetSpec.protect`). `true` = read-only, `false` = editable. When
   * omitted the app default (locked) applies.
   */
  locked?: boolean;
}

/** A table column. */
export interface ColumnSpec<Row> {
  /** Header text. */
  header: string;
  /** Column width in characters. */
  width: number;
  /** Style for data cells in this column. */
  style: StyleRef;
  /** Number format for data cells. */
  numFmt?: string;
  /** Dropdown applied to every data cell. */
  dropdown?: string[];
  /** Range/name-backed dropdown for every data cell (see `CellSpec.dropdownFormula`). */
  dropdownFormula?: string;
  /** Cell protection lock state for data cells (see `CellSpec.locked`). */
  locked?: boolean;
  /**
   * Logical name for this column's data span; enables `refColumn(name)` from
   * totals/summary formulas.
   */
  name?: string;
  /** Literal value writer per row. Return `undefined` to leave blank. */
  value?: (row: Row) => CellValue;
  /** Per-row formula writer. Receives the row and the bound {@link RefApi}. */
  formula?: (row: Row, r: RefApi, cell: ColumnRefs) => string;
}

/** Same-row column references available inside a column's `formula`. */
export interface ColumnRefs {
  /** Absolute A1 of another column's cell on the same data row (same table). */
  col(name: string): string;
  /**
   * A1 of ANY workbook-bound column's cell on this same data-row index, even a
   * column that lives in a different table/region. Enables a helper table to
   * reference a sibling table that is laid out row-for-row alongside it.
   */
  rowCell(name: string): string;
}

/** Region: a single styled title cell occupying one row. */
export interface TitleRegion {
  kind: 'title';
  text: string;
  /** Row height in points. */
  height?: number;
  style?: StyleRef;
  /** Blank rows inserted before the title. */
  leading?: number;
  /** Pin the title to an explicit 1-based row instead of the cursor. */
  at?: number;
  /** Merge the title cell across this many columns (default 1, no merge). */
  span?: number;
}

/** Region: a block of prose lines, one per row in column 1. */
export interface TextRegion {
  kind: 'text';
  lines: string[];
  /** Blank rows inserted before the first line. */
  leading?: number;
}

/**
 * Region: free-form labeled rows. Each inner array is one row of cells placed
 * left-to-right from `startCol`; rows stack downward. Use for key/value style
 * summaries (the dashboard).
 */
export interface BlockRegion {
  kind: 'block';
  /** 1-based starting column (default 1). */
  startCol?: number;
  rows: CellSpec[][];
  /** Blank rows inserted before this block. */
  leading?: number;
  /**
   * Pin the block to an explicit 1-based start row instead of the running
   * cursor. Lets two regions share rows side-by-side (different columns).
   */
  at?: number;
  /**
   * Cells to merge within this block, addressed by 0-based `[row, col]` indices
   * relative to the block's own grid (row 0 = first `rows` entry, col 0 =
   * `startCol`). The top-left cell keeps its value/style; the span covers the
   * given width/height in cells. Blank placeholder cells under the span may be
   * omitted from `rows` only if trailing.
   */
  merges?: BlockMerge[];
}

/** A merge rectangle within a {@link BlockRegion}, in block-relative indices. */
export interface BlockMerge {
  /** 0-based row index (within the block) of the top-left cell. */
  row: number;
  /** 0-based column index (within the block) of the top-left cell. */
  col: number;
  /** Number of columns to span (>= 1). */
  colSpan?: number;
  /** Number of rows to span (>= 1). */
  rowSpan?: number;
}

/**
 * Region: a header row + data rows + an optional totals row. Columns are
 * declared once; data rows are produced from `rows`.
 */
export interface TableRegion<Row> {
  kind: 'table';
  /** 1-based starting column (default 1). */
  startCol?: number;
  columns: ColumnSpec<Row>[];
  rows: Row[];
  /**
   * Logical name bound to the full data area (all columns x data rows). Used to
   * register a multi-column defined name such as a lookup table.
   */
  dataName?: string;
  /**
   * Reserve this many data rows for `refColumn`/`dataName` aggregation ranges
   * even though only `rows.length` rows are actually rendered/styled. Lets the
   * user drag the last rendered row down (up to the reserved count) and still
   * have summary formulas include the new rows. Must be >= rows.length.
   */
  reservedRows?: number;
  /**
   * Optional totals row written directly under the last data row. Entries are
   * positional (index 0 = first table column); use `null` to skip a column.
   */
  totals?: (CellSpec | null)[];
  /** Blank rows inserted before the header. */
  leading?: number;
  /** Pin the header to an explicit 1-based start row instead of the cursor. */
  at?: number;
}

export type Region =
  | TitleRegion
  | TextRegion
  | BlockRegion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous row types across regions
  | TableRegion<any>;

/** Convenience constructors so sheet definitions read declaratively. */
export const title = (
  text: string,
  opts: Omit<TitleRegion, 'kind' | 'text'> = {},
): TitleRegion => ({ kind: 'title', text, ...opts });

export const text = (
  lines: string[],
  opts: Omit<TextRegion, 'kind' | 'lines'> = {},
): TextRegion => ({ kind: 'text', lines, ...opts });

export const block = (
  rows: CellSpec[][],
  opts: Omit<BlockRegion, 'kind' | 'rows'> = {},
): BlockRegion => ({ kind: 'block', rows, ...opts });

export const table = <Row>(
  spec: Omit<TableRegion<Row>, 'kind'>,
): TableRegion<Row> => ({
  kind: 'table',
  ...spec,
});
