import type { Course } from '../lib/csv.js';
import { NAME, SHEET } from '../lib/names.js';
import { catalogSheet } from './courseSheet.js';
import type { SheetSpec } from '../lib/template/index.js';

/** General-education (교양) read-only catalog, populated from the curriculum CSV. */
export function genEduSheet(courses: Course[]): SheetSpec {
  return catalogSheet(
    SHEET.genEdu,
    '교양 교과목 목록',
    courses,
    NAME.genEduLookup,
    true, // 교양 시트 잠금 (baked read-only)
  );
}
