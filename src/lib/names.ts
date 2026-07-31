/**
 * Central registry of sheet titles and workbook-level defined names (named
 * ranges). Keeping these in one place avoids typo-prone string literals
 * scattered across sheet builders and makes cross-sheet formulas readable.
 */

/** Sheet titles (Korean, as shown to the end user). */
export const SHEET = {
  dashboard: '대시보드',
  genEdu: '교양',
  microDegree: '마이크로디그리',
  /** Visible sheet holding lookup tables and the university-wide GPA minimum. */
  reference: '참조',
} as const;

/**
 * University-/student-level workbook defined names (singletons). Per-major
 * threshold and lookup names are NOT here -- they are scoped per major sheet via
 * {@link majorName} / {@link majorLookupName} so multiple major sheets can
 * coexist without name collisions.
 */
export const NAME = {
  /** 2-column table: grade text -> grade point. */
  gradeTable: 'GradeTable',
  /**
   * 교양 code-first course lookup (코드 | 이수구분 | 교과목명 | 학점 | 학년 | 세부영역).
   * The dashboard VLOOKUPs every major sheet's lookup first (주전공 우선), then this.
   */
  genEduLookup: 'GenEduLookup',
  /**
   * Single cell: 교양최대인정학점. 교양 이수학점은 30~45학점 범위이며 45학점(학과별
   * 예외 있음)을 초과하면 졸업소요학점(교양)으로 인정하지 않는다 — 교육과정 편성 및
   * 운영 지침 제10조①. 학과 기준학점 초과분은 교양최대인정학점 범위 내에서 일반선택
   * 학점으로 인정한다 — 제10조①6.
   */
  reqGenMax: 'ReqGenMax',
  /**
   * Single cell: 교양 인정학점 하한 (졸업요건). 교양 이수학점은 입학연도 교육과정
   * 버전의 하한 이상이어야 한다 — 교육과정 편성 및 운영 지침 제10조①. 학과별 예외가
   * 있으면 주전공 카탈로그 값으로 override 된다.
   */
  reqGenMin: 'ReqGenMin',
  /**
   * Single cell: minimum cumulative GPA required to graduate. University-wide
   * (전 교과목 성적평균평점 1.75 이상 — 졸업(수료)사정 지침 졸업대상자 공통요건 / 학칙
   * 제59조), so it lives on the 참조 sheet, not per-major.
   */
  reqMinGpa: 'ReqMinGpa',
  /** Single cell: student's 입학연도 (교양 영역 지정 cohort reference). */
  entryYear: 'EntryYear',
  /** Single cell: student's 계열 (이공/인문사회/예체능) for 계열별 교양 의무이수. */
  track: 'Track',
  /** Single cell: 주전공 학과/전공명 (표시용, 읽기 전용). */
  primaryMajor: 'PrimaryMajor',
  /**
   * 주전공↔복수·연계전공 중복인정 상한 (9학점). 복수전공규정 제10조 / 부·복수·연계전공
   * 이수 지침 제9조②③. 역할별로 고정된 값이므로 각 전공 시트가 아니라 참조 시트에 둔다.
   */
  reqDupCapDouble: 'ReqDupCapDouble',
  /** 주전공↔부전공 중복인정 상한 (6학점). 부·복수·연계전공 이수 지침 제9조② (및 제17조③). */
  reqDupCapMinor: 'ReqDupCapMinor',
  /**
   * 마이크로디그리 이름 → (연번 | 필요학점) 룩업 (숨김). 대시보드 마이크로디그리 이수
   * 현황 블록이 사용자가 고른 디그리명으로 필요학점·연번을 조회한다.
   */
  microDegreeLookup: 'MicroDegreeLookup',
  /** 마이크로디그리 이름 단일 열 목록 (숨김) — 대시보드 드롭다운 데이터 검증용 범위. */
  microDegreeNameList: 'MicroDegreeNameList',
  /**
   * 교과목코드 → 소속 디그리 연번 목록 문자열 룩업 (숨김). 값은 ",1,5,23," 처럼 앞뒤와
   * 사이를 콤마로 감싼 연번열이라, 특정 연번 N의 소속 여부를 SEARCH(",N,", ...) 로
   * 부분일치 검사할 수 있다 (한 과목이 여러 디그리에 편성될 수 있으므로).
   */
  microDegreeCodeList: 'MicroDegreeCodeList',
} as const;

/**
 * Per-major threshold field keys. Each maps to a scoped workbook defined name
 * via {@link majorName}. Not every field applies to every role: 부전공/연계전공
 * sheets primarily use `secondMajor`/`minorCredits`; 주전공 uses the full set.
 */
export const MAJOR_FIELD = {
  genReq: 'ReqGenReq',
  genElec: 'ReqGenElec',
  majorReq: 'ReqMajorReq',
  majorElec: 'ReqMajorElec',
  majorAdv: 'ReqMajorAdv',
  genSelect: 'ReqGenSelect',
  total: 'ReqTotalCredits',
  /**
   * 복수/연계전공 최소 이수학점 = 대상 전공의 전공인정학점(전필+전선). 전공심화는
   * 단일전공 전용 요건(교육과정편성 제14조②③)이라 복수전공으로 이수할 때는 제외되므로
   * 전공기본소계(전필+전선)만 이수하면 된다 (복수전공규정 제9조, 학칙 제50조①).
   */
  secondMajor: 'ReqSecondMajor',
  /** 부전공 최소 이수학점 (교육과정편성 제17조②: 21 이상). */
  minorCredits: 'ReqMinorCredits',
} as const;

export type MajorField = keyof typeof MAJOR_FIELD;

/**
 * Scoped defined name for a major's threshold field, e.g.
 * majorName('major0', 'majorReq') -> "ReqMajorReq_major0". The `key` is a major
 * input's unique slug.
 */
export function majorName(key: string, field: MajorField): string {
  return `${MAJOR_FIELD[field]}_${key}`;
}

/** Scoped defined name for a major's hidden code-first lookup range. */
export function majorLookupName(key: string): string {
  return `MajorLookup_${key}`;
}

/**
 * 이수구분 (credit category) labels. These are the buckets a completed course is
 * sorted into for the per-category graduation check. The first six are real
 * 교과구분; unmatched codes fall back to 일반선택 in the dashboard.
 *
 * Note: 마이크로디그리 is intentionally absent -- per the 마이크로디그리 운영 지침
 * (제9조) it is an optional certificate, NOT a graduation requirement; its
 * courses count toward graduation under their normal 교과구분.
 */
export const CATEGORY = {
  genReq: '교필',
  genElec: '교선',
  majorReq: '전필',
  majorElec: '전선',
  majorAdv: '전공심화',
  genSelect: '일선',
  /**
   * 복수/부/연계전공 과목. A row is attributed to a specific major via the hidden
   * 소속전공 helper (which major's lookup first claimed the 코드), not by this
   * label; this label is kept for backward compatibility / manual tagging.
   */
  secondMajor: '복선',
} as const;

/**
 * 세부전공(비고) 특수값: 학부 전 트랙에 공통인 과목. 이 값이거나 빈 문자열이면 선택한
 * 세부전공과 무관하게 항상 요건 대상이다.
 */
export const TRACK_COMMON = '공통';
