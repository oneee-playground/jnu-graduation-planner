/**
 * Node-only loaders for the canonical `data/` directory — the single source of
 * truth for the planner's curriculum data. Everything the website serves under
 * `website/data/` is copied from here (see scripts/prepare-web-data.ts).
 *
 * Layout:
 *   data/교양/index.json          — GenEduIndexEntry[] (입학연도 버전 목록).
 *   data/교양/<dir>/rules.json    — GenEduRules (영역 의무이수 + genMin/genMax).
 *   data/교양/<dir>/<sem>.json    — one semester's 교양 offering list (Course[]).
 *   data/majors/index.json        — CatalogIndexEntry[] (selectable majors).
 *   data/majors/<file>.json       — one MajorCatalog per department.
 *   data/마이크로디그리.json        — 마이크로디그리 catalog (MicroDegreeCatalog).
 *
 * These functions use `node:fs`, so they run in the CLI / build scripts only —
 * NOT in the browser bundle (the site fetches the copied JSON instead).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Course } from './course.js';
import {
  selectVersion,
  unionByCode,
  type GenEduIndexEntry,
  type GenEduRules,
  type GenEduSemester,
  type GenEduVersionData,
} from './genEdu.js';
import {
  assertCatalog,
  type CatalogIndexEntry,
  type MajorCatalog,
} from './catalog.js';
import {
  assertMicroDegreeCatalog,
  type MicroDegreeCatalog,
} from './microdegree.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repo-root `data/` directory. */
export const DATA_DIR = resolve(__dirname, '../../data');

/** Absolute path to the `data/majors/` directory. */
export const MAJORS_DIR = resolve(DATA_DIR, 'majors');

/** Absolute path to the `data/교양/` directory (versioned 교양 data). */
export const GEN_EDU_DIR = resolve(DATA_DIR, '교양');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/** Loads the 교양 version index from `data/교양/index.json`. */
export function loadGenEduIndex(): GenEduIndexEntry[] {
  return readJson<GenEduIndexEntry[]>(resolve(GEN_EDU_DIR, 'index.json'));
}

/**
 * Loads the 교양 version whose entry-year range contains `entryYear` (falling
 * back to the latest version when none matches — e.g. a future entry year). The
 * returned data carries the rules, every semester's offering list, and a single
 * unified code→course lookup (union across semesters) used by the dashboard.
 */
export function loadGenEdu(entryYear: number): GenEduVersionData {
  const index = loadGenEduIndex();
  const { entry, fallback } = selectVersion(index, entryYear);
  const dir = resolve(GEN_EDU_DIR, entry.dir);
  const rules = readJson<GenEduRules>(resolve(dir, entry.rules));
  const semesters: GenEduSemester[] = entry.semesters.map((s) => ({
    label: s.label,
    courses: readJson<Course[]>(resolve(dir, s.file)),
  }));
  return {
    version: entry.version,
    entryYearFrom: entry.entryYearFrom,
    entryYearTo: entry.entryYearTo,
    rules,
    semesters,
    lookup: unionByCode(semesters),
    fallback,
  };
}

/** Loads the major catalog index from `data/majors/index.json`. */
export function loadCatalogIndex(): CatalogIndexEntry[] {
  return readJson<CatalogIndexEntry[]>(resolve(MAJORS_DIR, 'index.json'));
}

/** Loads + validates a single major catalog by its index entry. */
export function loadCatalog(entry: CatalogIndexEntry): MajorCatalog {
  const raw = readJson<unknown>(resolve(MAJORS_DIR, entry.file));
  return assertCatalog(raw, entry.file);
}

/** Loads + validates the 마이크로디그리 catalog from `data/마이크로디그리.json`. */
export function loadMicroDegree(): MicroDegreeCatalog {
  const raw = readJson<unknown>(resolve(DATA_DIR, '마이크로디그리.json'));
  return assertMicroDegreeCatalog(raw, 'data/마이크로디그리.json');
}
