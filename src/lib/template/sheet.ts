import type { Style, Workbook, Worksheet } from 'exceljs';
import {
  type BlockRegion,
  type CellSpec,
  type CellValue,
  type Region,
  type RichText,
  type TableRegion,
  type TextRegion,
  type TitleRegion,
} from './cells.js';
import { RefResolver, abs, absRange, colLetter } from './refs.js';
import { resolveStyle } from './style.js';

/**
 * Two-pass spreadsheet renderer. Sheets are declared with {@link defineSheet};
 * {@link renderWorkbook} lays out every region (binding logical cell/column
 * names across all sheets) before writing, so formulas can reference cells by
 * name regardless of declaration order or which sheet they live on.
 */

/** A declared workbook-level defined name (named range). */
export interface DefinedNameSpec {
  /** The defined name, e.g. "GradeTable". */
  name: string;
  /** Logical name to bind. */
  target: string;
  /** What kind of binding `target` refers to (default "cell"). */
  targetKind?: 'cell' | 'column' | 'range';
}

/** One column-width override (1-based index). */
export interface ColumnWidth {
  index: number;
  width: number;
  /** Hide the column (used for helper/lookup columns). */
  hidden?: boolean;
}

/** Options for protecting a sheet (read-only for locked cells). */
export interface SheetProtection {
  /**
   * Password. Empty string = protection with no password (prevents accidental
   * edits; anyone can unprotect via the app menu). This is not real security.
   */
  password?: string;
  /** Overrides for the ExcelJS protection option flags. */
  options?: Record<string, boolean>;
}

export interface SheetSpec {
  name: string;
  hidden?: boolean;
  /** Explicit column widths (table columns set their own width separately). */
  columns?: ColumnWidth[];
  regions: Region[];
  definedNames?: DefinedNameSpec[];
  /**
   * When set, the sheet is protected after render. Cells with `locked: false`
   * stay editable; all others are read-only. Requires an `await` render.
   */
  protect?: SheetProtection;
}

export function defineSheet(spec: SheetSpec): SheetSpec {
  return spec;
}

/** True when a cell value is our rich-text run list. */
function isRichText(value: CellValue): value is RichText {
  return Array.isArray(value);
}

/**
 * Lowers a template {@link CellValue} to an ExcelJS cell value. Rich text
 * becomes an ExcelJS `{ richText }` object so only the flagged runs render bold
 * while the rest inherit the cell's base font; plain values pass through.
 */
function toCellValue(value: string | number | RichText) {
  if (isRichText(value)) {
    return {
      richText: value.map((run) => ({
        text: run.text,
        font: run.bold ? { bold: true } : {},
      })),
    };
  }
  return value;
}

/** Internal: a fully positioned cell ready to write. */
interface PlacedCell {
  row: number;
  col: number;
  spec: CellSpec;
  /** Number of columns this cell spans (merge). Default 1. */
  colSpan?: number;
  /** Number of rows this cell spans (merge). Default 1. */
  rowSpan?: number;
}

/** Internal: per-sheet layout output from pass 1. */
interface SheetLayout {
  spec: SheetSpec;
  placed: PlacedCell[];
  /** Per-cell column-ref tables (for table data cells with sibling refs). */
  rowColMaps: WeakMap<CellSpec, Map<string, string>>;
}

/**
 * Lays out a single sheet's regions into placed cells, binding any logical
 * names into the shared resolver. Returns the layout for the write pass.
 */
function layoutSheet(spec: SheetSpec, resolver: RefResolver): SheetLayout {
  const placed: PlacedCell[] = [];
  const rowColMaps = new WeakMap<CellSpec, Map<string, string>>();
  let cursor = 1; // next free row

  const place = (
    row: number,
    col: number,
    cell: CellSpec,
    span?: { colSpan?: number; rowSpan?: number },
  ): void => {
    if (cell.name) resolver.bindCell(cell.name, { sheet: spec.name, row, col });
    placed.push({ row, col, spec: cell, ...span });
  };

  for (const region of spec.regions) {
    switch (region.kind) {
      case 'title':
        cursor = layoutTitle(region, cursor, place);
        break;
      case 'text':
        cursor = layoutText(region, cursor, place);
        break;
      case 'block':
        cursor = layoutBlock(region, cursor, place);
        break;
      case 'table':
        cursor = layoutTable(region, cursor, spec, resolver, place, rowColMaps);
        break;
    }
  }

  return { spec, placed, rowColMaps };
}

type Place = (
  row: number,
  col: number,
  cell: CellSpec,
  span?: { colSpan?: number; rowSpan?: number },
) => void;

function layoutTitle(
  region: TitleRegion,
  cursor: number,
  place: Place,
): number {
  const row = (region.at ?? cursor) + (region.leading ?? 0);
  place(
    row,
    1,
    {
      value: region.text,
      style: region.style ?? 'title',
      height: region.height,
    },
    region.span && region.span > 1 ? { colSpan: region.span } : undefined,
  );
  return Math.max(cursor, row + 1);
}

function layoutText(region: TextRegion, cursor: number, place: Place): number {
  let row = cursor + (region.leading ?? 0);
  for (const line of region.lines) {
    place(row, 1, { value: line });
    row += 1;
  }
  return row;
}

function layoutBlock(
  region: BlockRegion,
  cursor: number,
  place: Place,
): number {
  const startCol = region.startCol ?? 1;
  const base = region.at ?? cursor;
  const firstRow = base + (region.leading ?? 0);

  // Index merges by their top-left [row, col] so we can attach span info to the
  // placed cell (block-relative -> absolute).
  const mergeAt = new Map<string, { colSpan?: number; rowSpan?: number }>();
  for (const m of region.merges ?? []) {
    mergeAt.set(`${m.row},${m.col}`, {
      colSpan: m.colSpan,
      rowSpan: m.rowSpan,
    });
  }

  let row = firstRow;
  region.rows.forEach((cells, rIdx) => {
    cells.forEach((cell, i) => {
      const span = mergeAt.get(`${rIdx},${i}`);
      place(row, startCol + i, cell, span);
    });
    row += 1;
  });
  return Math.max(cursor, row);
}

function layoutTable<Row>(
  region: TableRegion<Row>,
  cursor: number,
  spec: SheetSpec,
  resolver: RefResolver,
  place: Place,
  rowColMaps: WeakMap<CellSpec, Map<string, string>>,
): number {
  const startCol = region.startCol ?? 1;
  const headerRow = (region.at ?? cursor) + (region.leading ?? 0);
  const firstDataRow = headerRow + 1;
  const lastDataRow = headerRow + region.rows.length;
  // Range used for aggregation/lookup bindings: may extend past the rendered
  // rows so the user can drag the last row down and still be included.
  const reserved = Math.max(region.reservedRows ?? region.rows.length, 1);
  const boundLastRow = headerRow + reserved;

  // Header cells.
  region.columns.forEach((c, i) => {
    place(headerRow, startCol + i, { value: c.header, style: 'header' });
  });

  // Bind column spans (for refColumn) before formulas resolve.
  region.columns.forEach((c, i) => {
    if (c.name) {
      resolver.bindColumn(c.name, {
        sheet: spec.name,
        col: startCol + i,
        firstRow: firstDataRow,
        lastRow: boundLastRow,
      });
    }
  });

  // Bind the whole data area (for a multi-column defined name).
  if (region.dataName) {
    resolver.bindRange(region.dataName, {
      sheet: spec.name,
      firstRow: firstDataRow,
      firstCol: startCol,
      lastRow: boundLastRow,
      lastCol: startCol + region.columns.length - 1,
    });
  }

  // Map of column name -> column index, for same-row sibling references.
  const nameToCol = new Map<string, number>();
  region.columns.forEach((c, i) => {
    if (c.name) nameToCol.set(c.name, startCol + i);
  });

  // Data cells. We emit EVERY reserved row (not just the rendered ones), so
  // computed/helper columns carry their formula on all reserved rows. This is
  // essential under sheet protection with no macros: the user can fill any
  // reserved row and the aggregation formulas (which gate on hidden helper
  // columns) still see it — without relying on the spreadsheet app auto-
  // extending formulas from the last rendered row (LibreOffice/Sheets/Numbers
  // do not do that reliably, and disconnected helper tables never auto-extend).
  //
  // Rendered rows (rIdx < rows.length) use the supplied Row for value/formula
  // callbacks; reserved rows use a blank synthetic row. Value-only columns
  // (literal writers) stay blank on reserved rows.
  const blankRow = {} as Row;
  for (let rIdx = 0; rIdx < reserved; rIdx++) {
    const isRendered = rIdx < region.rows.length;
    const row = isRendered ? region.rows[rIdx]! : blankRow;
    const rowNumber = firstDataRow + rIdx;
    region.columns.forEach((c, cIdx) => {
      const cell: CellSpec = {
        style: c.style,
        numFmt: c.numFmt,
        dropdown: c.dropdown,
        dropdownFormula: c.dropdownFormula,
        locked: c.locked,
      };
      if (c.formula) {
        // Sibling-column A1 refs for this specific data row.
        const colMap = new Map<string, string>();
        nameToCol.forEach((col, name) =>
          colMap.set(name, `${colLetter(col)}${rowNumber}`),
        );
        rowColMaps.set(cell, colMap);
        cell.formula = (r) =>
          c.formula!(row, r, {
            col: (name) => colMap.get(name)!,
            // Any workbook-bound column's cell on this same row number. Lets a
            // helper table reference a sibling table laid out row-for-row.
            rowCell: (name) =>
              `${colLetter(resolver.columnIndex(name))}${rowNumber}`,
          });
      } else if (isRendered && c.value) {
        cell.value = c.value(row);
      }
      place(rowNumber, startCol + cIdx, cell);
    });
  }

  // Totals row.
  if (region.totals) {
    region.totals.forEach((cell, i) => {
      if (cell) place(lastDataRow + 1, startCol + i, cell);
    });
    return Math.max(cursor, lastDataRow + 2);
  }
  return Math.max(cursor, lastDataRow + 1);
}

/** Writes a single laid-out sheet into the workbook. */
async function writeSheet(
  layout: SheetLayout,
  wb: Workbook,
  resolver: RefResolver,
): Promise<void> {
  const { spec } = layout;
  const ws: Worksheet = wb.addWorksheet(
    spec.name,
    spec.hidden ? { state: 'hidden' } : undefined,
  );

  for (const { index, width, hidden } of spec.columns ?? []) {
    const col = ws.getColumn(index);
    col.width = width;
    if (hidden) col.hidden = true;
  }

  const api = resolver.forSheet(spec.name);

  // Pass 1: apply merges and record every non-master ("slave") cell. Writing a
  // value to a merged slave in ExcelJS reassigns the master's value, so slaves
  // must be skipped in the value pass -- otherwise a blank placeholder cell
  // under the span wipes the master's text.
  const slaves = new Set<string>();
  for (const { row, col, colSpan, rowSpan } of layout.placed) {
    const cs = colSpan ?? 1;
    const rs = rowSpan ?? 1;
    if (cs <= 1 && rs <= 1) continue;
    const lastRow = row + rs - 1;
    const lastCol = col + cs - 1;
    ws.mergeCells(row, col, lastRow, lastCol);
    for (let r = row; r <= lastRow; r++) {
      for (let c = col; c <= lastCol; c++) {
        if (r !== row || c !== col) slaves.add(`${r},${c}`);
      }
    }
  }

  // Pass 2: write values/formulas (skipping merged slaves) and apply styles to
  // every cell (so fills/borders render across the whole merged span).
  for (const { row, col, spec: cell } of layout.placed) {
    const target = ws.getCell(row, col);
    const isSlave = slaves.has(`${row},${col}`);

    if (!isSlave) {
      if (cell.formula) {
        target.value = { formula: cell.formula(api) };
      } else if (cell.value !== undefined) {
        target.value = toCellValue(cell.value);
      }
    }

    if (cell.style) target.style = resolveStyle(cell.style) as Style;
    if (cell.numFmt) target.numFmt = cell.numFmt;
    if (cell.locked !== undefined) {
      target.protection = { ...target.protection, locked: cell.locked };
    }
    if (cell.height !== undefined) ws.getRow(row).height = cell.height;
    if (cell.dropdownFormula) {
      target.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [cell.dropdownFormula],
        showErrorMessage: true,
        errorStyle: 'warning',
        error: '목록에서 선택하세요.',
      };
    } else if (cell.dropdown && cell.dropdown.length > 0) {
      target.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${cell.dropdown.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'warning',
        error: '목록에서 선택하세요.',
      };
    }
  }

  // Table column widths are applied via the region's column specs at layout
  // time; capture them here from the spec for completeness.
  for (const region of spec.regions) {
    if (region.kind === 'table') {
      const startCol = region.startCol ?? 1;
      region.columns.forEach((c, i) => {
        ws.getColumn(startCol + i).width = c.width;
      });
    }
  }

  // Protection last: locked cells become read-only; `locked: false` cells stay
  // editable. Sensible defaults keep the sheet usable (select any cell, sort,
  // autofilter, use dropdowns) while blocking edits to locked cells.
  if (spec.protect) {
    await ws.protect(spec.protect.password ?? '', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertRows: false,
      insertColumns: false,
      deleteRows: false,
      deleteColumns: false,
      sort: true,
      autoFilter: true,
      ...(spec.protect.options ?? {}),
    });
  }
}

/**
 * Renders all sheet specs into the workbook. Layout (and name binding) happens
 * for every sheet first, so cross-sheet `ref()` calls resolve during the write
 * pass irrespective of order. Defined names are registered last.
 */
export async function renderWorkbook(
  wb: Workbook,
  specs: SheetSpec[],
): Promise<void> {
  const resolver = new RefResolver();
  const layouts = specs.map((spec) => layoutSheet(spec, resolver));

  for (const layout of layouts) {
    await writeSheet(layout, wb, resolver);
  }

  for (const spec of specs) {
    for (const dn of spec.definedNames ?? []) {
      const target =
        dn.targetKind === 'range'
          ? resolver.qualifiedRange(dn.target)
          : dn.targetKind === 'column'
            ? resolver.qualifiedColumn(dn.target)
            : resolver.qualifiedCell(dn.target);
      wb.definedNames.add(target, dn.name);
    }
  }
}

// Re-export coordinate helpers for sheets that still build raw ranges.
export { abs, absRange, colLetter };
