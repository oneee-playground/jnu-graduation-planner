/**
 * 마이크로디그리 (micro-degree) catalog — the currently-running micro-degrees
 * from 전남대학교 마이크로디그리 운영 지침 [별표1]. Read-only reference data
 * (micro-degrees are NOT a graduation requirement — 지침 제9조). Pure (no Node
 * APIs) so it runs in the browser bundle as well as the CLI.
 */

/** One 편성 교과목 within a micro-degree. */
export interface MicroDegreeCourse {
  /** 교과목코드, e.g. "CIS9017". */
  code: string;
  /** 교과목명. */
  title: string;
  /** 학점. */
  credits: number;
}

/** One micro-degree from [별표1] 마이크로디그리 운영 현황. */
export interface MicroDegree {
  /** 연번 (1-based order in the 별표). */
  no: number;
  /** 디그리명, e.g. "AI초급활용 마이크로디그리". */
  name: string;
  /** 이수기준, e.g. "편성 교과목(6과목) 중 12학점(4과목) 이수". */
  criteria: string;
  /** 개설시기, e.g. "2022. 2학기". */
  term: string;
  /** 편성 교과목 목록 (source order preserved). */
  courses: MicroDegreeCourse[];
}

/** The 마이크로디그리 catalog file shape (data/microdegree.json). */
export interface MicroDegreeCatalog {
  /** Provenance string for the reference/manual sheets. */
  source: string;
  degrees: MicroDegree[];
}

/**
 * Required credits for a micro-degree, parsed from its 이수기준 string. Every
 * 별표1 criterion embeds the credit requirement as "N학점" (e.g. "편성 교과목(6과목)
 * 중 12학점(4과목) 이수" -> 12). Throws if no "N학점" token is present so a data
 * change that breaks the convention fails loudly at build time.
 */
export function requiredCredits(degree: MicroDegree): number {
  const m = degree.criteria.match(/(\d+)\s*학점/);
  if (!m) {
    throw new Error(
      `Micro-degree "${degree.name}" (no=${degree.no}): cannot parse 필요학점 from 이수기준 "${degree.criteria}"`,
    );
  }
  return Number(m[1]);
}

/** Validates a parsed 마이크로디그리 catalog object, throwing on malformation. */
export function assertMicroDegreeCatalog(
  value: unknown,
  source: string,
): MicroDegreeCatalog {
  const c = value as Partial<MicroDegreeCatalog>;
  if (!c || typeof c !== 'object') {
    throw new Error(
      `Malformed micro-degree catalog (${source}): not an object`,
    );
  }
  if (!Array.isArray(c.degrees)) {
    throw new Error(
      `Malformed micro-degree catalog (${source}): degrees is not an array`,
    );
  }
  for (const d of c.degrees as MicroDegree[]) {
    if (
      typeof d?.no !== 'number' ||
      typeof d.name !== 'string' ||
      !Array.isArray(d.courses)
    ) {
      throw new Error(
        `Malformed micro-degree catalog (${source}): bad degree entry near no=${d?.no}`,
      );
    }
  }
  return c as MicroDegreeCatalog;
}
