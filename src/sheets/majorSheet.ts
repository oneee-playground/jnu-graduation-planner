import {
  majorLookupName,
  majorName,
  TRACK_COMMON,
  type MajorField,
} from '../lib/names.js';
import type { MajorCourse } from '../lib/csv.js';
import { type MajorInput } from '../lib/majors.js';
import {
  block,
  defineSheet,
  table,
  title,
  type CellSpec,
  type CellValue,
  type DefinedNameSpec,
  type RichText,
  type SheetSpec,
} from '../lib/template/index.js';
import {
  hiddenLookupColumns,
  lookupRegion,
  type LookupRow,
} from './courseSheet.js';

/**
 * One major sheet (주전공 or a 복수/부/연계전공). Three parts:
 *
 *  1. 졸업소요학점 (기준점수) table -- the per-category graduation thresholds. Since
 *     all config is chosen at generation time on the website, these are baked in
 *     as VISIBLE, READ-ONLY constant cells (locked), exposed as scoped workbook
 *     defined names the dashboard reads. 소계/계 are computed from them.
 *  2. 교육과정 -- a read-only course list styled like the department 교육과정 page.
 *  3. A hidden code-first lookup helper (MajorLookup_<key>) so the dashboard can
 *     auto-fill entered courses. The dashboard tries the 주전공 first, then each
 *     secondary major, then 교양, so earlier majors win on duplicate codes.
 *
 * Category model: 학칙 제48조 / 교육과정 편성지침 제2조. Per-이수구분 thresholds are
 * department-specific (교학규정 별표1) and now come from the selected catalog.
 * 부전공/연계전공 sheets additionally surface their 최소 이수학점 (교육과정편성 제17·18조).
 */

/** Read-only constant threshold cell bound to a scoped defined name. */
function reqCell(name: string, value: number): CellSpec {
  return { name, value, style: 'computed', numFmt: '0', locked: true };
}

/** A computed subtotal cell summing named threshold cells. */
function subtotalCell(names: string[]): CellSpec {
  return {
    style: 'computed',
    numFmt: '0',
    locked: true,
    formula: (r) => r.refMany(names, undefined, '+'),
  };
}

/**
 * A computed subtotal cell that ALSO carries a defined name, so the dashboard
 * can reference the sum directly. Used for 복수/연계전공 최소 이수학점
 * (= 전공기본소계 = 전필+전선), which is derived rather than a separate constant.
 */
function namedSubtotalCell(name: string, names: string[]): CellSpec {
  return { ...subtotalCell(names), name };
}

/** Human 학기 label for a numeric term (1 -> "1학기", 2 -> "2학기", 0 -> "전체"). */
function termLabel(term: number): string {
  return term === 0 ? '전체' : `${term}학기`;
}

/** Human 학년 label; 0 means 전체학년 (course offered across all years). */
function yearLabel(year: number): string {
  return year === 0 ? '전체' : `${year}`;
}

export function majorSheet(input: MajorInput): SheetSpec {
  const { key, role, sheetName, thresholds, courses, tracks } = input;
  const n = (field: MajorField): string => majorName(key, field);
  const lookup = majorLookupName(key);
  // 세부전공(비고) column renders only for a 학부 (tracks present); a single 학과
  // (e.g. 국어국문학과) gets no extra column.
  const hasTracks = tracks.length > 0;
  const selectedTrack = input.selectedTrack;
  // Renders a course's 세부전공 cell, bolding ONLY the part that matches the
  // chosen 세부전공 (not the whole cell). A 공통 course belongs to every track,
  // so its single token is bold. A multi-track note (e.g. "인공지능, 소프트웨어")
  // bolds just the matching token, leaving the others plain. Rows unrelated to
  // the selected track (or when no track is chosen) render as plain text.
  const trackCellValue = (c: MajorCourse): CellValue => {
    const note = (c.note ?? '').trim();
    if (note === '') return undefined;
    if (!selectedTrack) return note;
    // 공통: the whole token is part of the selected 세부전공.
    if (note === TRACK_COMMON) return [{ text: note, bold: true }];
    const tokens = note.split(',').map((t) => t.trim());
    if (!tokens.includes(selectedTrack)) return note;
    // Rebuild "a, b, c" bolding only the token equal to the selected track.
    const runs: RichText = [];
    tokens.forEach((tok, i) => {
      if (i > 0) runs.push({ text: ', ' });
      runs.push({ text: tok, bold: tok === selectedTrack });
    });
    return runs;
  };

  const lookupRows: LookupRow[] = courses.map((c) => ({
    code: c.code,
    reqCategory: c.reqCategory,
    title: c.title,
    credits: c.credits,
    year: c.year,
  }));

  // Threshold defined names to register (all scoped by this major's key).
  const definedNames: DefinedNameSpec[] = [
    { name: n('genReq'), target: n('genReq') },
    { name: n('genElec'), target: n('genElec') },
    { name: n('majorReq'), target: n('majorReq') },
    { name: n('majorElec'), target: n('majorElec') },
    { name: n('majorAdv'), target: n('majorAdv') },
    { name: n('genSelect'), target: n('genSelect') },
    { name: n('total'), target: n('total') },
    { name: lookup, target: lookup, targetKind: 'range' },
  ];
  if (role === '부전공') {
    definedNames.push({ name: n('minorCredits'), target: n('minorCredits') });
  }
  if (role === '복수전공' || role === '연계전공') {
    // 복수/연계전공 최소 이수학점은 전공기본소계(전필+전선). 여기서 별도 상수 셀로 두지
    // 않고 majorReq/majorElec 셀을 합산하는 계산 셀에 이 이름을 바인딩한다.
    definedNames.push({ name: n('secondMajor'), target: n('secondMajor') });
  }

  return defineSheet({
    name: sheetName,
    columns: [
      { index: 1, width: 10 },
      { index: 2, width: 10 },
      { index: 3, width: 10 },
      { index: 4, width: 10 },
      { index: 5, width: 10 },
      { index: 6, width: 10 },
      { index: 7, width: 12 },
      { index: 8, width: 10 },
      { index: 9, width: 10 },
      { index: 10, width: 10 },
      { index: 11, width: 12 },
      // Col L holds the 다중전공 최소 이수학점 block (single column, vertical: label
      // merged L4:L5 over the value at L6), aligned right of the 졸업소요학점 table.
      // Widened to fit the full "복수전공 최소 이수학점" label. Cols N..S hold the
      // hidden lookup helper.
      { index: 12, width: 24 },
      { index: 13, width: 10 },
      ...hiddenLookupColumns(14),
    ],
    regions: [
      // --- 졸업소요학점 (기준점수): read-only constant table, group headers merged. ---
      // The sheet has no separate big title; its name/role is folded in as the
      // requirements block's own title row (merged across the table width).
      block(
        [
          [{ value: `${sheetName} 졸업요건 (${role})`, style: 'label' }],
          [
            { value: '교양', style: 'header' },
            { value: '', style: 'header' },
            { value: '', style: 'header' },
            { value: '전공', style: 'header' },
            { value: '', style: 'header' },
            { value: '', style: 'header' },
            { value: '', style: 'header' },
            { value: '', style: 'header' },
            { value: '일반선택', style: 'header' },
            { value: '졸업학점', style: 'header' },
          ],
          [
            { value: '교양필수', style: 'header' },
            { value: '교양선택', style: 'header' },
            { value: '소계', style: 'header' },
            { value: '전공필수', style: 'header' },
            { value: '전공선택', style: 'header' },
            { value: '전공기본소계', style: 'header' },
            { value: '전공심화', style: 'header' },
            { value: '전공계', style: 'header' },
            { value: '', style: 'header' },
            { value: '', style: 'header' },
          ],
          [
            reqCell(n('genReq'), thresholds.genReq),
            reqCell(n('genElec'), thresholds.genElec),
            subtotalCell([n('genReq'), n('genElec')]),
            reqCell(n('majorReq'), thresholds.majorReq),
            reqCell(n('majorElec'), thresholds.majorElec),
            subtotalCell([n('majorReq'), n('majorElec')]),
            reqCell(n('majorAdv'), thresholds.majorAdv),
            subtotalCell([n('majorReq'), n('majorElec'), n('majorAdv')]),
            reqCell(n('genSelect'), thresholds.genSelect),
            reqCell(n('total'), thresholds.total),
          ],
        ],
        {
          at: 3,
          startCol: 1,
          merges: [
            { row: 0, col: 0, colSpan: 10 }, // title row across the whole table
            { row: 1, col: 0, colSpan: 3 }, // 교양 over 교양필수/교양선택/소계
            { row: 1, col: 3, colSpan: 5 }, // 전공 over 전공필수..전공계
            { row: 1, col: 8, rowSpan: 2 }, // 일반선택 (no leaf label)
            { row: 1, col: 9, rowSpan: 2 }, // 졸업학점 (no leaf label)
          ],
        },
      ),

      // --- 다중전공 최소 이수학점 (부전공/복수/연계 roles), 졸업소요학점 표 오른쪽(col L) ---
      // 한 열(L) 안에서 세로로: 라벨은 L4:L5 로 세로 병합, 값은 L6 에 둔다.
      // 중복인정 상한은 역할별 고정값이라 여기가 아니라 참조 시트에 둔다.
      ...(role === '부전공'
        ? [
            block(
              [
                [{ value: '부전공 최소 이수학점', style: 'header' }],
                [], // L5: 라벨 병합 영역(빈 행)
                [reqCell(n('minorCredits'), thresholds.minorCredits ?? 21)],
              ],
              {
                at: 4,
                startCol: 12,
                merges: [
                  { row: 0, col: 0, rowSpan: 2 }, // 라벨: L4:L5 세로 병합
                ],
              },
            ),
          ]
        : role === '복수전공' || role === '연계전공'
          ? [
              block(
                [
                  [{ value: `${role} 최소 이수학점`, style: 'header' }],
                  [], // L5: 라벨 병합 영역(빈 행)
                  [
                    // 전공기본소계(전필+전선). 전공심화는 복수전공 이수 시 제외.
                    namedSubtotalCell(n('secondMajor'), [
                      n('majorReq'),
                      n('majorElec'),
                    ]),
                  ],
                ],
                {
                  at: 4,
                  startCol: 12,
                  merges: [
                    { row: 0, col: 0, rowSpan: 2 }, // 라벨: L4:L5 세로 병합
                  ],
                },
              ),
            ]
          : []),

      // --- 교육과정 (read-only, department 교육과정 style) ---
      title(`${sheetName} 교육과정`, { at: 8, height: 22, style: 'label' }),
      table<MajorCourse>({
        at: 9,
        startCol: 1,
        columns: [
          {
            header: '학년',
            width: 8,
            style: 'computed',
            value: (c) => yearLabel(c.year),
          },
          {
            header: '학기',
            width: 8,
            style: 'computed',
            value: (c) => termLabel(c.term),
          },
          {
            header: '이수구분',
            width: 10,
            style: 'computed',
            value: (c) => c.reqCategory,
          },
          {
            header: '교과목명',
            width: 30,
            style: 'computed',
            value: (c) => c.title,
          },
          {
            header: '교과목코드',
            width: 14,
            style: 'computed',
            value: (c) => c.code,
          },
          {
            header: '학점',
            width: 8,
            style: 'computed',
            numFmt: '0.0',
            value: (c) => c.credits,
          },
          ...(hasTracks
            ? [
                {
                  header: '세부전공',
                  width: 22,
                  style: 'computed' as const,
                  // Bold ONLY the token matching the chosen 세부전공, not the cell.
                  value: (c: MajorCourse) => trackCellValue(c),
                },
              ]
            : []),
        ],
        rows: courses,
      }),

      // --- Hidden code-first lookup helper (MajorLookup_<key>), cols N..S ---
      lookupRegion(lookup, lookupRows, lookupRows.length, 14),
    ],
    definedNames,
    // Everything on a major sheet is read-only (values are baked at generation
    // time). No password.
    protect: {},
  });
}
