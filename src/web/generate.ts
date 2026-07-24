/**
 * Browser entrypoint for on-click .xlsx generation. Bundled by esbuild into
 * website/generate.bundle.js and imported by website/app.js as an ES module.
 *
 * Reuses the exact same pure {@link buildWorkbook} used by the CLI, so the
 * client-generated file is identical to a server/CLI build. All data — 교양,
 * 마이크로디그리, and the per-major catalogs — is fetched as JSON at runtime
 * (prepared by scripts/prepare-web-data.ts under website/data/).
 */

import { buildWorkbook } from '../lib/build.js';
import {
  assertCatalog,
  toMajorInput,
  type CatalogIndexEntry,
  type MajorCatalog,
} from '../lib/catalog.js';
import type { Course } from '../lib/course.js';
import {
  assertMicroDegreeCatalog,
  type MicroDegree,
} from '../lib/microdegree.js';
import type {
  GenerateConfig,
  MajorRole,
  MajorThresholds,
  StudentInfo,
} from '../lib/majors.js';

/** A major selection made in the form: which catalog + what role + overrides. */
export interface MajorSelection {
  catalogId: string;
  role: MajorRole;
  thresholds?: Partial<MajorThresholds>;
  /** 학부일 때 사용자가 고른 세부전공. 단일 학과이면 무시된다. */
  selectedTrack?: string;
}

/** Base path for fetched data, relative to the page. */
const DATA_BASE = 'data';

let genEduCache: Course[] | undefined;
let microDegreeCache: MicroDegree[] | undefined;
const catalogCache = new Map<string, MajorCatalog>();

/** Fetches + caches the 교양 course list (prepared JSON). */
export async function loadGenEdu(): Promise<Course[]> {
  if (genEduCache) return genEduCache;
  const res = await fetch(`${DATA_BASE}/${encodeURIComponent('교양.json')}`);
  if (!res.ok)
    throw new Error(`교양 데이터를 불러오지 못했습니다 (${res.status})`);
  genEduCache = (await res.json()) as Course[];
  return genEduCache;
}

/** Fetches + caches the 마이크로디그리 catalog (prepared JSON). */
export async function loadMicroDegree(): Promise<MicroDegree[]> {
  if (microDegreeCache) return microDegreeCache;
  const res = await fetch(
    `${DATA_BASE}/${encodeURIComponent('마이크로디그리.json')}`,
  );
  if (!res.ok)
    throw new Error(
      `마이크로디그리 데이터를 불러오지 못했습니다 (${res.status})`,
    );
  const catalog = assertMicroDegreeCatalog(
    await res.json(),
    '마이크로디그리.json',
  );
  microDegreeCache = catalog.degrees;
  return microDegreeCache;
}

/** Fetches the catalog index (list of selectable majors). */
export async function loadCatalogIndex(): Promise<CatalogIndexEntry[]> {
  const res = await fetch(`${DATA_BASE}/majors/index.json`);
  if (!res.ok)
    throw new Error(`전공 목록을 불러오지 못했습니다 (${res.status})`);
  return (await res.json()) as CatalogIndexEntry[];
}

/** Fetches + caches a single catalog by index entry. */
export async function loadCatalog(
  entry: CatalogIndexEntry,
): Promise<MajorCatalog> {
  const cached = catalogCache.get(entry.id);
  if (cached) return cached;
  const res = await fetch(`${DATA_BASE}/majors/${entry.file}`);
  if (!res.ok) {
    throw new Error(`전공(${entry.displayName}) 데이터를 불러오지 못했습니다`);
  }
  const catalog = assertCatalog(await res.json(), entry.file);
  catalogCache.set(entry.id, catalog);
  return catalog;
}

/** Builds a {@link GenerateConfig} from student info + ordered selections. */
export async function buildConfig(
  student: StudentInfo,
  selections: MajorSelection[],
  index: CatalogIndexEntry[],
): Promise<GenerateConfig> {
  const byId = new Map(index.map((e) => [e.id, e]));
  const majors = [];
  for (let i = 0; i < selections.length; i++) {
    const sel = selections[i]!;
    const entry = byId.get(sel.catalogId);
    if (!entry) throw new Error(`알 수 없는 전공: ${sel.catalogId}`);
    const catalog = await loadCatalog(entry);
    majors.push(
      toMajorInput(catalog, sel.role, i, sel.thresholds, sel.selectedTrack),
    );
  }
  return { student, majors };
}

/**
 * Generates the workbook and triggers a browser download. Returns the file name.
 */
export async function generateAndDownload(
  config: GenerateConfig,
): Promise<string> {
  const [genEdu, microDegrees] = await Promise.all([
    loadGenEdu(),
    loadMicroDegree(),
  ]);
  const wb = await buildWorkbook(config, genEdu, microDegrees);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const primaryName = config.majors[0]?.displayName ?? 'planner';
  const fileName = `졸업플래너-${primaryName}.xlsx`;
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

// Expose the API on window for the un-bundled form driver (website/app.js).
declare global {
  interface Window {
    JnuPlanner: {
      loadCatalogIndex: typeof loadCatalogIndex;
      loadCatalog: typeof loadCatalog;
      buildConfig: typeof buildConfig;
      generateAndDownload: typeof generateAndDownload;
    };
  }
}

window.JnuPlanner = {
  loadCatalogIndex,
  loadCatalog,
  buildConfig,
  generateAndDownload,
};
