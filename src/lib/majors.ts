/**
 * Multi-major domain model. A generated workbook is configured (at build time,
 * from the website form) by a {@link GenerateConfig}: student-level constants
 * plus an ordered list of majors, each of which becomes its own sheet.
 *
 * Legal basis: 학칙 제50조 (복수전공 등), 교육과정편성 제14·16~20조. A student is either
 * a 단일전공 이수자 (must earn 전공심화 ≥21) or pursues one or more of 복수전공 / 연계전공
 * / 부전공. 연계전공 is a 복수전공-class second major (학칙 제50조①), so it is unlimited
 * like 복수전공; 부전공 is limited to at most one.
 */

import type { MajorCourse } from './csv.js';

/** 전공 이수 방식 / a major's role in the student's degree plan. */
export type MajorRole = '주전공' | '복수전공' | '부전공' | '연계전공';

export const MAJOR_ROLES: readonly MajorRole[] = [
  '주전공',
  '복수전공',
  '부전공',
  '연계전공',
];

/**
 * Per-major graduation thresholds, taken from the major's catalog (not chosen by
 * the user). The 주전공's `minGpa`/`genMax` govern the whole workbook.
 */
export interface MajorThresholds {
  /** 교양필수. */
  genReq: number;
  /** 교양선택. */
  genElec: number;
  /** 전공필수. */
  majorReq: number;
  /** 전공선택. */
  majorElec: number;
  /** 전공심화 (단일전공 only; ignored when the student has extra majors). */
  majorAdv: number;
  /** 일반선택. */
  genSelect: number;
  /** 졸업 총학점. */
  total: number;
  /**
   * 졸업 최소 평점평균 (학칙 제58조). Determined by the department, not the user;
   * the 주전공's value is used for the workbook. Typically 1.75.
   */
  minGpa: number;
  /**
   * 교양최대인정학점 (교육과정편성 제10조; 기본 45). Determined by the department, not
   * the user; the 주전공's value is used for the workbook.
   */
  genMax: number;
  /**
   * 복수/연계전공 최소 이수학점 = 대상 전공의 전공인정학점 = 전공기본소계(전필+전선).
   * 전공심화는 단일전공 전용 요건이므로 복수전공으로 이수할 때는 포함하지 않는다
   * (복수전공규정 제9조, 학칙 제50조①). 시트에서는 majorReq+majorElec 로 계산하므로
   * 이 필드는 카탈로그 데이터의 참고값이다. only meaningful for 복수전공/연계전공 roles.
   */
  secondMajor?: number;
  /** 부전공 최소 이수학점 (only meaningful for 부전공 role; 21 이상). */
  minorCredits?: number;
}

/**
 * 주전공과의 중복인정 상한 (학점) by role. 주↔복수·연계 최대 9학점, 주↔부전공 최대 6학점
 * (복수전공규정 제10조, 부·복수·연계전공 이수 지침 제9조②③). 주전공(0) 자신은 상한 개념이
 * 없으므로 0. 역할별로 고정된 값이라 각 전공 시트가 아니라 참조 시트에 상수로 baked 되며
 * (NAME.reqDupCapDouble / reqDupCapMinor), 대시보드가 역할에 맞는 값을 참조한다.
 */
export function dupCapForRole(role: MajorRole): number {
  switch (role) {
    case '부전공':
      return 6;
    case '복수전공':
    case '연계전공':
      return 9;
    case '주전공':
    default:
      return 0;
  }
}

/** One major to render as a sheet, produced from a catalog + form overrides. */
export interface MajorInput {
  /** Unique slug used to scope this major's defined names (e.g. "major0"). */
  key: string;
  /** The major's role in the student's plan. */
  role: MajorRole;
  /** Human display name, e.g. "전자컴퓨터공학부". */
  displayName: string;
  /** Sheet title (must be unique across the workbook). */
  sheetName: string;
  /** Graduation thresholds (from catalog defaults, possibly form-overridden). */
  thresholds: MajorThresholds;
  /**
   * 세부전공 목록 (학부만 해당). Empty for a single 학과. Drives whether the
   * 세부전공 column renders and whether a track had to be chosen.
   */
  tracks: string[];
  /**
   * 사용자가 선택한 세부전공 (학부일 때만). 공통 + 이 트랙 소속 전필이 필수 과목이 된다.
   * 단일 학과이거나 미선택이면 undefined (모든 전필이 필수).
   */
  selectedTrack?: string;
  /** 교육과정 course list (drives the catalog + hidden lookup). */
  courses: MajorCourse[];
}

/**
 * Student-level constants baked into the workbook (visible, read-only). The GPA
 * minimum and 교양최대인정학점 are NOT here -- they are per-major (taken from the
 * 주전공's {@link MajorThresholds}).
 */
export interface StudentInfo {
  /** 입학연도 (교양 영역 지정 cohort reference). */
  entryYear: number;
  /** 계열 (이공계열/인문사회계열/예체능계열). */
  track: string;
}

/** Full build-time configuration for one generated workbook. */
export interface GenerateConfig {
  student: StudentInfo;
  /** Ordered majors; index 0 must be the 주전공. */
  majors: MajorInput[];
}

/** True if the plan has any 복수/부/연계전공 (i.e. NOT a pure 단일전공). */
export function hasSecondaryMajors(config: GenerateConfig): boolean {
  return config.majors.some((m) => m.role !== '주전공');
}

/** The single 주전공 (index 0 by contract). */
export function primaryMajor(config: GenerateConfig): MajorInput {
  return config.majors[0]!;
}

/** Majors other than the 주전공, in declaration order. */
export function secondaryMajors(config: GenerateConfig): MajorInput[] {
  return config.majors.slice(1);
}

/**
 * Validates the multi-major invariants:
 *  · exactly one 주전공, and it must be first;
 *  · 복수전공 / 부전공 / 연계전공 are unlimited (학칙 제50조 / 부·복수·연계전공 이수 지침에
 *    학생이 이수할 수 있는 부전공 개수를 제한하는 조항이 없다);
 *  · unique keys and sheet names.
 * Throws on violation.
 */
export function validateConfig(config: GenerateConfig): void {
  const { majors } = config;
  if (majors.length === 0) {
    throw new Error('At least one major (주전공) is required.');
  }
  const primaries = majors.filter((m) => m.role === '주전공');
  if (primaries.length !== 1) {
    throw new Error(`Exactly one 주전공 is required, got ${primaries.length}.`);
  }
  if (majors[0]!.role !== '주전공') {
    throw new Error('The 주전공 must be the first major in the list.');
  }
  const keys = new Set<string>();
  const sheets = new Set<string>();
  for (const m of majors) {
    if (keys.has(m.key)) throw new Error(`Duplicate major key: ${m.key}`);
    if (sheets.has(m.sheetName)) {
      throw new Error(`Duplicate major sheet name: ${m.sheetName}`);
    }
    keys.add(m.key);
    sheets.add(m.sheetName);
  }
}
