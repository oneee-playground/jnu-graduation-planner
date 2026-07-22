import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { CATEGORY } from './names.js';

/** One curriculum course row from the source CSV (no header line). */
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
   * 권장 학년 / recommended year-level (1~6). The bundled 교양 CSV does not encode
   * it, so it is blank for CSV courses; users fill it on the 참조 lookup for
   * codes they want auto-filled. (수업연한: 4년, 의/약/수의 6년 — 학칙 제20조.)
   */
  year?: number;
}

/**
 * Default 이수구분 for a curriculum 교양 course. 교양필수 is designated per
 * department (영역별/학과별 필수), which the bundled CSV does not encode, so every
 * CSV 교양 course defaults to 교선(교양선택). Users override specific codes to 교필
 * in the 참조 lookup table.
 */
export const DEFAULT_GENEDU_REQ_CATEGORY: string = CATEGORY.genElec;

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

/**
 * Reads a headerless 주전공 curriculum CSV in the project format:
 * `year,term,reqCategory,title,code,credits[,note]`. The trailing 비고(note)
 * column is optional for back-compat with 6-column files.
 */
export function readMajorCourses(path: string): MajorCourse[] {
  const raw = readFileSync(path, 'utf-8');
  const rows = parse(raw, { skip_empty_lines: true, trim: true }) as string[][];

  return rows.map((row, i) => {
    const [year, term, reqCategory, title, code, credits, note] = row;
    if (
      year === undefined ||
      term === undefined ||
      reqCategory === undefined ||
      title === undefined ||
      code === undefined ||
      credits === undefined
    ) {
      throw new Error(
        `Malformed 주전공 CSV row ${i + 1} in ${path}: expected 6-7 columns, got ${row.length}`,
      );
    }
    const yearNum = Number(year);
    const termNum = Number(term);
    const creditsNum = Number(credits);
    if (Number.isNaN(yearNum) || Number.isNaN(termNum)) {
      throw new Error(
        `Invalid 학년/학기 "${year}/${term}" on 주전공 CSV row ${i + 1} in ${path}`,
      );
    }
    if (Number.isNaN(creditsNum)) {
      throw new Error(
        `Invalid credits "${credits}" on 주전공 CSV row ${i + 1} in ${path}`,
      );
    }
    return {
      year: yearNum,
      term: termNum,
      reqCategory,
      title,
      code,
      credits: creditsNum,
      note: note ?? '',
    };
  });
}

/**
 * Reads a headerless curriculum CSV in the project format:
 * `category,subCategory,code,title,credits`.
 */
export function readCourses(path: string): Course[] {
  const raw = readFileSync(path, 'utf-8');
  const rows = parse(raw, {
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  return rows.map((row, i) => {
    const [category, subCategory, code, title, credits] = row;
    if (
      category === undefined ||
      subCategory === undefined ||
      code === undefined ||
      title === undefined ||
      credits === undefined
    ) {
      throw new Error(
        `Malformed CSV row ${i + 1} in ${path}: expected 5 columns, got ${row.length}`,
      );
    }
    const creditsNum = Number(credits);
    if (Number.isNaN(creditsNum)) {
      throw new Error(
        `Invalid credits "${credits}" on CSV row ${i + 1} in ${path}`,
      );
    }
    return {
      category,
      subCategory,
      code,
      title,
      credits: creditsNum,
      reqCategory: DEFAULT_GENEDU_REQ_CATEGORY,
    };
  });
}
