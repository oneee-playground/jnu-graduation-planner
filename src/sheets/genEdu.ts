import type { GenEduVersionData } from '../lib/genEdu.js';
import { NAME, SHEET } from '../lib/names.js';
import {
  CATALOG_COLS,
  catalogTableRegion,
  hiddenLookupColumns,
  lookupRegion,
  toLookupRows,
} from './courseSheet.js';
import {
  defineSheet,
  title,
  type ColumnWidth,
  type Region,
  type SheetSpec,
} from '../lib/template/index.js';

/** Blank spacer columns between adjacent per-semester tables. */
const GAP_COLS = 1;

/** Row the semester title sits on (sheet title is row 1). */
const SEMESTER_TITLE_ROW = 3;

/** Row the semester table header sits on (data rows follow). */
const SEMESTER_TABLE_ROW = 4;

/**
 * General-education (교양) read-only sheet. Renders one titled catalog table per
 * available semester, laid out horizontally (left→right) with a one-column gap
 * between tables. Only semesters that have data are rendered, so adding a past-
 * semester offering file automatically adds another table.
 *
 * A single hidden code-first lookup — the union of every semester's courses (by
 * 코드) — is placed to the right of the last table and exposed as
 * {@link NAME.genEduLookup}. The dashboard's auto-fill / 세부영역 resolution keys
 * off this one unified block regardless of how many semester tables are shown.
 */
export function genEduSheet(genEdu: GenEduVersionData): SheetSpec {
  const { semesters, lookup } = genEdu;

  const regions: Region[] = [title('교양 교과목 목록', { height: 22 })];
  const columns: ColumnWidth[] = [];

  // Lay out each semester's table horizontally. Each table spans CATALOG_COLS
  // columns; leave GAP_COLS blank between adjacent tables.
  let startCol = 1;
  for (const sem of semesters) {
    regions.push(
      title(sem.label, {
        at: SEMESTER_TITLE_ROW,
        startCol,
        style: 'label',
        span: CATALOG_COLS,
      }),
    );
    regions.push(catalogTableRegion(sem.courses, SEMESTER_TABLE_ROW, startCol));
    startCol += CATALOG_COLS + GAP_COLS;
  }

  // Hidden unified lookup (union across semesters) to the right of every table.
  const lookupStartCol = startCol;
  if (lookup.length > 0) {
    regions.push(
      lookupRegion(
        NAME.genEduLookup,
        toLookupRows(lookup),
        lookup.length,
        lookupStartCol,
      ),
    );
    columns.push(...hiddenLookupColumns(lookupStartCol));
  }

  return defineSheet({
    name: SHEET.genEdu,
    columns,
    regions,
    definedNames:
      lookup.length > 0
        ? [
            {
              name: NAME.genEduLookup,
              target: NAME.genEduLookup,
              targetKind: 'range',
            },
          ]
        : [],
    // 교양 시트 잠금 (baked read-only).
    protect: {},
  });
}
