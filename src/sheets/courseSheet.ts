import type { Course } from '../lib/csv.js';
import {
  defineSheet,
  table,
  title,
  type ColumnWidth,
  type Region,
  type SheetSpec,
} from '../lib/template/index.js';

/**
 * A code-first lookup row shared by every catalog: 코드 | 이수구분 | 교과목명 |
 * 학점 | 학년 | 세부영역. The dashboard VLOOKUPs these (코드 must be the first
 * column). Each catalog sheet carries one such block, hidden off to the right,
 * exposed as a workbook-level defined name. 세부영역 is only meaningful for 교양
 * courses (drives 교양 영역 의무이수 checking); 주전공 rows leave it blank.
 */
export interface LookupRow {
  code: string;
  reqCategory: string;
  title: string;
  credits: number | '';
  year: number | '';
  /** 교양 세부영역 (창의/감성/공동체/기초SW/표현과소통/... ); blank for 주전공. */
  subArea?: string;
}

/**
 * 1-based column indices within the shared code-first lookup block, in the order
 * the columns are emitted below. The dashboard VLOOKUPs these by index, so this
 * is the single source of truth tying those lookups to the lookup layout — keep
 * in sync with the `columns` array in {@link lookupRegion}.
 */
export const LOOKUP_COL = {
  code: 1,
  reqCategory: 2,
  title: 3,
  credits: 4,
  year: 5,
  subArea: 6,
} as const;

/** Number of columns in the lookup helper block (코드..세부영역). */
const LOOKUP_COLS = 6;

/** Default 1-based column where the hidden lookup helper block begins. */
const LOOKUP_START_COL = 9; // col I onward (visible catalog uses A:F/A:G)

/** Column-width overrides that hide the lookup helper columns. */
export function hiddenLookupColumns(
  startCol: number = LOOKUP_START_COL,
): ColumnWidth[] {
  return Array.from({ length: LOOKUP_COLS }, (_, i) => ({
    index: startCol + i,
    width: 12,
    hidden: true,
  }));
}

/**
 * Builds the hidden code-first lookup table region + its defined name. Reserves
 * extra rows so a user can extend the visible catalog and keep the lookup in
 * sync by dragging (the lookup helper mirrors the same codes).
 */
export function lookupRegion(
  dataName: string,
  rows: LookupRow[],
  reservedRows: number,
  startCol: number = LOOKUP_START_COL,
): Region {
  return table<LookupRow>({
    at: 1,
    startCol,
    dataName,
    reservedRows,
    columns: [
      {
        header: '코드',
        width: 12,
        style: 'computed',
        value: (r) => r.code || undefined,
      },
      {
        header: '이수구분',
        width: 12,
        style: 'computed',
        value: (r) => r.reqCategory || undefined,
      },
      {
        header: '교과목명',
        width: 24,
        style: 'computed',
        value: (r) => r.title || undefined,
      },
      {
        header: '학점',
        width: 8,
        style: 'computed',
        numFmt: '0',
        value: (r) => (r.credits === '' ? undefined : r.credits),
      },
      {
        header: '학년',
        width: 8,
        style: 'computed',
        // 0 means 전체학년 (offered across all years); render it as text.
        value: (r) =>
          r.year === '' ? undefined : r.year === 0 ? '전체' : r.year,
      },
      {
        header: '세부영역',
        width: 12,
        style: 'computed',
        value: (r) => r.subArea || undefined,
      },
    ],
    rows,
  });
}

/**
 * Builds a read-only 교양 curriculum catalog sheet. Visible columns:
 *   영역 | 세부영역 | 코드 | 교과목명 | 학점 | 이수구분
 *
 * A hidden code-first lookup helper (코드|이수구분|교과목명|학점|학년|세부영역) is
 * appended to the right and exposed as `lookupName` so the dashboard can
 * auto-fill/auto-categorize entered courses (and resolve 교양 세부영역 for the
 * 교양 영역 의무이수 check) directly from this sheet.
 */
export function catalogSheet(
  sheetName: string,
  titleText: string,
  courses: Course[],
  lookupName?: string,
  /** When true the sheet is protected (all cells read-only; baked catalog data). */
  locked = false,
): SheetSpec {
  const lookupRows: LookupRow[] = courses.map((c) => ({
    code: c.code,
    reqCategory: c.reqCategory,
    title: c.title,
    credits: c.credits,
    year: c.year ?? '',
    subArea: c.subCategory,
  }));

  const regions: Region[] = [
    title(titleText, { height: 22 }),
    table<Course>({
      leading: 1, // title is row 1; header lands on row 3
      startCol: 1,
      columns: [
        {
          header: '영역',
          width: 14,
          style: 'computed',
          value: (c) => c.category || undefined,
        },
        {
          header: '세부영역',
          width: 14,
          style: 'computed',
          value: (c) => c.subCategory || undefined,
        },
        {
          header: '코드',
          width: 12,
          style: 'computed',
          value: (c) => c.code || undefined,
        },
        {
          header: '교과목명',
          width: 30,
          style: 'computed',
          value: (c) => c.title || undefined,
        },
        {
          header: '학점',
          width: 8,
          style: 'computed',
          numFmt: '0',
          value: (c) => (c.credits ? c.credits : undefined),
        },
        {
          header: '이수구분',
          width: 12,
          style: 'computed',
          value: (c) => c.reqCategory || undefined,
        },
      ],
      rows: courses,
    }),
  ];

  if (lookupName && lookupRows.length > 0) {
    regions.push(lookupRegion(lookupName, lookupRows, lookupRows.length));
  }

  return defineSheet({
    name: sheetName,
    columns: lookupName ? hiddenLookupColumns() : [],
    regions,
    definedNames:
      lookupName && lookupRows.length > 0
        ? [{ name: lookupName, target: lookupName, targetKind: 'range' }]
        : [],
    // All catalog cells are baked read-only; optionally protect the sheet.
    ...(locked ? { protect: {} } : {}),
  });
}
