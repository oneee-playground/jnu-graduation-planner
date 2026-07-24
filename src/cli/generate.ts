import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { buildWorkbook } from '../lib/build.js';
import { toMajorInput } from '../lib/catalog.js';
import {
  loadCatalog,
  loadCatalogIndex,
  loadGenEdu,
  loadMicroDegree,
} from '../lib/dataDir.js';
import type { GenerateConfig } from '../lib/majors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, 'dist');
const OUT_FILE = resolve(OUT_DIR, 'planner.xlsx');

async function main(): Promise<void> {
  // The CLI builds a default single-major (주전공-only) sample from the canonical
  // JSON data in data/. The website generator supplies richer configs (multiple
  // majors, threshold overrides, chosen 세부전공).
  const genEduCourses = loadGenEdu();
  console.log(
    `Loaded ${genEduCourses.length} 교양 courses from data/교양.json`,
  );

  const index = loadCatalogIndex();
  const first = index[0];
  if (!first) throw new Error('No majors in data/majors/index.json');
  const catalog = loadCatalog(first);
  console.log(
    `Loaded 주전공 "${catalog.displayName}" (${catalog.courses.length} courses) from data/majors/${first.file}`,
  );

  const microDegrees = loadMicroDegree().degrees;
  console.log(
    `Loaded ${microDegrees.length} 마이크로디그리 from data/마이크로디그리.json`,
  );

  const config: GenerateConfig = {
    student: {
      entryYear: 2026,
      track: '이공계열',
    },
    majors: [toMajorInput(catalog, '주전공', 0)],
  };

  const wb = await buildWorkbook(config, genEduCourses, microDegrees);

  mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
