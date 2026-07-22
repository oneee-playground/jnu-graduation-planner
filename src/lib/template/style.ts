import type { Borders, Fill, Style } from 'exceljs';

/**
 * Named style presets for the template DSL. A cell or column declares a
 * `StyleRef` -- either a preset name or an array of names merged left-to-right
 * -- instead of building an ExcelJS style object imperatively. The renderer
 * resolves the ref to a concrete style via {@link resolveStyle}.
 */

export const COLOR = {
  headerBg: 'FF1F3A5F',
  headerText: 'FFFFFFFF',
  inputBg: 'FFFFFDE7',
  computedBg: 'FFF1F3F4',
  okBg: 'FFE6F4EA',
  warnBg: 'FFFCE8E6',
  border: 'FFB0B0B0',
} as const;

export function solidFill(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export function thinBorders(): Partial<Borders> {
  const side = { style: 'thin' as const, color: { argb: COLOR.border } };
  return { top: side, left: side, bottom: side, right: side };
}

/** The full palette of named presets. */
export const STYLE = {
  header: {
    font: { bold: true, color: { argb: COLOR.headerText } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill: solidFill(COLOR.headerBg),
    border: thinBorders(),
  },
  input: {
    fill: solidFill(COLOR.inputBg),
    border: thinBorders(),
    alignment: { vertical: 'middle' },
  },
  computed: {
    fill: solidFill(COLOR.computedBg),
    border: thinBorders(),
    alignment: { vertical: 'middle' },
  },
  /** Like `computed`, but horizontally centered (tidy single-value cells). */
  computedCenter: {
    fill: solidFill(COLOR.computedBg),
    border: thinBorders(),
    alignment: { vertical: 'middle', horizontal: 'center' },
  },
  label: {
    font: { bold: true },
    alignment: { vertical: 'middle' },
  },
  title: {
    font: { bold: true, size: 16 },
    alignment: { vertical: 'middle' },
  },
  /** Bold text with no fill/border (totals labels, summary values). */
  bold: {
    font: { bold: true },
  },
  /** Larger bold text (graduation verdict). */
  boldLg: {
    font: { bold: true, size: 12 },
  },
} satisfies Record<string, Partial<Style>>;

export type StyleName = keyof typeof STYLE;

/** A preset name, or an array of names merged left-to-right (later wins). */
export type StyleRef = StyleName | StyleName[];

/** Resolves a {@link StyleRef} to a concrete (shallow-merged) ExcelJS style. */
export function resolveStyle(ref: StyleRef): Partial<Style> {
  const names = Array.isArray(ref) ? ref : [ref];
  return names.reduce<Partial<Style>>(
    (acc, name) => ({ ...acc, ...STYLE[name] }),
    {},
  );
}
