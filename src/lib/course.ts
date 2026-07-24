/** One 교양 curriculum course row. */
export interface Course {
  /** 교양영역 / top-level category, e.g. "역량교양". */
  category: string;
  /** 세부영역 / sub-category, e.g. "창의". */
  subCategory: string;
  /** 교과목코드 / course code, e.g. "CLT0080". */
  code: string;
  /** 교과목명 / course title. */
  title: string;
  /** 학점 / credit hours. */
  credits: number;
  /**
   * 이수구분 / credit-requirement category (교필/교선/전필/전선/전공심화/일반선택).
   * Drives the per-category graduation check via the CourseCategory lookup.
   */
  reqCategory: string;
  /**
   * 권장 학년 / recommended year-level (1~6). The 교양 catalog does not encode it,
   * so it is blank for 교양 courses; users fill it on the 참조 lookup for codes
   * they want auto-filled. (수업연한: 4년, 의/약/수의 6년 — 학칙 제20조.)
   */
  year?: number;
}

/**
 * One 주전공 curriculum course, laid out like a department 교육과정 표
 * (학년 | 학기 | 이수구분 | 교과목명 | 코드 | 학점).
 */
export interface MajorCourse {
  /** 권장 학년 (1~6); 0 은 전체학년 (특정 학년 없이 전 학년 개설). */
  year: number;
  /** 학기: 1 | 2 (정규); 0 은 전체(학기 무관). 계절학기는 편성표에 없어 정규만 담는다. */
  term: number;
  /** 이수구분 (교필/교선/전필/전선/전공심화/일선). */
  reqCategory: string;
  /** 교과목명. */
  title: string;
  /** 교과목코드. */
  code: string;
  /** 학점. */
  credits: number;
  /**
   * 비고 / remark (display-only). For 전자컴퓨터공학부 marks the owning track(s):
   * "공통" or a comma-joined track list (e.g. "전자공학, 시스템반도체"). Does NOT
   * affect graduation logic — {@link reqCategory} remains the driver.
   */
  note?: string;
}
