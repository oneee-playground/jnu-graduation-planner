/**
 * Copies the canonical curriculum data from `data/` into `website/data/` so the
 * static site can fetch it at runtime. `data/` is the single source of truth;
 * `website/data/` is generated (and gitignored).
 *
 * Copied:
 *   data/교양/**            -> website/data/교양/**            (버전 인덱스 + 규칙 + 학기별 편성목록)
 *   data/마이크로디그리.json  -> website/data/마이크로디그리.json  (마이크로디그리 catalog)
 *   data/majors/*.json      -> website/data/majors/*.json      (major catalogs + index)
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

/** Recursively copies a directory tree (files + subdirs) to `dest`. */
function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = resolve(src, entry.name);
    const to = resolve(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}
import {
  DATA_DIR,
  GEN_EDU_DIR,
  MAJORS_DIR,
  loadGenEduIndex,
  loadGenEdu,
  loadMicroDegree,
} from '../src/lib/dataDir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(REPO_ROOT, 'website/data');
const OUT_MAJORS_DIR = resolve(OUT_DIR, 'majors');
const OUT_GEN_EDU_DIR = resolve(OUT_DIR, '교양');

mkdirSync(OUT_MAJORS_DIR, { recursive: true });

// 교양 versioned data: validate every version parses (index + rules + each
// semester + unified lookup), then copy the whole tree verbatim.
const genEduIndex = loadGenEduIndex();
let genEduSemesters = 0;
for (const entry of genEduIndex) {
  const v = loadGenEdu(entry.entryYearFrom);
  genEduSemesters += v.semesters.length;
}
copyDir(GEN_EDU_DIR, OUT_GEN_EDU_DIR);

// 마이크로디그리 catalog (validate it parses, then copy verbatim).
const microDegree = loadMicroDegree();
copyFileSync(
  resolve(DATA_DIR, '마이크로디그리.json'),
  resolve(OUT_DIR, '마이크로디그리.json'),
);

// Major catalogs + index.
const majorFiles = readdirSync(MAJORS_DIR).filter((f) => f.endsWith('.json'));
for (const file of majorFiles) {
  copyFileSync(resolve(MAJORS_DIR, file), resolve(OUT_MAJORS_DIR, file));
}

console.log(
  `Copied data/ -> website/data/ (교양 ${genEduIndex.length}개 버전 / ${genEduSemesters}개 학기 + ${microDegree.degrees.length} 마이크로디그리 + ${majorFiles.length} major files)`,
);
