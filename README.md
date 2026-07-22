# JNU Graduation Planner

A macro-free `.xlsx` graduation planner for **Chonnam National University (전남대학교)**.
The spreadsheet uses **in-cell formulas only** (no macros/VBA), so it works
identically in Google Sheets, LibreOffice Calc, and Microsoft Excel.

The workbook is **generated in the browser, on demand**: the visitor picks their
major(s), 계열, and 입학연도 on the static GitHub Pages site, and a client-side
bundle (the same builder used by the CLI) produces a tailored `.xlsx` and
downloads it. No backend, no pre-built asset.

- **Website:** https://oneee-playground.github.io/jnu-graduation-planner/

## How it works

All configuration (majors + their roles, 입학연도, 계열) is chosen at generation
time and **baked into the file as visible, read-only cells**. Per-category
thresholds, the minimum GPA, and 교양최대인정 come from each major's catalog — the
주전공's values govern the workbook (they are department data, not user choices).
The only editable surface in the generated workbook is the 대시보드 "이수 과목 입력"
table.

Sheets in a generated workbook:

| Sheet                   | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| 대시보드 (Dashboard)    | Course input; per-이수구분 totals, GPA, 교양 영역·다중전공 요건, 졸업 판정.        |
| 매뉴얼 (Manual)         | Usage instructions (tailored to the selected majors).                              |
| _(one sheet per major)_ | 주전공 / 복수 / 부 / 연계전공 — 졸업소요학점(읽기전용) + 교육과정 + hidden lookup. |
| 교양 (Gen. Ed.)         | Curriculum courses + hidden `GenEduLookup`.                                        |
| 마이크로디그리 (Micro)  | Read-only reference list (not a graduation requirement).                           |
| 참조 (Reference)        | Grade→point `GradeTable`, 졸업 최소 GPA, 교양최대인정 (all read-only).             |

Key behaviors:

- **Auto-fill priority chain:** typing a 코드 resolves 교과목명/학점/이수구분 by
  `VLOOKUP` over each major's lookup in order (주전공 first), then 교양; earlier
  majors win on duplicate codes. A hidden `소속전공` helper records which major
  claimed each code so per-major requirements can attribute credits.
- **Multi-major:** 주전공 (exactly 1) + 복수전공 (∞) + 부전공 (≤1) + 연계전공 (∞).
  With any secondary major the 전공심화 21 요건 is released; each secondary major's
  이수학점 요건 (부전공 ≥21) folds into the 졸업 판정.
- **Retake dedup**, **교양·전공 초과학점 → 일선**, **교양 영역 의무이수 (계열별)** are all
  handled with a portable formula subset (`SUM`, `SUMIFS`, `COUNTIF`, `IF`,
  `IFERROR`, `ROUND`, `VLOOKUP`, `MIN`, `MAX`, `AND`) — no `XLOOKUP`/`LET`/dynamic
  arrays.

## Repository layout

```
data/courses/general/2026-1.csv   교양 curriculum source (category,subCategory,code,title,credits)
data/courses/major/*.csv          Sample 주전공 curriculum (CLI default build)
src/lib/build.ts                  Pure, browser-safe workbook builder (buildWorkbook)
src/lib/{majors,catalog,names}.ts Multi-major model, catalog JSON, scoped defined names
src/sheets/                       Sheet builders (dashboard, majorSheet, reference, …)
src/main.ts                       Node CLI: default 주전공-only sample -> dist/planner.xlsx
src/web/generate.ts              Browser entry (fetch catalogs, generate, download)
website/                          Static GitHub Pages site (index.html, app.js, style.css)
website/data/majors/index.json    Catalog index (shipped data; catalogs added here)
scripts/prepare-web-data.ts       Emits website/data/genedu.json from the 교양 CSV
references/                       Official regulations & guidelines (PDF/XLSX)
.github/workflows/pages.yml       main -> build bundle + deploy to Pages
```

## Development

Requires **Node 22**. A devcontainer is provided
(`mcr.microsoft.com/devcontainers/javascript-node:22`).

```bash
npm install            # install dependencies
npm run build          # CLI: build a sample dist/planner.xlsx
npm run web:build      # build website/data/genedu.json + generate.bundle.js
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run format         # prettier --write
```

Preview the website locally (run `web:build` first):

```bash
npm run web:build && npm run preview   # serves website/ on http://localhost:4173
```

Generated artifacts (`dist/planner.xlsx`, `website/generate.bundle.js`,
`website/data/genedu.json`) are **gitignored**; the bundle + data are produced by
`pages.yml` on deploy.

## Adding a major catalog

Each selectable major is a JSON file under `website/data/majors/` plus an entry
in `website/data/majors/index.json`:

The `id`, `displayName`, and `file` all use the full Korean major name (the
`id` is the value passed through the form; the `file` matches the on-disk name).

```jsonc
// website/data/majors/index.json
[
  {
    "id": "전자컴퓨터공학부",
    "displayName": "전자컴퓨터공학부",
    "file": "전자컴퓨터공학부.json",
  },
]
```

```jsonc
// website/data/majors/전자컴퓨터공학부.json
{
  "id": "전자컴퓨터공학부",
  "displayName": "전자컴퓨터공학부",
  "defaultThresholds": {
    "genReq": 8,
    "genElec": 22,
    "majorReq": 30,
    "majorElec": 18,
    "majorAdv": 21,
    "genSelect": 41,
    "total": 140,
    "minGpa": 1.75,
    "genMax": 45,
  },
  // tracks (optional): present ONLY for a 학부 (division with self-selected
  // 세부전공, 전공자율선택제). When present, the form shows a 세부전공 picker and
  // each major sheet gains a 세부전공 column; the chosen track's 전필 (plus
  // "공통") become the required courses. Omit for a single 학과 (국어국문학과) —
  // then no 세부전공 column is rendered and all 전필 are required.
  "tracks": ["전자공학", "컴퓨터정보통신", "시스템반도체"],
  "courses": [
    {
      "year": 1,
      "term": 1,
      "reqCategory": "전필",
      "title": "회로이론1",
      "code": "EEE2001",
      "credits": 3,
      // note = 세부전공 (optional): "공통" (all tracks) or a comma-joined track
      // list naming the owning 세부전공(s) (e.g. "전자공학, 시스템반도체"). Shown
      // in the major sheet's 세부전공 column and used to filter 전필 by the
      // chosen track. Ignored for catalogs without `tracks`.
      "note": "공통",
    },
  ],
}
```

Threshold values (and `minGpa` / `genMax`) come from each department's 졸업소요학점
구성표 (교학규정 별표1); the 주전공's `minGpa`/`genMax` are used for the workbook.

## References

- https://rule.jnu.ac.kr
- https://www.jnu.ac.kr/MainUniLife/Curriculum/Curriculum
- https://ile.jnu.ac.kr/ko/liberal/organize
- https://www.jnu.ac.kr/WebApp/web/DBM/ENG/CurriCulumn/CurriCulumnSM.aspx
- https://ile.jnu.ac.kr/ko/liberal/notice/view/10276
- https://www.jnu.ac.kr/WebApp/web/HOM/COM/Rule/AdminRule400.aspx

## License

MIT — see [LICENSE](LICENSE).
