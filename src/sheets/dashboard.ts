import {
  CATEGORY,
  NAME,
  SHEET,
  TRACK_COMMON,
  majorName,
  majorLookupName,
} from '../lib/names.js';
import {
  hasSecondaryMajors,
  primaryMajor,
  secondaryMajors,
  type GenerateConfig,
  type MajorInput,
} from '../lib/majors.js';
import type { MajorCourse } from '../lib/course.js';
import type { AreaReq, GenEduRules } from '../lib/genEdu.js';
import {
  block,
  countifs,
  defineSheet,
  foldLookups,
  lit,
  sumifs,
  table,
  title,
  verdict,
  vlookup,
  type CellSpec,
  type ColumnRefs,
  type Criterion,
  type RefApi,
  type SheetSpec,
} from '../lib/template/index.js';
import { LOOKUP_COL } from './courseSheet.js';
import { MD_CODE_LOOKUP_COL, MD_NAME_LOOKUP_COL } from './microDegree.js';
import { GRADE_OPTIONS, NUMERIC_GRADES } from './reference.js';

/**
 * Dashboard (대시보드): the single runtime input + summary surface.
 *
 * ALL configuration (majors + roles, thresholds, 입학연도/계열, GPA min, 교양최대인정)
 * is chosen at generation time on the website and baked into this workbook as
 * VISIBLE, READ-ONLY cells. The only editable surface at runtime is the 이수 과목
 * 입력 table (+ the 학년·학기별 이수 현황 helper block).
 *
 * The user records every completed course (학년/학기/코드/등급 are input); typing a
 * 코드 auto-fills 교과목명/학점/이수구분 by VLOOKUP over the majors' lookups in order
 * (주전공 first, then each 복수/부/연계전공, then 교양), so earlier majors win on
 * duplicate codes. A hidden 소속전공 helper records WHICH major's lookup first
 * claimed each 코드, so per-major requirement summaries can attribute credits.
 */

/** Semester labels (계절/특별학기 포함 — 학칙 제22조·제51조). */
export const SEMESTERS = [
  '1학기',
  '여름학기',
  '여름특별학기',
  '2학기',
  '겨울학기',
  '겨울특별학기',
] as const;

/**
 * "전체" 학기 sentinel used only by the 학년·학기별 이수 현황 block: a "전체" row sums
 * every course of that 학년 regardless of 학기 (a per-year subtotal), rather than
 * matching a literal 학기 value. It is NOT offered in the 이수 과목 입력 표.
 */
export const TERM_ALL = '전체';

/** 학기 dropdown for the 학년·학기별 이수 현황 block (실제 학기 + "전체" 소계). */
export const BREAKDOWN_SEMESTERS = [...SEMESTERS, TERM_ALL] as const;

/**
 * Year-level labels ("1학년".."6학년"; 수업연한 4년, 의/약/수의 6년 — 학칙 제20조).
 * 이수 과목 입력·학년별 소계 모두 특정 학년으로만 기록하므로 "전체" 학년은 두지 않는다
 * (학기 소계의 "전체"는 별개로 BREAKDOWN_SEMESTERS 에만 있다).
 */
export const YEARS = [
  '1학년',
  '2학년',
  '3학년',
  '4학년',
  '5학년',
  '6학년',
] as const;

export { TRACKS } from '../lib/tracks.js';

/**
 * Pass/fail icons. Colored emoji (inherently green/red) so 충족여부 is readable
 * without conditional styling; plain unicode, no macros.
 */
const ICON_OK = '✅';
const ICON_NO = '❌';

/**
 * Rendered vs reserved input rows. The template now emits the computed/helper
 * formulas on EVERY reserved row (not just the rendered ones), so a course
 * typed into any reserved row is counted correctly under sheet protection
 * without relying on the spreadsheet app auto-extending formulas. `RENDERED` is
 * just how many blank rows are visibly styled up front; `RESERVED` is the total
 * formula-filled span (the effective row ceiling).
 */
const INPUT_RENDERED = 12;
const INPUT_RESERVED = 300;
/**
 * 학년·학기별 이수 현황 block. Not pre-filled — the user picks 학년/학기 (dropdowns)
 * on blank rows and the 이수학점/평균평점 formulas react. RENDERED = visibly styled
 * blank rows; RESERVED = total formula-filled span.
 */
const BREAKDOWN_RENDERED = 10;
const BREAKDOWN_RESERVED = 30;

/**
 * Hidden helper columns: 유효, 세부영역, 소속전공, 중복대상전공. Pushed well to the
 * right (cols AD:AG) so the visible summary + 이수 과목 입력 + 학년·학기별 blocks (which
 * now sit to the right of the summary) never collide with them.
 */
const HELPER_COL = 30;

/**
 * Number of 마이크로디그리 이수 현황 slots (rows the user can fill with a 디그리명).
 * Each slot gets a hidden per-input-row membership flag column so its 이수학점/
 * 평균평점 can be computed with SUMIFS (no dynamic arrays).
 */
const MICRO_SLOTS = 10;

/**
 * 1-based column where the hidden 마이크로디그리 helper columns start (right of the
 * 4 existing hidden helpers at HELPER_COL..HELPER_COL+3). Layout:
 *   [MD_HELPER_COL]              : 코드 → 소속 디그리 연번 목록 (",n,n,").
 *   [MD_HELPER_COL+1 .. +SLOTS]  : per-slot membership flag (1 if row's 코드 ∈ slot's 디그리).
 */
const MD_HELPER_COL = HELPER_COL + 5;

/**
 * 1-based column where the 이수 과목 입력 table sits (right of the 졸업요건 summary,
 * which spans cols A:I). The 학년·학기별 이수 현황 block follows to its right.
 */
const INPUT_COL = 11;

/**
 * 1-based column where the 학년·학기별 이수 현황 block sits (right of the 8-column 이수
 * 과목 입력 table: cols K:R -> breakdown starts at T).
 */
const BREAKDOWN_COL = INPUT_COL + 9;

/** 1-based column where the 학생 정보 block sits (right of the 교양 영역 table). */
const STUDENT_INFO_COL = 6;

/** 1-based column where the 다중전공 이수 현황 block sits (bottom, left/col A group). */
const SECONDARY_COL = 1;

/** Logical column names for the manual input block. */
const COL = {
  year: 'input:year',
  semester: 'input:semester',
  code: 'input:code',
  title: 'input:title',
  credits: 'input:credits',
  grade: 'input:grade',
  points: 'input:points',
  category: 'input:category',
  /** Hidden: 1 if this row is the LAST entry for its 코드 (retake), else 0. */
  valid: 'input:valid',
  /** Hidden: 교양 세부영역 for this 코드 (blank for non-교양). */
  subArea: 'input:subArea',
  /** Hidden: major key whose lookup first claimed this 코드 ("" for 교양/unknown). */
  owner: 'input:owner',
  /**
   * Hidden: 중복인정 대상 전공 key. Non-empty only when this 코드 is owned by the
   * 주전공 (소속전공 = primary) AND also appears in a secondary major's 교육과정; then
   * it holds that secondary's key. Drives the 주전공↔복수/부전공 중복인정 상한 (9/6).
   */
  dupTarget: 'input:dupTarget',
} as const;

/** Logical column names for the 학년·학기별 이수 현황 block. */
const BCOL = {
  year: 'bd:year',
  semester: 'bd:semester',
  credits: 'bd:credits',
  average: 'bd:average',
} as const;

/** Hidden 마이크로디그리 helper column: 코드 → 소속 디그리 연번 목록 (",n,n,"). */
const MD_LIST_COL = 'md:list';

/** Logical name of a slot's hidden membership-flag column over the input rows. */
function mdFlagCol(slot: number): string {
  return `md:flag:${slot}`;
}

/** Logical name of a slot's visible 디그리명 input cell (block, one per slot). */
function mdNameCell(slot: number): string {
  return `md:name:${slot}`;
}

type Entry = Record<string, never>;

/** `n` empty table rows (formulas are emitted from reserved-row logic, not data). */
function blankRows(n: number): Entry[] {
  return Array.from({ length: n }, () => ({}) as Entry);
}

/** Per-category summary column descriptor for the 주전공. */
interface CategoryCol {
  key: string;
  label: string;
  cat: string;
  /** Threshold field on the 주전공 (scoped defined name). */
  field:
    'genReq' | 'genElec' | 'majorReq' | 'majorElec' | 'majorAdv' | 'genSelect';
  /** True for 전공 categories that are attributed to 주전공 via 소속전공. */
  majorScoped: boolean;
}

const CATEGORY_COLS: CategoryCol[] = [
  {
    key: 'genReq',
    label: '교양필수',
    cat: CATEGORY.genReq,
    field: 'genReq',
    majorScoped: false,
  },
  {
    key: 'genElec',
    label: '교양선택',
    cat: CATEGORY.genElec,
    field: 'genElec',
    majorScoped: false,
  },
  {
    key: 'majorReq',
    label: '전공필수',
    cat: CATEGORY.majorReq,
    field: 'majorReq',
    majorScoped: true,
  },
  {
    key: 'majorElec',
    label: '전공선택',
    cat: CATEGORY.majorElec,
    field: 'majorElec',
    majorScoped: true,
  },
  {
    key: 'majorAdv',
    label: '전공심화',
    cat: CATEGORY.majorAdv,
    field: 'majorAdv',
    majorScoped: true,
  },
  {
    key: 'genSelect',
    label: '일반선택',
    cat: CATEGORY.genSelect,
    field: 'genSelect',
    majorScoped: false,
  },
];

// --- Aggregation expression helpers (all gated on 유효=1) --------------------

/** Criterion matching an input column against a value (quoted or raw). */
function col(r: RefApi, name: string, match: string): Criterion {
  return { range: r.refColumn(name), match };
}

/** The ubiquitous "유효=1" (latest attempt only) criterion. */
function validCrit(r: RefApi): Criterion {
  return col(r, COL.valid, '1');
}

/** SUMIFS over the 학점 column, always gated on 유효=1. */
function creditsSumifs(r: RefApi, criteria: Criterion[]): string {
  return sumifs(r.refColumn(COL.credits), [...criteria, validCrit(r)]);
}

/** Credits earned in a 이수구분 (all majors), latest attempt per 코드. */
function categoryEarnedExpr(r: RefApi, cat: string): string {
  return creditsSumifs(r, [col(r, COL.category, lit(cat))]);
}

/** Credits earned in a 이수구분 attributed to a specific major (via 소속전공). */
function categoryEarnedForMajorExpr(
  r: RefApi,
  cat: string,
  ownerKey: string,
): string {
  return creditsSumifs(r, [
    col(r, COL.category, lit(cat)),
    col(r, COL.owner, lit(ownerKey)),
  ]);
}

/**
 * 교양필수(교필) 이수학점 for the dashboard 교양필수 bucket = 주전공 소유 교필만.
 *
 * 이유: 교필(교양필수) 지정은 전공(학과)별로 다르므로, 복수/부/연계전공의 교육과정에서
 * "교필"로 편성된 과목이라도 학생의 주전공 졸업요건상 교양필수는 아니다. 부·복수·연계전공
 * 이수 지침 제8조②(취소 시 일반선택 인정)와 같은 취지로, 주전공 기준이 아닌 교양필수
 * 과목은 교양선택으로 본다(아래 genElecValueExpr 참조).
 */
function genReqValueExpr(r: RefApi, primaryKey: string): string {
  return categoryEarnedForMajorExpr(r, CATEGORY.genReq, primaryKey);
}

/**
 * 교양선택(교선) 이수학점 = 순수 교선 과목 + 주전공이 아닌 전공이 교필로 편성한 과목.
 * (전체 교필 − 주전공 교필) 을 교선에 합산한다.
 */
function genElecValueExpr(r: RefApi, primaryKey: string): string {
  const genElec = categoryEarnedExpr(r, CATEGORY.genElec);
  const genReqAll = categoryEarnedExpr(r, CATEGORY.genReq);
  const genReqPrimary = categoryEarnedForMajorExpr(
    r,
    CATEGORY.genReq,
    primaryKey,
  );
  // 비(非)주전공 교필 = 전체 교필 − 주전공 교필.
  return `${genElec}+(${genReqAll}-${genReqPrimary})`;
}

/** Total credits attributed to a major (any category), latest attempt per 코드. */
function majorEarnedExpr(r: RefApi, ownerKey: string): string {
  return creditsSumifs(r, [col(r, COL.owner, lit(ownerKey))]);
}

/**
 * 주전공과 공통인 과목 중 이 secondary 로 중복인정될 수 있는 학점 (상한 적용 전 raw).
 * 소속전공 = 주전공 이면서 중복대상전공 = 이 secondary 인 유효 행들의 학점 합.
 */
function dupRawExpr(r: RefApi, secKey: string): string {
  return creditsSumifs(r, [col(r, COL.dupTarget, lit(secKey))]);
}

/**
 * secondary 전공의 이수 인정학점 = 이 전공이 직접 소유한 과목 학점 + 주전공과의 공통과목
 * 중복인정분(상한 min). 상한은 참조 시트의 역할별 고정값 (복수·연계 ReqDupCapDouble=9,
 * 부전공 ReqDupCapMinor=6).
 *
 * 지침 제9조① (전필이 모두 중복될 경우 전선에서 졸업소요학점을 이수)은 별도 수식 없이 이
 * 상한에서 자연히 도출된다: 공통과목(주로 전필)이 상한을 넘어도 중복인정분은 상한까지만
 * 계산되므로, 나머지 이수학점은 공통이 아닌(즉 이 전공 고유) 과목 = 사실상 전선에서 채워야
 * 요건이 충족된다.
 */
/** 이 secondary 의 중복인정 상한 정의명 (복수·연계=9, 부전공=6). */
function dupCapName(sec: MajorInput): string {
  return sec.role === '부전공' ? NAME.reqDupCapMinor : NAME.reqDupCapDouble;
}

/** 실제 인정되는 중복 학점 = MIN(공통과목 학점, 상한). */
function dupAppliedExpr(r: RefApi, sec: MajorInput): string {
  return `MIN(${dupRawExpr(r, sec.key)},${r.ref(dupCapName(sec))})`;
}

function secondaryEarnedExpr(r: RefApi, sec: MajorInput): string {
  const own = majorEarnedExpr(r, sec.key);
  const dup = dupAppliedExpr(r, sec);
  return `${own}+${dup}`;
}

/**
 * 이 전공(복수/부/연계) 교육과정의 전필 과목 코드 목록. 부·복수·연계전공 이수 지침 제9조①:
 * 복수전공 이수자는 전필을 모두 이수해야 하며(전필이 모두 중복될 경우 전선에서 채운다),
 * 즉 이수 완료 판정의 핵심은 "전필 전 과목 이수 여부"다.
 */
function requiredMajorCodes(m: MajorInput): string[] {
  return m.courses
    .filter((c) => c.reqCategory === CATEGORY.majorReq && courseInTrack(c, m))
    .map((c) => c.code);
}

/**
 * 이 과목이 학생의 세부전공 요건에 해당하는지. 학부(tracks 존재)에서 세부전공을 고른 경우
 * "공통" 또는 선택 트랙 소속 과목만 요건 대상이다 (예: 인공지능학부 전필 = 공통 4과목 +
 * 선택 트랙 캡스톤디자인 1과목). 단일 학과이거나 세부전공 미선택이면 모든 과목이 대상.
 */
function courseInTrack(c: MajorCourse, m: MajorInput): boolean {
  if (m.tracks.length === 0 || !m.selectedTrack) return true;
  const note = (c.note ?? '').trim();
  if (note === '' || note === TRACK_COMMON) return true;
  return note
    .split(',')
    .map((t) => t.trim())
    .includes(m.selectedTrack);
}

/**
 * 이 전공의 전필 과목 중 학생이 이수(입력·유효)한 과목 수. 코드별 COUNTIFS 합으로 세며,
 * 소속전공(주전공 우선 귀속)과 무관하게 실제 입력된 코드를 직접 확인하므로 주전공과 공통인
 * 전필도 올바르게 이수로 인정된다. (portable subset: COUNTIFS 만 사용.)
 */
function requiredMajorDoneCountExpr(r: RefApi, codes: string[]): string {
  if (codes.length === 0) return '0';
  return codes
    .map((c) => countifs([col(r, COL.code, lit(c)), validCrit(r)]))
    .join('+');
}

/** 교양 취득학점(교필+교선, raw). */
function genRawExpr(r: RefApi): string {
  return `(${categoryEarnedExpr(r, CATEGORY.genReq)}+${categoryEarnedExpr(r, CATEGORY.genElec)})`;
}

/** 교양 초과분 중 일반선택으로 인정되는 학점 (교육과정편성 제10조). 교양 기준은 주전공 기준. */
function genOverflowToGenSelectExpr(r: RefApi, primaryKey: string): string {
  const genRaw = genRawExpr(r);
  const genReqTotal = `(${r.ref(majorName(primaryKey, 'genReq'))}+${r.ref(majorName(primaryKey, 'genElec'))})`;
  return `MAX(MIN(${genRaw},${r.ref(NAME.reqGenMax)})-${genReqTotal},0)`;
}

/** 졸업소요학점 미인정 교양 초과분 (교양최대인정학점 초과분). */
function genUnrecognizedExpr(r: RefApi): string {
  return `MAX(${genRawExpr(r)}-${r.ref(NAME.reqGenMax)},0)`;
}

/**
 * 주전공 전공 초과분 중 일반선택으로 인정되는 학점 (교육과정편성 제14조⑥). 전필/전선/
 * 전공심화 각 주전공 취득학점이 기준을 초과한 분. 전공심화 기준은 build-time gate:
 * 다중전공이면 0 (요건 면제), 단일전공이면 ReqMajorAdv.
 */
function primaryMajorOverflowExpr(
  r: RefApi,
  primaryKey: string,
  majorAdvGated: boolean,
): string {
  const p = (field: 'majorReq' | 'majorElec' | 'majorAdv'): string =>
    r.ref(majorName(primaryKey, field));
  const parts: { cat: string; req: string }[] = [
    { cat: CATEGORY.majorReq, req: p('majorReq') },
    { cat: CATEGORY.majorElec, req: p('majorElec') },
    // 다중전공: 전공심화 기준 0 → 전공심화 취득학점 전부가 일반선택으로 인정.
    { cat: CATEGORY.majorAdv, req: majorAdvGated ? '0' : p('majorAdv') },
  ];
  return parts
    .map(
      (part) =>
        `MAX(${categoryEarnedForMajorExpr(r, part.cat, primaryKey)}-${part.req},0)`,
    )
    .join('+');
}

/**
 * 복수/부/연계전공 전공 초과분 중 일반선택으로 인정되는 학점 (교육과정편성 제14조⑥는
 * 학과(부)별 기준학점 초과분을 일선으로 규정하므로 각 이수 전공에 개별 적용된다).
 *
 * 이 전공으로 인정되는 학점(secondaryEarnedExpr: 고유 전공학점 + 중복인정 상한분)이 이
 * 전공의 최소 이수학점(복수·연계=전필+전선, 부전공=minorCredits)을 초과한 만큼을 일선으로
 * 인정한다. 중복인정분은 이미 상한(9/6)으로 제한되어 있으므로 이중계상되지 않는다.
 */
function secondaryOverflowExpr(r: RefApi, secondaries: MajorInput[]): string {
  if (secondaries.length === 0) return '0';
  return secondaries
    .map((m) => {
      const earned = secondaryEarnedExpr(r, m);
      const reqName =
        m.role === '부전공'
          ? majorName(m.key, 'minorCredits')
          : majorName(m.key, 'secondMajor');
      return `MAX((${earned})-${r.ref(reqName)},0)`;
    })
    .join('+');
}

/** 교양 영역 의무이수 현재값 (세부영역별 합, 유효=1). */
function areaEarnedExpr(r: RefApi, subAreas: string[]): string {
  return subAreas
    .map((sa) => creditsSumifs(r, [col(r, COL.subArea, lit(sa))]))
    .join('+');
}

/**
 * 등급이 매겨진(P·NP 제외) 학점 합계 = GPA 분모. Sums, over each numeric grade, the
 * 학점 of rows matching `extra` criteria AND that grade. `gated` appends the 유효=1
 * gate after the grade criterion (omit only where the extra criteria already
 * imply validity, e.g. a 마이크로디그리 membership flag). Used by every average/GPA.
 */
function gradedCreditsExpr(
  r: RefApi,
  extra: Criterion[],
  gated = false,
): string {
  return NUMERIC_GRADES.map((g) =>
    creditsSumifsRaw(r, [
      ...extra,
      col(r, COL.grade, lit(g)),
      ...(gated ? [validCrit(r)] : []),
    ]),
  ).join('+');
}

/** SUMIFS over 학점 with the exact criteria given (no implicit gate). */
function creditsSumifsRaw(r: RefApi, criteria: Criterion[]): string {
  return sumifs(r.refColumn(COL.credits), criteria);
}

// --- 마이크로디그리 이수 현황 helpers ----------------------------------------
// A slot's flag column marks each input row whose 코드 belongs to the slot's
// chosen 디그리 (and is 유효=1); credits/points then aggregate via SUMIFS.

/**
 * Per-input-row membership flag for a 마이크로디그리 slot. 1 when the row is 유효,
 * the slot has a 디그리명, and the row's 코드 belongs to that 디그리. Membership is
 * tested by looking up the slot 디그리명 → its 연번 (MicroDegreeLookup col 2) and
 * checking whether that 연번 appears in the code's ",n,n," 연번 목록 (SEARCH of
 * ",N,"). Portable subset only (IF/AND/ISNUMBER/SEARCH/VLOOKUP/IFERROR).
 */
function mdFlagExpr(
  codeCell: string,
  validCell: string,
  listCell: string,
  nameCell: string,
): string {
  const no = vlookup(nameCell, NAME.microDegreeLookup, MD_NAME_LOOKUP_COL.no);
  const hit = `ISNUMBER(SEARCH(","&${no}&",",${listCell}))`;
  return `IF(AND(${codeCell}<>"",${validCell}=1,${nameCell}<>"",${listCell}<>"",IFERROR(${hit},FALSE)),1,0)`;
}

/** Criterion matching a slot's membership-flag column against 1. */
function mdFlagCrit(r: RefApi, slot: number): Criterion {
  return { range: r.refColumn(mdFlagCol(slot)), match: '1' };
}

/** 마이크로디그리 이수학점 (slot): 유효·소속 과목 학점 합. */
function mdEarnedExpr(r: RefApi, slot: number): string {
  return sumifs(r.refColumn(COL.credits), [mdFlagCrit(r, slot)]);
}

/** 마이크로디그리 필요학점 (slot): 디그리명 → MicroDegreeLookup 3열(필요학점). */
function mdRequiredExpr(nameCell: string): string {
  return `IF(${nameCell}="","",IFERROR(${vlookup(nameCell, NAME.microDegreeLookup, MD_NAME_LOOKUP_COL.req)},""))`;
}

/** 마이크로디그리 평균평점 (slot): 소속 과목 평점합 / 등급부여 학점합. */
function mdAverageExpr(r: RefApi, slot: number, nameCell: string): string {
  const flagCrit = mdFlagCrit(r, slot);
  const pts = sumifs(r.refColumn(COL.points), [flagCrit]);
  const graded = gradedCreditsExpr(r, [flagCrit]);
  return `IF(${nameCell}="","",IFERROR(ROUND((${pts})/(${graded}),2),""))`;
}

// --- 학년·학기별 이수 현황 helpers -------------------------------------------
// yearCell/termCell are same-row A1 refs to the block's 학년/학기 input cells.
// A 학기 of "전체"(TERM_ALL)은 해당 학년의 모든 학기를 합산한다(소계): 학기 조건을 빼고
// 학년만으로 SUMIFS 한다. 그 외에는 학년+학기 둘 다 일치하는 유효(=1) 행을 합산한다.

/**
 * Wraps an all-terms and a one-term expression in the shared 학년·학기 envelope:
 * blank 학년 → ""; 학기="전체" → 소계(all); else the single-term value(one).
 */
function breakdownEnvelope(
  yearCell: string,
  termCell: string,
  all: string,
  one: string,
): string {
  return `IF(${yearCell}="","",IF(${termCell}="${TERM_ALL}",${all},${one}))`;
}

/** Year (+ optional term) matching criteria for a 학년·학기별 row. */
function breakdownCriteria(
  r: RefApi,
  yearCell: string,
  termCell?: string,
): Criterion[] {
  const yr = col(r, COL.year, yearCell);
  return termCell === undefined ? [yr] : [yr, col(r, COL.semester, termCell)];
}

/** 학년·학기별 이수학점 (해당 학기, 또는 "전체"면 그 학년 전체 소계). */
function breakdownCreditsExpr(
  r: RefApi,
  yearCell: string,
  termCell: string,
): string {
  const allTerms = creditsSumifs(r, breakdownCriteria(r, yearCell));
  const oneTerm = creditsSumifs(r, breakdownCriteria(r, yearCell, termCell));
  return breakdownEnvelope(yearCell, termCell, allTerms, oneTerm);
}

/** 학년·학기별 평균평점 (해당 학기, 또는 "전체"면 그 학년 전체 소계). */
function breakdownAverageExpr(
  r: RefApi,
  yearCell: string,
  termCell: string,
): string {
  const pts = r.refColumn(COL.points);
  // 평점 합계 / 등급이 매겨진(P·NP 제외) 학점 합계.
  const avg = (crit: Criterion[]): string => {
    const ptsSum = sumifs(pts, [...crit, validCrit(r)]);
    const graded = gradedCreditsExpr(r, crit, true);
    return `IFERROR(ROUND((${ptsSum})/(${graded}),2),"")`;
  };
  const all = avg(breakdownCriteria(r, yearCell));
  const one = avg(breakdownCriteria(r, yearCell, termCell));
  return breakdownEnvelope(yearCell, termCell, all, one);
}

/**
 * Auto-fill / attribution chain over the ordered majors + 교양. For a value
 * lookup (index 2..6) returns the first hit's column; the 코드 disambiguation is
 * "first major wins" (주전공 first). `fallback` is used when no lookup matches.
 */
function autoFillChain(
  majors: MajorInput[],
  codeCell: string,
  index: number,
  fallback: string,
): string {
  // Innermost: 교양, then fallback. Wrap each major last-to-first so 주전공 (index
  // 0) ends up outermost (first-major-wins).
  const seed = `IFERROR(${vlookup(codeCell, NAME.genEduLookup, index)},${fallback})`;
  const expr = foldLookups(
    majors,
    seed,
    (m, inner) =>
      `IFERROR(${vlookup(codeCell, majorLookupName(m.key), index)},${inner})`,
  );
  return `IF(${codeCell}="","",${expr})`;
}

/**
 * Nested chain that, for each major (declaration order → outermost), yields the
 * major's key when the 코드 is found in its lookup (VLOOKUP index-1 = 코드 itself
 * equals the 코드), else falls through. `seed` is the innermost fallback.
 */
function keyMatchChain(
  majors: MajorInput[],
  codeCell: string,
  seed: string,
): string {
  return foldLookups(
    majors,
    seed,
    (m, inner) =>
      `IFERROR(IF(${vlookup(codeCell, majorLookupName(m.key), LOOKUP_COL.code)}=${codeCell},"${m.key}",${inner}),${inner})`,
  );
}

/**
 * 소속전공 chain: returns the KEY of the first major whose lookup matches the 코드
 * (주전공 first), else "" (교양/unknown).
 */
function ownerChain(majors: MajorInput[], codeCell: string): string {
  const expr = keyMatchChain(majors, codeCell, '""');
  return `IF(${codeCell}="","",${expr})`;
}

/**
 * 중복대상전공 chain. A course counts toward the 주전공 (owner = primary key) but is
 * ALSO listed in a secondary major's 교육과정 → it is a 주전공-secondary 공통과목 that
 * qualifies for 중복인정. Returns the FIRST such secondary's key (declaration
 * order), or "" if the course is not owned by the 주전공 or shared with none.
 *
 * We test membership by re-VLOOKUPing the 코드 in each secondary's lookup; the
 * baked lookups already contain every catalog 코드, so this needs no extra table.
 * Only 주전공-owned rows are considered, so a course the secondary itself owns
 * (i.e. not also in 주전공) is handled by normal attribution, not double-counted.
 */
function dupTargetChain(
  ownerCell: string,
  primaryKey: string,
  secondaries: MajorInput[],
  codeCell: string,
): string {
  if (secondaries.length === 0) return '""';
  const expr = keyMatchChain(secondaries, codeCell, '""');
  // Only 주전공-owned courses can be 중복인정 sources.
  return `IF(${codeCell}="","",IF(${ownerCell}="${primaryKey}",${expr},""))`;
}

export function dashboardSheet(
  config: GenerateConfig,
  rules: GenEduRules,
): SheetSpec {
  const { student, majors } = config;
  const primary = primaryMajor(config);
  const secondaries = secondaryMajors(config);
  const multi = hasSecondaryMajors(config);

  // 교양 영역 의무이수: 공통 요건 + 사용자 계열에 해당하는 계열별 요건만 표시한다
  // (다른 계열용 행은 아예 생성하지 않는다). 요건 집합은 입학연도 버전 규칙에서 온다.
  const areaReqs = rules.areaReqs.filter(
    (a: AreaReq) => !a.track || a.track === student.track,
  );

  // 일반선택 현재값 = 일선(raw) + 교양 초과분 + 주전공 전공 초과분 + 복수/부/연계전공
  // 전공 초과분 (각 전공의 기준학점 초과분, 교육과정편성 제14조⑥·제10조①6).
  const genSelectValue: CellSpec['formula'] = (r) =>
    `${categoryEarnedExpr(r, CATEGORY.genSelect)}+${genOverflowToGenSelectExpr(r, primary.key)}+${primaryMajorOverflowExpr(r, primary.key, multi)}+${secondaryOverflowExpr(r, secondaries)}`;

  // 총 이수학점(인정) = 취득학점 합계 - 교양최대인정 초과분.
  const earnedTotal: CellSpec['formula'] = (r) =>
    `${creditsSumifs(r, [])}-${genUnrecognizedExpr(r)}`;

  const gpa: CellSpec['formula'] = (r) => {
    const points = sumifs(r.refColumn(COL.points), [validCrit(r)]);
    const graded = gradedCreditsExpr(r, [], true);
    return `IFERROR(ROUND((${points})/(${graded}),2),0)`;
  };

  // 주전공 per-category current value: 교양 categories count all rows in that
  // category; 전공 categories count only rows attributed to the 주전공.
  const categoryValueFormula = (c: CategoryCol): CellSpec['formula'] => {
    if (c.key === 'genSelect') return genSelectValue;
    // 교양필수는 주전공 소유 교필만; 교양선택은 순수 교선 + 비주전공 교필.
    if (c.key === 'genReq') return (r) => genReqValueExpr(r, primary.key);
    if (c.key === 'genElec') return (r) => genElecValueExpr(r, primary.key);
    if (c.majorScoped) {
      return (r) => categoryEarnedForMajorExpr(r, c.cat, primary.key);
    }
    return (r) => categoryEarnedExpr(r, c.cat);
  };

  // 주전공 per-category threshold. 전공심화 gated to 0 when the student has any
  // secondary major (교육과정편성 제14조②③).
  const categoryReqFormula = (c: CategoryCol): CellSpec['formula'] => {
    if (c.key === 'majorAdv' && multi) return () => '0';
    return (r) => r.ref(majorName(primary.key, c.field));
  };

  // --- Summary rows (구분 | ...카테고리... | 총 이수학점 | GPA) ---
  const labelRow: CellSpec[] = [
    { value: '구분', style: 'header' },
    ...CATEGORY_COLS.map((c) => ({ value: c.label, style: 'header' as const })),
    { value: '총 이수학점', style: 'header' },
    { value: 'GPA', style: 'header' },
  ];

  const valueRow: CellSpec[] = [
    { value: '이수학점', style: 'label' },
    ...CATEGORY_COLS.map((c) => ({
      name: `dash:${c.key}:value`,
      style: 'computed' as const,
      numFmt: '0',
      formula: categoryValueFormula(c),
    })),
    {
      name: 'dash:total:value',
      style: 'computed',
      numFmt: '0',
      formula: earnedTotal,
    },
    { name: 'dash:gpa:value', style: 'computed', numFmt: '0.00', formula: gpa },
  ];

  const reqRow: CellSpec[] = [
    { value: '필요학점', style: 'label' },
    ...CATEGORY_COLS.map((c) => ({
      name: `dash:${c.key}:req`,
      style: 'computed' as const,
      numFmt: '0',
      formula: categoryReqFormula(c),
    })),
    {
      name: 'dash:total:req',
      style: 'computed',
      numFmt: '0',
      formula: (r: RefApi) => r.ref(majorName(primary.key, 'total')),
    },
    {
      name: 'dash:gpa:req',
      style: 'computed',
      numFmt: '0.00',
      formula: (r: RefApi) => r.ref(NAME.reqMinGpa),
    },
  ];

  // Summary verdict cells (aligned under each category / total / GPA).
  const summaryVerdictPairs = [
    ...CATEGORY_COLS.map((c) => ({
      value: `dash:${c.key}:value`,
      req: `dash:${c.key}:req`,
    })),
    { value: 'dash:total:value', req: 'dash:total:req' },
    { value: 'dash:gpa:value', req: 'dash:gpa:req' },
  ];

  const verdictRow: CellSpec[] = [
    { value: '충족여부', style: 'label' },
    ...summaryVerdictPairs.map((p) => ({
      style: 'computed' as const,
      formula: (r: RefApi) =>
        verdict(r.ref(p.value), r.ref(p.req), ICON_OK, ICON_NO),
    })),
  ];

  // Per-secondary-major requirement rows (다중전공 이수 현황).
  const secondaryReqField = (m: MajorInput): string =>
    m.role === '부전공'
      ? majorName(m.key, 'minorCredits')
      : majorName(m.key, 'secondMajor');

  // 교양 영역 의무이수 table rows.
  const areaHeaderRow: CellSpec[] = [
    { value: '교양 영역', style: 'header' },
    { value: '이수학점', style: 'header' },
    { value: '필요학점', style: 'header' },
    { value: '충족여부', style: 'header' },
  ];
  const areaRows: CellSpec[][] = areaReqs.map((a) => [
    { value: a.label, style: 'label' },
    {
      name: `dash:area:${a.key}:value`,
      style: 'computed',
      numFmt: '0',
      formula: (r: RefApi) => areaEarnedExpr(r, a.subAreas),
    },
    {
      // 요건이 표시되는 행은 모두 사용자 계열에 해당하므로 기준값은 상수다.
      name: `dash:area:${a.key}:req`,
      value: a.required,
      style: 'computed',
      numFmt: '0',
    },
    {
      style: 'computed',
      formula: (r: RefApi) =>
        verdict(
          r.ref(`dash:area:${a.key}:value`),
          r.ref(`dash:area:${a.key}:req`),
          ICON_OK,
          ICON_NO,
        ),
    },
  ]);

  // 교양 인정학점 하한 (졸업요건). 이수학점 = 인정 교양학점 = MIN(교필+교선, 교양최대인정),
  // 필요학점 = ReqGenMin (입학연도 버전 하한, 학과 예외시 override). 영역 표에 한 행 추가.
  areaRows.push([
    { value: '교양 인정학점', style: 'label' },
    {
      name: 'dash:genMin:value',
      style: 'computed',
      numFmt: '0',
      formula: (r: RefApi) => `MIN(${genRawExpr(r)},${r.ref(NAME.reqGenMax)})`,
    },
    {
      name: 'dash:genMin:req',
      style: 'computed',
      numFmt: '0',
      formula: (r: RefApi) => r.ref(NAME.reqGenMin),
    },
    {
      style: 'computed',
      formula: (r: RefApi) =>
        verdict(
          r.ref('dash:genMin:value'),
          r.ref('dash:genMin:req'),
          ICON_OK,
          ICON_NO,
        ),
    },
  ]);

  // 다중전공 이수 현황 table rows (one per secondary major).
  // 학점충족(이수학점≥필요학점) 과 별도로, 전필 전 과목 이수 여부(부·복수·연계전공 이수
  // 지침 제9조①)를 "전필이수(이수/전체)" + "전필충족" 으로, 그리고 주전공 공통과목의
  // 중복인정 상한 적용을 "중복인정(실제/상한)" 으로 함께 보여준다.
  const secondaryHeaderRow: CellSpec[] = [
    { value: '다중전공', style: 'header' },
    { value: '구분', style: 'header' },
    { value: '이수학점', style: 'header' },
    { value: '필요학점', style: 'header' },
    { value: '학점충족', style: 'header' },
    { value: '전필이수', style: 'header' },
    { value: '전필충족', style: 'header' },
    { value: '중복인정', style: 'header' },
  ];
  const secondaryRows: CellSpec[][] = secondaries.map((m) => {
    const reqCodes = requiredMajorCodes(m);
    const reqTotal = reqCodes.length;
    return [
      { value: m.displayName, style: 'label' },
      { value: m.role, style: 'computed' },
      {
        name: `dash:sec:${m.key}:value`,
        style: 'computed',
        numFmt: '0',
        formula: (r: RefApi) => secondaryEarnedExpr(r, m),
      },
      {
        name: `dash:sec:${m.key}:req`,
        style: 'computed',
        numFmt: '0',
        formula: (r: RefApi) => r.ref(secondaryReqField(m)),
      },
      {
        style: 'computed',
        formula: (r: RefApi) =>
          verdict(
            r.ref(`dash:sec:${m.key}:value`),
            r.ref(`dash:sec:${m.key}:req`),
            ICON_OK,
            ICON_NO,
          ),
      },
      {
        // 전필 이수 현황: "이수과목수/전체전필수" (예: 7/10). 소속전공 귀속과 무관하게
        // 실제 입력 코드를 직접 세므로 주전공과 공통인 전필도 이수로 인정된다.
        name: `dash:sec:${m.key}:reqDone`,
        style: 'computed',
        formula: (r: RefApi) =>
          `(${requiredMajorDoneCountExpr(r, reqCodes)})&"/"&${reqTotal}`,
      },
      {
        // 전필 전 과목 이수 시 충족. 전필이 없는(reqTotal=0) 전공은 항상 충족.
        style: 'computed',
        formula: (r: RefApi) =>
          verdict(
            `(${requiredMajorDoneCountExpr(r, reqCodes)})`,
            `${reqTotal}`,
            ICON_OK,
            ICON_NO,
          ),
      },
      {
        // 중복인정 (실제 인정 / 상한): 주전공과 공통인 과목이 이 전공으로 중복 인정되는
        // 학점 = MIN(공통학점, 상한). "3/9" 형태로 상한 적용을 눈으로 확인할 수 있게 한다
        // (복수·연계 9학점 / 부전공 6학점, 지침 제9조②③). 이수학점 열에 이미 반영되어 있다.
        style: 'computed',
        formula: (r: RefApi) =>
          `(${dupAppliedExpr(r, m)})&"/"&${r.ref(dupCapName(m))}`,
      },
    ];
  });

  // 마이크로디그리 이수 현황 table rows (MICRO_SLOTS user-fillable rows).
  // 마이크로디그리 | 이수학점 | 필요학점 | 충족 | 평균평점.
  // 디그리명은 드롭다운(MicroDegreeNameList)에서 선택하고, 학점/평점은 hidden
  // 소속 flag 열(mdFlagCol)을 통해 SUMIFS 로 집계한다. 마이크로디그리는 졸업요건이
  // 아니므로(운영 지침 제9조) 이 블록은 참고용이며 졸업요건 판정에는 반영되지 않는다.
  const microHeaderRow: CellSpec[] = [
    { value: '마이크로디그리', style: 'header' },
    { value: '이수학점', style: 'header' },
    { value: '필요학점', style: 'header' },
    { value: '충족', style: 'header' },
    { value: '평균평점', style: 'header' },
  ];
  const microRows: CellSpec[][] = Array.from(
    { length: MICRO_SLOTS },
    (_v, slot) => {
      const nameRef = (r: RefApi): string => r.ref(mdNameCell(slot));
      return [
        {
          // 디그리명 입력 (드롭다운). 운영 현황 시트의 이름 목록 범위로 검증한다.
          name: mdNameCell(slot),
          style: 'input',
          locked: false,
          dropdownFormula: NAME.microDegreeNameList,
        },
        {
          name: `dash:md:${slot}:value`,
          style: 'computed',
          numFmt: '0',
          formula: (r: RefApi) =>
            `IF(${nameRef(r)}="","",${mdEarnedExpr(r, slot)})`,
        },
        {
          name: `dash:md:${slot}:req`,
          style: 'computed',
          numFmt: '0',
          formula: (r: RefApi) => mdRequiredExpr(nameRef(r)),
        },
        {
          style: 'computed',
          formula: (r: RefApi) =>
            `IF(${nameRef(r)}="","",${verdict(
              r.ref(`dash:md:${slot}:value`),
              r.ref(`dash:md:${slot}:req`),
              ICON_OK,
              ICON_NO,
            )})`,
        },
        {
          style: 'computed',
          numFmt: '0.00',
          formula: (r: RefApi) => mdAverageExpr(r, slot, nameRef(r)),
        },
      ];
    },
  );

  // --- Row plan -------------------------------------------------------------
  // LEFT column stack (col A):
  //   Row 1   : "졸업 요건 현황" section title.
  //   Rows 2-5: 졸업요건 summary (cols A:I).
  //   Row 7   : "교양 영역 의무이수 현황" title (+ "학생 정보" title at col F).
  //   Row 8   : 교양 영역 table header; rows 9.. area rows.
  //   Below   : "다중전공 이수 현황" title + table, then "마이크로디그리 이수 현황".
  // RIGHT of the summary (col K):
  //   Row 1   : "이수 과목 입력" title (+ "학년·학기별 이수 현황" title further right).
  //   Row 2   : input table header; rows 3.. entries.
  const summaryTitleRow = 1;
  const summaryBlockRow = 2; // labelRow at 2, value 3, req 4, verdict 5

  const areaLabelRow = 7;
  const areaHeaderRowNum = areaLabelRow + 1; // 8
  const areaTableLastRow = areaHeaderRowNum + areaRows.length; // 8 + N (+ genMin 행)

  // 다중전공 이수 현황 stacks below the 교양 table (col A). When the student has no
  // secondary major the block is omitted entirely (0 rows consumed).
  const secondaryLabelRow = areaTableLastRow + 2;
  const secondaryLastRow =
    secondaries.length > 0
      ? secondaryLabelRow + 1 + secondaries.length // label + header + rows
      : areaTableLastRow; // nothing rendered; fall back to 교양 table end

  // 마이크로디그리 이수 현황 stacks below 다중전공 (col A).
  const microLabelRow = secondaryLastRow + 2;
  const microHeaderRowNum = microLabelRow + 1;

  // Input block sits to the right of the summary.
  const inputTitleRow = 1;
  const inputTableRow = inputTitleRow + 1; // header row 2

  return defineSheet({
    name: SHEET.dashboard,
    columns: [
      // col A holds all left-column section titles + the summary 구분 col + 교양
      // 영역 labels + 다중전공 names, so it is the widest.
      { index: 1, width: 22 },
      { index: 2, width: 12 },
      { index: 3, width: 12 },
      // col D no longer holds 교과목명 (that moved into the input block at col N);
      // here it is only a category value / 충족여부 column, so keep it narrow.
      { index: 4, width: 10 },
      { index: 5, width: 10 },
      // cols F:G: 학생 정보 (입학연도/주전공) sitting right of the 교양 영역 table.
      { index: STUDENT_INFO_COL, width: 14 },
      { index: STUDENT_INFO_COL + 1, width: 20 },
      { index: 8, width: 10 },
      { index: 9, width: 10 },
      // col J: gap between the summary (A:I) and the input block (K:R).
      { index: 10, width: 3 },
      // cols K:R: 이수 과목 입력 table (widths set by the table's own columns).
      // cols T:W: 학년·학기별 이수 현황 (widths set by that table).
      { index: BREAKDOWN_COL - 1, width: 3 }, // gap col S between input & breakdown
      // cols AD:AG hidden helpers (유효, 세부영역, 소속전공, 중복대상전공).
      { index: HELPER_COL, width: 6, hidden: true },
      { index: HELPER_COL + 1, width: 12, hidden: true },
      { index: HELPER_COL + 2, width: 10, hidden: true },
      { index: HELPER_COL + 3, width: 12, hidden: true },
      // 마이크로디그리 hidden helpers: 코드→연번목록 + per-slot 소속 flag columns.
      { index: MD_HELPER_COL, width: 14, hidden: true },
      ...Array.from({ length: MICRO_SLOTS }, (_v, i) => ({
        index: MD_HELPER_COL + 1 + i,
        width: 6,
        hidden: true,
      })),
    ],
    regions: [
      // --- 졸업 요건 현황 (section title + summary, cols A:I) ---
      title('졸업 요건 현황', {
        at: summaryTitleRow,
        height: 20,
        style: 'label',
      }),
      block([labelRow, valueRow, reqRow, verdictRow], {
        at: summaryBlockRow,
        startCol: 1,
      }),

      // --- 교양 영역 의무이수 현황 (below the summary, col A) ---
      block([[{ value: '교양 영역 의무이수 현황', style: 'label' }]], {
        at: areaLabelRow,
        startCol: 1,
      }),
      block([areaHeaderRow, ...areaRows], {
        at: areaHeaderRowNum,
        startCol: 1,
      }),

      // --- 학생 정보 (baked, visible, read-only) right of the 교양 영역 table ---
      block([[{ value: '학생 정보', style: 'label' }]], {
        at: areaLabelRow,
        startCol: STUDENT_INFO_COL,
      }),
      block(
        [
          [
            { value: '입학연도', style: 'header' },
            {
              name: NAME.entryYear,
              value: student.entryYear,
              style: 'computed',
              numFmt: '0',
              locked: true,
            },
          ],
          [
            { value: '주전공', style: 'header' },
            {
              name: NAME.primaryMajor,
              value: primary.displayName,
              style: 'computed',
              locked: true,
            },
          ],
        ],
        { at: areaHeaderRowNum, startCol: STUDENT_INFO_COL },
      ),

      // --- 다중전공 이수 현황 (bottom, col A) ---
      ...(secondaries.length > 0
        ? [
            block([[{ value: '다중전공 이수 현황', style: 'label' }]], {
              at: secondaryLabelRow,
              startCol: SECONDARY_COL,
            }),
            block([secondaryHeaderRow, ...secondaryRows], {
              at: secondaryLabelRow + 1,
              startCol: SECONDARY_COL,
            }),
          ]
        : []),

      // --- 마이크로디그리 이수 현황 (below 다중전공, col A) ---
      // 마이크로디그리는 졸업요건이 아니라 참고용 (운영 지침 제9조).
      block([[{ value: '마이크로디그리 이수 현황', style: 'label' }]], {
        at: microLabelRow,
        startCol: SECONDARY_COL,
      }),
      block([microHeaderRow, ...microRows], {
        at: microHeaderRowNum,
        startCol: SECONDARY_COL,
      }),

      // --- 이수 과목 입력 (right of the summary, cols K:R) ---
      block([[{ value: '이수 과목 입력', style: 'label' }]], {
        at: inputTitleRow,
        startCol: INPUT_COL,
      }),

      // --- 학년·학기별 이수 현황 (further right, following the input table) ---
      block([[{ value: '학년·학기별 이수 현황', style: 'label' }]], {
        at: inputTitleRow,
        startCol: BREAKDOWN_COL,
      }),
      table<Entry>({
        at: inputTableRow,
        startCol: BREAKDOWN_COL,
        reservedRows: BREAKDOWN_RESERVED,
        columns: [
          {
            header: '학년',
            width: 8,
            style: 'input',
            name: BCOL.year,
            dropdown: [...YEARS],
            locked: false,
          },
          {
            header: '학기',
            width: 12,
            style: 'input',
            name: BCOL.semester,
            dropdown: [...BREAKDOWN_SEMESTERS],
            locked: false,
          },
          {
            header: '이수학점',
            width: 10,
            style: 'computed',
            numFmt: '0',
            name: BCOL.credits,
            locked: false,
            formula: (_e, r, cell) =>
              breakdownCreditsExpr(
                r,
                cell.col(BCOL.year),
                cell.col(BCOL.semester),
              ),
          },
          {
            header: '평균평점',
            width: 10,
            style: 'computed',
            numFmt: '0.00',
            name: BCOL.average,
            locked: false,
            formula: (_e, r, cell) =>
              breakdownAverageExpr(
                r,
                cell.col(BCOL.year),
                cell.col(BCOL.semester),
              ),
          },
        ],
        rows: blankRows(BREAKDOWN_RENDERED),
      }),

      table<Entry>({
        at: inputTableRow,
        startCol: INPUT_COL,
        reservedRows: INPUT_RESERVED,
        columns: [
          {
            header: '학년',
            width: 8,
            style: 'input',
            name: COL.year,
            dropdown: [...YEARS],
            locked: false,
          },
          {
            header: '학기',
            width: 12,
            style: 'input',
            name: COL.semester,
            dropdown: [...SEMESTERS],
            locked: false,
          },
          {
            header: '코드',
            width: 12,
            style: 'input',
            name: COL.code,
            locked: false,
          },
          {
            header: '교과목명',
            width: 30,
            style: 'computed',
            name: COL.title,
            locked: false,
            formula: (_e, _r, cell: ColumnRefs) =>
              autoFillChain(majors, cell.col(COL.code), LOOKUP_COL.title, '""'),
          },
          {
            header: '학점',
            width: 8,
            style: 'computed',
            numFmt: '0',
            name: COL.credits,
            locked: false,
            formula: (_e, _r, cell: ColumnRefs) =>
              autoFillChain(
                majors,
                cell.col(COL.code),
                LOOKUP_COL.credits,
                '""',
              ),
          },
          {
            header: '등급',
            width: 10,
            style: 'input',
            name: COL.grade,
            dropdown: GRADE_OPTIONS,
            locked: false,
          },
          {
            header: '평점',
            width: 10,
            style: 'computed',
            numFmt: '0.0',
            name: COL.points,
            locked: false,
            formula: (_e, _r, cell) =>
              `IFERROR(${cell.col(COL.credits)}*${vlookup(cell.col(COL.grade), NAME.gradeTable, 2)},0)`,
          },
          {
            // Auto-categorized from the code across the major lookup chain (주전공
            // first), then 교양; unknown codes fall back to 일선. Editable.
            header: '이수구분',
            width: 12,
            style: 'computed',
            name: COL.category,
            locked: false,
            formula: (_e, _r, cell: ColumnRefs) =>
              autoFillChain(
                majors,
                cell.col(COL.code),
                LOOKUP_COL.reqCategory,
                `"${CATEGORY.genSelect}"`,
              ),
          },
        ],
        rows: blankRows(INPUT_RENDERED),
      }),

      // --- Hidden helpers (유효 | 세부영역 | 소속전공 | 중복대상전공), cols U:X ---
      table<Entry>({
        at: inputTableRow,
        startCol: HELPER_COL,
        reservedRows: INPUT_RESERVED,
        columns: [
          {
            header: '유효',
            width: 6,
            style: 'computed',
            numFmt: '0',
            name: COL.valid,
            locked: false,
            formula: (_e, r, cell) => {
              const code = cell.rowCell(COL.code);
              const down = r.refColumnDownFrom(COL.code, code);
              return `IF(${code}="","",IF(COUNTIF(${down},${code})=1,1,0))`;
            },
          },
          {
            header: '세부영역',
            width: 12,
            style: 'computed',
            name: COL.subArea,
            locked: false,
            formula: (_e, _r, cell) => {
              const code = cell.rowCell(COL.code);
              return `IF(${code}="","",IFERROR(${vlookup(code, NAME.genEduLookup, LOOKUP_COL.subArea)},""))`;
            },
          },
          {
            // Major key whose lookup first claimed this 코드 (주전공 first), "" for
            // 교양/unknown. Drives per-major credit attribution.
            header: '소속전공',
            width: 10,
            style: 'computed',
            name: COL.owner,
            locked: false,
            formula: (_e, _r, cell) =>
              ownerChain(majors, cell.rowCell(COL.code)),
          },
          {
            // Secondary major key this 주전공-owned 코드 is 중복인정 대상으로 매칭되는
            // 전공, else "". Drives the 주전공↔복수/부전공 중복인정 상한 (9/6).
            header: '중복대상전공',
            width: 12,
            style: 'computed',
            name: COL.dupTarget,
            locked: false,
            formula: (_e, _r, cell) =>
              dupTargetChain(
                cell.rowCell(COL.owner),
                primary.key,
                secondaries,
                cell.rowCell(COL.code),
              ),
          },
        ],
        rows: blankRows(INPUT_RENDERED),
      }),

      // --- Hidden 마이크로디그리 helpers: 코드→연번목록 + per-slot 소속 flag 열 ---
      // These sit row-for-row alongside the 이수 과목 입력 table so a slot's SUMIFS
      // over a flag column matches the credits/points/grade columns on the same
      // rows. The flag is 1 only when the row is 유효 and its 코드 belongs to the
      // 디그리 chosen in that slot's 디그리명 cell.
      table<Entry>({
        at: inputTableRow,
        startCol: MD_HELPER_COL,
        reservedRows: INPUT_RESERVED,
        columns: [
          {
            header: '연번목록',
            width: 14,
            style: 'computed',
            name: MD_LIST_COL,
            locked: false,
            formula: (_e, _r, cell) => {
              const code = cell.rowCell(COL.code);
              return `IF(${code}="","",IFERROR(${vlookup(code, NAME.microDegreeCodeList, MD_CODE_LOOKUP_COL.noList)},""))`;
            },
          },
          ...Array.from({ length: MICRO_SLOTS }, (_v, slot) => ({
            header: `md${slot}`,
            width: 6,
            style: 'computed' as const,
            numFmt: '0',
            name: mdFlagCol(slot),
            locked: false,
            formula: (_e: Entry, r: RefApi, cell: ColumnRefs) =>
              mdFlagExpr(
                cell.rowCell(COL.code),
                cell.rowCell(COL.valid),
                cell.rowCell(MD_LIST_COL),
                r.ref(mdNameCell(slot)),
              ),
          })),
        ],
        rows: blankRows(INPUT_RENDERED),
      }),
    ],
    protect: {},
  });
}
