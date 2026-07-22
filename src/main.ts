import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { readCourses, readMajorCourses } from './lib/csv.js';
import { buildWorkbook } from './lib/build.js';
import { toMajorInput, type MajorCatalog } from './lib/catalog.js';
import type { GenerateConfig } from './lib/majors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(REPO_ROOT, 'data/courses/general/2026-1.csv');
const MAJOR_CSV_PATH = resolve(
  REPO_ROOT,
  'data/courses/major/전자컴퓨터공학부.csv',
);
const OUT_DIR = resolve(REPO_ROOT, 'dist');
const OUT_FILE = resolve(OUT_DIR, 'planner.xlsx');

/** Default sample thresholds (전자컴퓨터공학부(일반) 별표1; placeholder — edit per dept). */
const SAMPLE_THRESHOLDS = {
  genReq: 20,
  genElec: 12,
  majorReq: 41,
  majorElec: 24,
  majorAdv: 0,
  genSelect: 33,
  total: 130,
  minGpa: 1.75,
  genMax: 45,
};

async function main(): Promise<void> {
  const genEduCourses = readCourses(CSV_PATH);
  console.log(`Loaded ${genEduCourses.length} 교양 courses from ${CSV_PATH}`);
  const majorCourses = readMajorCourses(MAJOR_CSV_PATH);
  console.log(
    `Loaded ${majorCourses.length} 주전공 courses from ${MAJOR_CSV_PATH}`,
  );

  // The CLI builds a default single-major (주전공-only) sample from the bundled
  // CSVs. The website generator supplies richer configs (multiple majors).
  const catalog: MajorCatalog = {
    id: 'sample-major',
    displayName: '전자컴퓨터공학부',
    defaultThresholds: SAMPLE_THRESHOLDS,
    courses: majorCourses,
  };
  const config: GenerateConfig = {
    student: {
      entryYear: 2026,
      track: '이공계열',
    },
    majors: [toMajorInput(catalog, '주전공', 0)],
  };

  const wb = await buildWorkbook(config, genEduCourses);

  mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
