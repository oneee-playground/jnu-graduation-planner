/**
 * Pure, browser-safe workbook builder. Given a {@link GenerateConfig}, the 교양
 * course catalog, and the 마이크로디그리 catalog, assembles the full ExcelJS
 * workbook (all sheets, defined names, protection). Contains NO Node APIs and no
 * inlined data, so it runs identically in the CLI and in the website's in-browser
 * generator (both fetch/load the data and pass it in).
 */

import ExcelJS from 'exceljs';
import type { Course } from './course.js';
import { SHEET } from './names.js';
import { validateConfig, type GenerateConfig } from './majors.js';
import type { MicroDegree } from './microdegree.js';
import { renderWorkbook } from './template/index.js';
import { referenceSheet } from '../sheets/reference.js';
import { genEduSheet } from '../sheets/genEdu.js';
import { majorSheet } from '../sheets/majorSheet.js';
import { microDegreeSheet } from '../sheets/microDegree.js';
import { dashboardSheet } from '../sheets/dashboard.js';

/** Builds the planner workbook from a config + 교양 catalog + 마이크로디그리 catalog. */
export async function buildWorkbook(
  config: GenerateConfig,
  genEduCourses: Course[],
  microDegrees: MicroDegree[],
): Promise<ExcelJS.Workbook> {
  validateConfig(config);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'jnu-graduation-planner';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const majorSheets = config.majors.map((m) => majorSheet(m));

  await renderWorkbook(wb, [
    dashboardSheet(config),
    ...majorSheets,
    genEduSheet(genEduCourses),
    microDegreeSheet(microDegrees),
    referenceSheet(config),
  ]);

  orderSheets(wb, [
    SHEET.dashboard,
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
