/**
 * Prepares static JSON data for the in-browser generator.
 *  · website/data/genedu.json  — the 교양 course list (from the bundled CSV).
 *
 * Per-major catalogs (website/data/majors/*.json + index.json) are provided
 * separately (shipped data), not generated here.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readCourses } from '../src/lib/csv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(REPO_ROOT, 'data/courses/general/2026-1.csv');
const OUT_DIR = resolve(REPO_ROOT, 'website/data');
const OUT_FILE = resolve(OUT_DIR, 'genedu.json');

const courses = readCourses(CSV_PATH);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(courses), 'utf-8');
console.log(`Wrote ${OUT_FILE} (${courses.length} 교양 courses)`);
