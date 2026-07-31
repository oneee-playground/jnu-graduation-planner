import { NAME, SHEET } from '../lib/names.js';
import type { GenEduRules } from '../lib/genEdu.js';
import {
  dupCapForRole,
  primaryMajor,
  type GenerateConfig,
} from '../lib/majors.js';
import {
  block,
  defineSheet,
  table,
  title,
  type SheetSpec,
} from '../lib/template/index.js';

/**
 * 참조 (reference) sheet. A visible sheet holding the shared grade lookup and the
 * university-wide graduation GPA minimum, both exposed as workbook-level defined
 * names so the other sheets reference them in portable formulas:
 *
 *  1. GradeTable  -- grade -> grade point lookup (VLOOKUP target).
 *  2. ReqMinGpa   -- minimum cumulative GPA to graduate. University-wide, NOT
 *                    per-major: 전 교과목 성적평균평점 1.75 이상 (졸업(수료)사정 지침
 *                    졸업대상자 공통요건 / 학칙 제59조).
 *
 * Course auto-fill lookups do NOT live here: they are per-catalog and referenced
 * directly from the 주전공 (MajorLookup) and 교양 (GenEduLookup) sheets.
 *
 * Category model (학칙 제48조 / 교육과정 편성지침 제2조):
 *   교양 = 교필(교양필수) + 교선(교양선택), 전공 = 전공기본(전필·전선) + 전공심화, 일선(일반선택).
 * 마이크로디그리 is intentionally not a requirement category (마이크로디그리 운영
 * 지침 제9조: not a graduation requirement).
 */

interface GradeRow {
  grade: string;
  point: number | '';
}

/**
 * Ordered grade -> grade point rows.
 *
 * Grade-point scale per 전남대학교 학칙 제49조(성적) 및 시행세칙(성적평가): 등급별
 * 평점 A+ 4.5 / A0 4.0 / B+ 3.5 / B0 3.0 / C+ 2.5 / C0 2.0 / D+ 1.5 / D0 1.0 /
 * F 0.0. P(합격)/NP(불합격)은 평점 산정에서 제외한다(성적 평균평점 계산 시 학점
 * 및 평점 모두 미반영). 졸업 평점평균 최소기준 1.75는 졸업(수료)사정 지침에 따른다.
 */
const GRADE_POINTS: GradeRow[] = [
  { grade: 'A+', point: 4.5 },
  { grade: 'A0', point: 4.0 },
  { grade: 'B+', point: 3.5 },
  { grade: 'B0', point: 3.0 },
  { grade: 'C+', point: 2.5 },
  { grade: 'C0', point: 2.0 },
  { grade: 'D+', point: 1.5 },
  { grade: 'D0', point: 1.0 },
  { grade: 'F', point: 0.0 },
  { grade: 'P', point: '' },
  { grade: 'NP', point: '' },
];

/** Grade options surfaced as dropdowns on the input block. */
export const GRADE_OPTIONS = GRADE_POINTS.map((g) => g.grade);

/** Numeric grades that count toward GPA (P/NP excluded). */
export const NUMERIC_GRADES = GRADE_OPTIONS.filter(
  (g) => g !== 'P' && g !== 'NP',
);

export function referenceSheet(
  config: GenerateConfig,
  rules: GenEduRules,
): SheetSpec {
  // 최소 평점은 주전공 학과 기준을 따른다 (사용자 지정 아님).
  const { minGpa, genMax: catalogGenMax } = primaryMajor(config).thresholds;
  // 교양 인정학점 하한·상한은 입학연도 버전 규칙이 기본. 주전공 학과의 카탈로그
  // genMax 가 버전 기본과 다르면(간호·공학인증 등 학과 예외) 그 값을 override 로 쓴다.
  const genMin = rules.genMin;
  const genMax = catalogGenMax !== rules.genMax ? catalogGenMax : rules.genMax;
  return defineSheet({
    name: SHEET.reference,
    columns: [
      { index: 1, width: 22 },
      { index: 2, width: 12 },
      { index: 4, width: 56 },
      { index: 5, width: 12 },
    ],
    regions: [
      title('참조 자료', { height: 24 }),

      // --- 등급 → 평점 lookup table (cols A:B) ---
      title('등급 → 평점 (전남대학교 학칙 제49조)', { at: 3, style: 'label' }),
      table<GradeRow>({
        at: 4,
        startCol: 1,
        dataName: 'gradeTable',
        columns: [
          {
            header: '등급',
            width: 22,
            style: 'computed',
            value: (r) => r.grade,
          },
          {
            header: '평점',
            width: 12,
            style: 'computed',
            value: (r) => (r.point === '' ? undefined : r.point),
          },
        ],
        rows: GRADE_POINTS,
      }),

      // --- 졸업 최소 평점 + 교양최대인정 (baked at generation time; read-only). ---
      block(
        [
          [{ value: '졸업 사정 기준', style: 'label' }],
          [
            {
              value:
                '졸업 최소 평점 (전남대학교 졸업(수료)사정 지침 · 전남대학교 학칙 제59조)',
              style: 'header',
            },
            {
              name: NAME.reqMinGpa,
              value: minGpa,
              style: 'computedCenter',
              numFmt: '0.00',
              locked: true,
            },
          ],
          [
            {
              value:
                '교양 인정학점 하한 (전남대학교 교육과정 편성 및 운영지침 제10조)',
              style: 'header',
            },
            {
              name: NAME.reqGenMin,
              value: genMin,
              style: 'computedCenter',
              numFmt: '0',
              locked: true,
            },
          ],
          [
            {
              value:
                '교양최대인정학점 (전남대학교 교육과정 편성 및 운영지침 제10조)',
              style: 'header',
            },
            {
              name: NAME.reqGenMax,
              value: genMax,
              style: 'computedCenter',
              numFmt: '0',
              locked: true,
            },
          ],
        ],
        { at: 3, startCol: 4, merges: [{ row: 0, col: 0, colSpan: 2 }] },
      ),

      // --- 주전공↔다중전공 중복인정 상한 (역할별 고정값, 읽기 전용) ---
      // 복수전공규정 제10조 / 부·복수·연계전공 이수 지침 제9조②③.
      block(
        [
          [{ value: '중복인정 상한 (학점)', style: 'label' }],
          [
            {
              value:
                '복수·연계전공 (전남대학교 복수전공 이수에 관한 규정 제10조)',
              style: 'header',
            },
            {
              name: NAME.reqDupCapDouble,
              value: dupCapForRole('복수전공'),
              style: 'computedCenter',
              numFmt: '0',
              locked: true,
            },
          ],
          [
            {
              value:
                '부전공 (전남대학교 부·복수·연계전공 이수에 관한 지침 제9조②)',
              style: 'header',
            },
            {
              name: NAME.reqDupCapMinor,
              value: dupCapForRole('부전공'),
              style: 'computedCenter',
              numFmt: '0',
              locked: true,
            },
          ],
        ],
        { at: 8, startCol: 4, merges: [{ row: 0, col: 0, colSpan: 2 }] },
      ),
    ],
    definedNames: [
      { name: NAME.gradeTable, target: 'gradeTable', targetKind: 'range' },
      { name: NAME.reqMinGpa, target: NAME.reqMinGpa },
      { name: NAME.reqGenMin, target: NAME.reqGenMin },
      { name: NAME.reqGenMax, target: NAME.reqGenMax },
      { name: NAME.reqDupCapDouble, target: NAME.reqDupCapDouble },
      { name: NAME.reqDupCapMinor, target: NAME.reqDupCapMinor },
    ],
    // Read-only reference data (all config is baked at generation time).
    protect: {},
  });
}
