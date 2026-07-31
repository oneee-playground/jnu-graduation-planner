# 전남대학교 졸업 학점 플래너

URL: https://oneee-playground.github.io/jnu-graduation-planner

전남대학교 학생들을 위한 졸업 학점 플래너입니다. 웹 페이지에서 각자에게 맞는 조건을 선택 한 뒤 엑셀 파일을 다운받아 사용 할 수 있습니다.

부전공 및 복수전공, 그리고 마이크로디그리를 지원합니다.

DISCLAIMER: 이 프로젝트는 개인에 의해 관리되고 있습니다. 따라서 오류가 존재하거나 더 이상 유효하지 않은 데이터를 사용하고 있을 수 있습니다. 프로그램의 잘못된 사용으로 인한 피해의 책임은 사용자에게 있습니다.

## 사용법

[매뉴얼 페이지]()를 참고하세요.

## 레퍼런스

이 프로젝트에서 사용하는 수식/값은 아래 사이트들의 문서들을 기반으로 만들어졌습니다.

- https://rule.jnu.ac.kr
- https://www.jnu.ac.kr/MainUniLife/Curriculum/Curriculum
- https://ile.jnu.ac.kr/ko/liberal/organize
- https://www.jnu.ac.kr/WebApp/web/DBM/ENG/CurriCulumn/CurriCulumnSM.aspx
- https://ile.jnu.ac.kr/ko/liberal/notice/view/10276
- https://www.jnu.ac.kr/WebApp/web/HOM/COM/Rule/AdminRule400.aspx

사용되는 문서들은 `/references` 디렉터리 내부에서 관리되고 있습니다.

## 기여하기

### No-code 기여

개발 지식이 없어도 기여할 수 있습니다. [이슈](https://github.com/oneee-playground/jnu-graduation-planner/issues)를 통해 아래와 같은 내용을 남겨 주세요.

- 학점 계산이나 데이터의 오류 제보
- 아직 지원하지 않는 전공의 추가 요청
- 사용성 개선 제안 및 버그 신고

제보 시에는 관련된 공식 문서(학사요람, 학칙, 교육과정 편성 지침 등)나 근거를 함께 남겨 주시면 반영이 더 빠릅니다.

### 개발 환경 준비

```bash
npm install
```

Node.js 20 이상이 필요합니다.

### 주요 스크립트

- `npm run build` — 로컬에서 엑셀 파일을 생성합니다. (`dist/planner.xlsx`)
- `npm run web:build` — 웹에서 사용할 데이터와 번들을 생성합니다. (`data/` → `website/data/`, `website/generate.bundle.js`)
- `npm run preview` — 로컬 서버로 웹 페이지를 미리 봅니다.
- `npm run typecheck` — 타입 검사를 실행합니다.
- `npm run lint` — ESLint 검사를 실행합니다.
- `npm run format` — Prettier로 코드를 정리합니다.

### 데이터 구조

모든 교육과정 데이터는 `data/` 디렉터리를 원본으로 관리합니다. `website/data/`는 `npm run web:build` 시 `data/`로부터 자동으로 생성되므로 직접 수정하지 마세요.

- `data/교양/index.json` — 입학연도 교육과정 버전 목록 (버전별 적용 입학연도 범위·규칙·학기 파일)
- `data/교양/<버전>/rules.json` — 해당 버전의 교양 졸업요건 (영역 의무이수, 교양 인정학점 하한·상한)
- `data/교양/<버전>/<학기>.json` — 해당 학기에 개설된 교양 과목 목록 (편성목록 파일 1개 = 한 학기)
- `data/마이크로디그리.json` — 마이크로디그리 목록
- `data/majors/index.json` — 지원하는 전공 목록
- `data/majors/<전공명>.json` — 각 전공의 교육과정

교양 졸업요건은 학생의 입학연도가 속한 교육과정 버전을 따릅니다. 정확히 대응하는 버전이 없으면(예: 아직 정비 중인 미래 입학연도) 가장 최신 버전으로 대체됩니다. 새 학기 편성목록 파일을 추가하면 교양 시트에 학기별 표가 자동으로 늘어납니다.

### 전공 추가하기

1. `data/majors/` 아래에 `<전공명>.json` 파일을 만들고, 기존 전공 파일(예: `전자컴퓨터공학부.json`)을 참고하여 교육과정을 작성합니다.
2. `data/majors/index.json`에 새 전공 항목을 추가합니다.

   ```json
   {
     "id": "전공명",
     "displayName": "전공명",
     "file": "전공명.json"
   }
   ```

3. `npm run build`로 엑셀 파일이 정상 생성되는지 확인합니다.

### Pull Request 전 확인 사항

- 추가/수정한 데이터에는 근거가 되는 공식 문서가 있어야 하며, 확인이 어려운 내용은 포함하지 마세요.
- PR을 올리기 전에 아래 검사를 통과시켜 주세요.

  ```bash
  npm run typecheck
  npm run lint
  npm run format:check
  ```

## 라이선스

[LICENSE](LICENSE).
