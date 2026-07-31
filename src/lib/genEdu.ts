/**
 * 교양(general-education) domain model: entry-year-versioned rule sets +
 * per-semester offering lists.
 *
 * 졸업요건(교양)은 입학연도가 속한 4년 교육과정 버전에 따라 결정된다 — 교과목 이수는
 * 입학년도 교육과정을 따라야 한다(전남대학교 교육과정 안내). 한 버전은 (a) 교양 영역
 * 의무이수 규칙, (b) 교양 인정학점 하한·상한(genMin/genMax), (c) 그 버전 기간에 개설된
 * 교양 교과목 편성목록(학기별)로 구성된다.
 *
 * 편성목록 파일 1개 = 한 학기의 전체 개설 교양과목이다(연도/학기 열이 파일 안에 없다).
 * 데이터가 있는 학기만 시트에 표로 렌더링되며, 파일을 추가하면 학기 표가 자동으로 늘어난다.
 *
 * 지금은 2023~2026 버전 하나만 데이터가 채워져 있으나, 로더/타입은 여러 버전을 전제로
 * 설계되어 2019~2022·2015~2018·2027~2030 등은 데이터 폴더만 추가하면 동작한다.
 */

import { TRACKS } from './tracks.js';
import type { Course } from './course.js';

/**
 * 교양 영역 의무이수 요건 한 항목. 근거: 전남대학교 교육과정 편성 및 운영 지침(2024.12.31.)
 * 제10조② (영역별 교양필수), 제10조③ (인문학 교양), 제10조④ (계열별 의무이수).
 * 세부영역명은 제8조① 및 교양교과목 편성목록(입학자별 교양 영역 지정 내역)을 따른다.
 */
export interface AreaReq {
  /** Stable key (used only to disambiguate rows). */
  key: string;
  /** 표에 표시되는 요건 이름 (예: "역량-창의", "이공-기초과학"). */
  label: string;
  /** 이 요건에 합산되는 세부영역 이름들 (교양 세부영역). */
  subAreas: string[];
  /** 최소 이수학점. */
  required: number;
  /**
   * 계열 한정 요건이면 해당 계열. 없으면 전 계열 공통. 값은 {@link TRACKS} 중 하나여야
   * 한다(로더가 검증).
   */
  track?: (typeof TRACKS)[number];
}

/**
 * 한 교육과정 버전의 교양 졸업요건 규칙. genMin/genMax 는 교양 인정학점의 하한·상한
 * (교육과정 편성 및 운영 지침 제10조). 학과별 예외(간호·공학인증 등)는 전공 카탈로그의
 * `thresholds.genMax` override 로 처리한다.
 */
export interface GenEduRules {
  /** 교양 인정학점 하한 (졸업요건). */
  genMin: number;
  /** 교양최대인정학점 상한 (초과분은 일반선택으로 인정 / 미인정). */
  genMax: number;
  /** 교양 영역 의무이수 요건 목록. */
  areaReqs: AreaReq[];
}

/** 한 학기의 개설 교양과목 목록 (편성목록 파일 하나에 대응). */
export interface GenEduSemester {
  /** 표 제목으로 쓰이는 학기 라벨 (예: "2026학년도 1학기"). */
  label: string;
  /** 이 학기 개설 교양 교과목. */
  courses: Course[];
}

/**
 * 입학연도 버전 하나의 로딩된 데이터: 규칙 + 학기별 편성목록 + 대시보드 자동완성용
 * 통합 룩업(모든 학기 과목의 합집합, 코드 중복 제거).
 */
export interface GenEduVersionData {
  /** 버전 식별자 (예: "2023-2026"). */
  version: string;
  /** 이 버전이 적용되는 입학연도 범위. */
  entryYearFrom: number;
  entryYearTo: number;
  /** 교양 졸업요건 규칙. */
  rules: GenEduRules;
  /** 데이터가 있는 학기들 (표로 렌더링). */
  semesters: GenEduSemester[];
  /**
   * 대시보드가 참조하는 단일 통합 룩업(코드→과목). 모든 학기 과목의 합집합이며 코드가
   * 중복되면 먼저 나온 학기(최신 순 정렬 후 첫 등장)를 유지한다. 학기 표가 여러 개여도
   * 자동완성/세부영역 판정은 이 하나의 목록으로만 이루어진다.
   */
  lookup: Course[];
  /**
   * 요청 입학연도에 정확히 대응하는 버전이 없어 폴백으로 최신 버전을 사용한 경우 true.
   * (미래 입학연도 등. 사용자에게 안내 문구를 띄우는 데 쓸 수 있다.)
   */
  fallback: boolean;
}

/** 교양 버전 인덱스 항목 (data/교양/index.json 의 한 원소). */
export interface GenEduIndexEntry {
  version: string;
  entryYearFrom: number;
  entryYearTo: number;
  /** data/교양/ 아래의 버전 디렉터리 이름. */
  dir: string;
  /** 규칙 파일명 (버전 디렉터리 기준 상대). */
  rules: string;
  /** 학기별 편성목록 파일들. */
  semesters: { label: string; file: string }[];
}

/**
 * 인덱스에서 입학연도에 맞는 버전을 고른다. 정확히 포함하는 버전이 있으면 그것을,
 * 없으면 가장 최신(entryYearFrom 최대) 버전을 폴백으로 반환한다. 폴백 여부를 함께 준다.
 */
export function selectVersion(
  index: GenEduIndexEntry[],
  entryYear: number,
): { entry: GenEduIndexEntry; fallback: boolean } {
  if (index.length === 0) {
    throw new Error('교양 버전 인덱스가 비어 있습니다.');
  }
  const exact = index.find(
    (e) => entryYear >= e.entryYearFrom && entryYear <= e.entryYearTo,
  );
  if (exact) return { entry: exact, fallback: false };
  const latest = index.reduce((a, b) =>
    b.entryYearFrom > a.entryYearFrom ? b : a,
  );
  return { entry: latest, fallback: true };
}

/** 여러 학기 과목의 합집합(코드 중복 제거, 먼저 나온 것 유지). */
export function unionByCode(semesters: GenEduSemester[]): Course[] {
  const seen = new Set<string>();
  const out: Course[] = [];
  for (const sem of semesters) {
    for (const c of sem.courses) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      out.push(c);
    }
  }
  return out;
}
