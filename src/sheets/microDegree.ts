import { NAME, SHEET } from '../lib/names.js';
import { requiredCredits, type MicroDegree } from '../lib/microdegree.js';
import {
  block,
  defineSheet,
  table,
  title,
  type BlockMerge,
  type CellSpec,
  type SheetSpec,
} from '../lib/template/index.js';

/**
 * 1-based column where the hidden 마이크로디그리 룩업 tables start (well to the
 * right of the visible 7-column 운영 현황 table, cols A:G).
 */
const LOOKUP_COL = 10;

/**
 * 1-based VLOOKUP indices into the 디그리명 → (연번 | 필요학점) lookup
 * ({@link NAME.microDegreeLookup}). Single source of truth for the dashboard's
 * lookups — keep in sync with that table's `columns` order below.
 */
export const MD_NAME_LOOKUP_COL = {
  name: 1,
  no: 2,
  req: 3,
} as const;

/**
 * 1-based VLOOKUP indices into the 코드 → 연번목록 lookup
 * ({@link NAME.microDegreeCodeList}). Keep in sync with that table below.
 */
export const MD_CODE_LOOKUP_COL = {
  code: 1,
  noList: 2,
} as const;

interface NameRow {
  name: string;
  no: number;
  req: number;
}

interface CodeRow {
  code: string;
  /** ",n,n," comma-wrapped degree-number membership string. */
  list: string;
}

/**
 * 마이크로디그리 read-only reference sheet. Lists every currently-running
 * micro-degree (전남대학교 마이크로디그리 운영 지침 [별표1] 운영 현황) with its
 * 이수기준 / 개설시기 / 편성 교과목 목록. Micro-degrees are NOT a graduation
 * requirement (지침 제9조) — this sheet is purely informational, so the whole
 * sheet is protected (read-only).
 *
 * Layout (one row per 편성 교과목; degree-level fields vertically merged across
 * that degree's course rows):
 *   연번 | 디그리명 | 이수기준 | 개설시기 | 교과목코드 | 교과목명 | 학점
 */
export function microDegreeSheet(degrees: MicroDegree[]): SheetSpec {
  const HEADERS = [
    '연번',
    '디그리명',
    '이수기준',
    '개설시기',
    '교과목코드',
    '교과목명',
    '학점',
  ];

  const rows: CellSpec[][] = [
    HEADERS.map((h) => ({ value: h, style: 'header' as const })),
  ];
  const merges: BlockMerge[] = [];

  // Degree-level columns (0..3) are merged vertically over the degree's course
  // rows; per-course columns (4..6) get one cell each.
  for (const d of degrees) {
    const span = Math.max(d.courses.length, 1);
    const startRowIdx = rows.length; // block-relative row index of this degree's first course

    d.courses.forEach((course, i) => {
      const degreeCells: CellSpec[] =
        i === 0
          ? [
              { value: d.no, style: 'computedCenter', numFmt: '0' },
              { value: d.name, style: 'computed' },
              { value: d.criteria, style: 'computed' },
              { value: d.term, style: 'computedCenter' },
            ]
          : // Placeholder cells under the vertical merge (styled so borders/fill
            // render across the whole span); values are ignored for merge slaves.
            [
              { style: 'computedCenter' },
              { style: 'computed' },
              { style: 'computed' },
              { style: 'computedCenter' },
            ];
      rows.push([
        ...degreeCells,
        { value: course.code, style: 'computedCenter' },
        { value: course.title, style: 'computed' },
        { value: course.credits, style: 'computedCenter', numFmt: '0' },
      ]);
    });

    if (span > 1) {
      // Vertically merge the four degree-level columns (0..3) across the span.
      for (let col = 0; col <= 3; col++) {
        merges.push({ row: startRowIdx, col, rowSpan: span });
      }
    }
  }

  const widths = [8, 30, 34, 12, 14, 30, 8];

  // --- Hidden lookup data for the 대시보드 마이크로디그리 이수 현황 block ---------
  // 이름 → (연번 | 필요학점) 룩업 rows (VLOOKUP by 디그리명).
  const nameRows: NameRow[] = degrees.map((d) => ({
    name: d.name,
    no: d.no,
    req: requiredCredits(d),
  }));

  // 교과목코드 → 소속 디그리 연번 목록. 한 과목이 여러 디그리에 편성될 수 있으므로
  // 코드별로 연번을 모아 ",1,5," 처럼 콤마로 감싼 문자열로 만든다 (SEARCH 부분일치용).
  const codeToNos = new Map<string, number[]>();
  for (const d of degrees) {
    for (const c of d.courses) {
      const arr = codeToNos.get(c.code) ?? [];
      arr.push(d.no);
      codeToNos.set(c.code, arr);
    }
  }
  const codeRows: CodeRow[] = [...codeToNos.entries()].map(([code, nos]) => ({
    code,
    list: `,${nos.join(',')},`,
  }));

  return defineSheet({
    name: SHEET.microDegree,
    columns: [
      ...widths.map((width, i) => ({ index: i + 1, width })),
      // Hidden lookup columns (이름|연번|필요학점) and (코드|연번목록).
      { index: LOOKUP_COL, width: 30, hidden: true },
      { index: LOOKUP_COL + 1, width: 8, hidden: true },
      { index: LOOKUP_COL + 2, width: 10, hidden: true },
      { index: LOOKUP_COL + 4, width: 14, hidden: true },
      { index: LOOKUP_COL + 5, width: 40, hidden: true },
    ],
    regions: [
      title('마이크로디그리 운영 현황 (참고용)', { height: 22 }),
      title(
        '※ 마이크로디그리는 졸업요건이 아닙니다. (전남대학교 마이크로디그리 운영 지침 제9조)',
        { style: 'label', leading: 0, height: 18 },
      ),
      block(rows, { leading: 1, merges }),

      // Hidden: 디그리명 → (연번 | 필요학점) lookup + 디그리명 단일열 목록.
      table<NameRow>({
        at: 1,
        startCol: LOOKUP_COL,
        dataName: NAME.microDegreeLookup,
        columns: [
          {
            header: '디그리명',
            width: 30,
            style: 'computed',
            name: NAME.microDegreeNameList,
            value: (r) => r.name,
          },
          { header: '연번', width: 8, style: 'computed', value: (r) => r.no },
          {
            header: '필요학점',
            width: 10,
            style: 'computed',
            value: (r) => r.req,
          },
        ],
        rows: nameRows,
      }),

      // Hidden: 교과목코드 → 소속 디그리 연번 목록 (",n,n,").
      table<CodeRow>({
        at: 1,
        startCol: LOOKUP_COL + 4,
        dataName: NAME.microDegreeCodeList,
        columns: [
          {
            header: '코드',
            width: 14,
            style: 'computed',
            value: (r) => r.code,
          },
          {
            header: '연번목록',
            width: 40,
            style: 'computed',
            value: (r) => r.list,
          },
        ],
        rows: codeRows,
      }),
    ],
    definedNames: [
      {
        name: NAME.microDegreeLookup,
        target: NAME.microDegreeLookup,
        targetKind: 'range',
      },
      {
        name: NAME.microDegreeNameList,
        target: NAME.microDegreeNameList,
        targetKind: 'column',
      },
      {
        name: NAME.microDegreeCodeList,
        target: NAME.microDegreeCodeList,
        targetKind: 'range',
      },
    ],
    // Baked reference data — protect the whole sheet (read-only).
    protect: {},
  });
}
