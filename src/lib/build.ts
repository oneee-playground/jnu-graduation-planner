/**
 * Pure, browser-safe workbook builder. Given a {@link GenerateConfig} and the
 * 교양 course catalog, assembles the full ExcelJS workbook (all sheets, defined
 * names, protection). Contains NO Node APIs, so it runs identically in the CLI
 * and in the website's in-browser generator.
 */

import ExcelJS from 'exceljs';
import type { Course } from './csv.js';
import { SHEET } from './names.js';
import { validateConfig, type GenerateConfig } from './majors.js';
import { assertMicroDegreeCatalog } from './microdegree.js';
import microDegreeData from '../../data/microdegree.json' with { type: 'json' };
import { renderWorkbook } from './template/index.js';
import { referenceSheet } from '../sheets/reference.js';
import { genEduSheet } from '../sheets/genEdu.js';
import { majorSheet } from '../sheets/majorSheet.js';
import { microDegreeSheet } from '../sheets/microDegree.js';
import { dashboardSheet } from '../sheets/dashboard.js';
import { manualSheet } from '../sheets/manual.js';

/** Builds the planner workbook from a config + 교양 catalog. */
export async function buildWorkbook(
  config: GenerateConfig,
  genEduCourses: Course[],
): Promise<ExcelJS.Workbook> {
  validateConfig(config);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'jnu-graduation-planner';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const majorSheets = config.majors.map((m) => majorSheet(m));
  const microDegrees = assertMicroDegreeCatalog(
    microDegreeData,
    'data/microdegree.json',
  ).degrees;

  await renderWorkbook(wb, [
    dashboardSheet(config),
    manualSheet(config),
    ...majorSheets,
    genEduSheet(genEduCourses),
    microDegreeSheet(microDegrees),
    referenceSheet(config),
  ]);

  orderSheets(wb, [
    SHEET.dashboard,
    SHEET.manual,
    ...config.majors.map((m) => m.sheetName),
    SHEET.genEdu,
    SHEET.microDegree,
    SHEET.reference,
  ]);

  return wb;
}

/** Reorders worksheets by name via their `orderNo` (1-based). */
function orderSheets(wb: ExcelJS.Workbook, order: string[]): void {
  order.forEach((name, i) => {
    const ws = wb.getWorksheet(name) as
      (ExcelJS.Worksheet & { orderNo: number }) | undefined;
    if (ws) ws.orderNo = i + 1;
  });
}
