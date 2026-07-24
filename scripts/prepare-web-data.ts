/**
 * Copies the canonical curriculum data from `data/` into `website/data/` so the
 * static site can fetch it at runtime. `data/` is the single source of truth;
 * `website/data/` is generated (and gitignored).
 *
 * Copied:
 *   data/교양.json           -> website/data/교양.json           (교양 course list)
 *   data/마이크로디그리.json  -> website/data/마이크로디그리.json  (마이크로디그리 catalog)
 *   data/majors/*.json      -> website/data/majors/*.json      (major catalogs + index)
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import {
  DATA_DIR,
  MAJORS_DIR,
  loadGenEdu,
  loadMicroDegree,
} from '../src/lib/dataDir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(REPO_ROOT, 'website/data');
const OUT_MAJORS_DIR = resolve(OUT_DIR, 'majors');

mkdirSync(OUT_MAJORS_DIR, { recursive: true });

// 교양 course list (validate it parses, then copy verbatim).
const genEdu = loadGenEdu();
copyFileSync(resolve(DATA_DIR, '교양.json'), resolve(OUT_DIR, '교양.json'));

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
  `Copied data/ -> website/data/ (${genEdu.length} 교양 courses + ${microDegree.degrees.length} 마이크로디그리 + ${majorFiles.length} major files)`,
);
