/**
 * Major catalog JSON — the shipped, selectable per-major data. Pure (no Node
 * APIs) so it runs in the browser bundle as well as the CLI.
 *
 * A catalog holds a department's display name, default graduation thresholds,
 * and its 교육과정 course list. The website form turns one or more catalogs
 * (with a chosen role + optional threshold overrides) into {@link MajorInput}s.
 */

import type { MajorCourse } from './course.js';
import type { MajorInput, MajorRole, MajorThresholds } from './majors.js';

/** Course row as stored in catalog JSON (mirrors {@link MajorCourse}). */
export interface CatalogCourse {
  year: number;
  term: number;
  reqCategory: string;
  title: string;
  code: string;
  credits: number;
  /** 비고 / remark (display-only track membership, e.g. "공통"). */
  note?: string;
}

/** One selectable major catalog (JSON file under website/data/majors/). */
export interface MajorCatalog {
  /** Stable slug, e.g. "electronic-engineering". Used to build a major key. */
  id: string;
  /** Human display name, e.g. "전자컴퓨터공학부". */
  displayName: string;
  /** Default graduation thresholds (form-overridable). */
  defaultThresholds: MajorThresholds;
  /**
   * 세부전공 목록. Present only for a 학부 (division with self-selected tracks,
   * 전공자율선택제); omit or empty for a single 학과. When present, a course's
   * {@link CatalogCourse.note} names the owning track(s) (or "공통"), and the
   * user picks one track whose 전필 (plus 공통) become the required courses.
   */
  tracks?: string[];
  /** 교육과정 course list. */
  courses: CatalogCourse[];
}

/** Entry in the catalog index (website/data/majors/index.json). */
export interface CatalogIndexEntry {
  id: string;
  displayName: string;
  /** Path (relative to the index) to the catalog JSON. */
  file: string;
}

/** Validates the shape of a parsed catalog object, throwing on malformation. */
export function assertCatalog(value: unknown, source: string): MajorCatalog {
  const c = value as Partial<MajorCatalog>;
  if (!c || typeof c !== 'object') {
    throw new Error(`Malformed catalog (${source}): not an object`);
  }
  if (typeof c.id !== 'string' || typeof c.displayName !== 'string') {
    throw new Error(`Malformed catalog (${source}): missing id/displayName`);
  }
  if (!c.defaultThresholds || typeof c.defaultThresholds !== 'object') {
    throw new Error(`Malformed catalog (${source}): missing defaultThresholds`);
  }
  if (!Array.isArray(c.courses)) {
    throw new Error(`Malformed catalog (${source}): courses is not an array`);
  }
  if (
    c.tracks !== undefined &&
    (!Array.isArray(c.tracks) || c.tracks.some((t) => typeof t !== 'string'))
  ) {
    throw new Error(`Malformed catalog (${source}): tracks must be string[]`);
  }
  return c as MajorCatalog;
}

/**
 * Display name for a 학부 major including the chosen 세부전공, e.g.
 * "전자컴퓨터공학부" + track "전자공학" -> "전자컴퓨터공학부(전자공학전공)". The track
 * name is suffixed with "전공" unless it already ends with it. Returns the bare
 * name when no track is selected (single 학과, or 학부 without a chosen track).
 */
export function majorDisplayName(
  baseName: string,
  selectedTrack?: string,
): string {
  if (!selectedTrack) return baseName;
  const trackLabel = selectedTrack.endsWith('전공')
    ? selectedTrack
    : `${selectedTrack}전공`;
  return `${baseName}(${trackLabel})`;
}

/** Sheet-title-safe display for a major given its role + name. */
export function majorSheetName(
  role: MajorRole,
  displayName: string,
  index: number,
): string {
  // 주전공 uses the bare name; secondary majors get a "역할N" prefix so multiple
  // majors of the same role (or even the same catalog) never collide. Excel
  // sheet titles must be <=31 chars and avoid the chars []:*?/\ .
  const prefix = role === '주전공' ? '' : `${role}${index} `;
  const cleaned = `${prefix}${displayName}`.replace(/[[\]:*?/\\]/g, ' ').trim();
  return cleaned.length <= 31 ? cleaned : cleaned.slice(0, 31);
}

/**
 * Turns a catalog + chosen role (+ optional threshold overrides + index-derived
 * key) into a {@link MajorInput} ready for the workbook builder.
 */
export function toMajorInput(
  catalog: MajorCatalog,
  role: MajorRole,
  index: number,
  overrides?: Partial<MajorThresholds>,
  selectedTrack?: string,
): MajorInput {
  const courses: MajorCourse[] = catalog.courses.map((c) => ({
    year: c.year,
    term: c.term,
    reqCategory: c.reqCategory,
    title: c.title,
    code: c.code,
    credits: c.credits,
    note: c.note ?? '',
  }));
  const tracks = catalog.tracks ?? [];
  if (selectedTrack !== undefined && !tracks.includes(selectedTrack)) {
    throw new Error(
      `Unknown 세부전공 "${selectedTrack}" for catalog ${catalog.id}`,
    );
  }
  // A track only applies to a 학부 (tracks present); otherwise it's ignored.
  const track = tracks.length > 0 ? selectedTrack : undefined;
  const displayName = majorDisplayName(catalog.displayName, track);
  return {
    key: index === 0 ? 'major0' : `major${index}`,
    role,
    displayName,
    sheetName: majorSheetName(role, displayName, index),
    thresholds: { ...catalog.defaultThresholds, ...overrides },
    tracks,
    selectedTrack: track,
    courses,
  };
}
