// Form driver for the client-side planner generator. Loads the bundled API
// (generate.bundle.js sets window.JnuPlanner) and wires the major picker +
// generate button. All .xlsx generation happens in the browser; no backend.

import './generate.bundle.js';

// Roles selectable in the repeatable secondary-major list (주전공 is a single
// dropdown handled separately). 부전공/복수/연계 are all unlimited.
const EXTRA_ROLES = ['복수전공', '부전공', '연계전공'];

const statusEl = document.getElementById('status');
const primarySel = document.getElementById('primary-major');
const primaryTrackField = document.getElementById('primary-track-field');
const primaryTrackSel = document.getElementById('primary-track');
const extrasEl = document.getElementById('extra-majors');
const addBtn = document.getElementById('add-major');
const form = document.getElementById('gen-form');

let catalogIndex = [];

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (kind ? ` status--${kind}` : '');
}

/** Fills a <select> with catalog options. */
function fillCatalogOptions(select) {
  for (const entry of catalogIndex) {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.displayName;
    select.appendChild(opt);
  }
}

/** Returns the tracks (세부전공) of a catalog by id, fetching+caching as needed. */
async function tracksForCatalog(catalogId) {
  const entry = catalogIndex.find((e) => e.id === catalogId);
  if (!entry) return [];
  const catalog = await window.JnuPlanner.loadCatalog(entry);
  return Array.isArray(catalog.tracks) ? catalog.tracks : [];
}

/**
 * Populates a 세부전공 <select> from a catalog's tracks and shows/hides its
 * wrapper. When the catalog is a single 학과 (no tracks), the field is hidden
 * and cleared (no track flows into config). When `suffix` is true the option
 * label gets a "전공" suffix; this is used for both the 주전공 selector and the
 * compact 복수/부전공 rows.
 */
async function syncTrackField(catalogId, fieldEl, selectEl, suffix = false) {
  const tracks = await tracksForCatalog(catalogId);
  selectEl.innerHTML = '';
  if (tracks.length === 0) {
    fieldEl.hidden = true;
    return;
  }
  for (const t of tracks) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = suffix && !t.endsWith('전공') ? `${t}전공` : t;
    selectEl.appendChild(opt);
  }
  fieldEl.hidden = false;
}

/**
 * Builds one repeatable 복수/연계전공 row: catalog + 세부전공(학부일 때) + 전공종류
 * (role) + remove. The 세부전공 select carries no label and its options use the
 * "전공" suffix; it sits before the role select.
 */
function extraRow() {
  const row = document.createElement('div');
  row.className = 'major-row';

  const catSel = document.createElement('select');
  catSel.className = 'major-catalog';
  fillCatalogOptions(catSel);

  // 세부전공 (학부일 때만 보임). No label; wrapper hides as a unit.
  const trackField = document.createElement('span');
  trackField.className = 'major-track-field';
  trackField.hidden = true;
  const trackSel = document.createElement('select');
  trackSel.className = 'major-track';
  trackField.append(trackSel);

  const roleSel = document.createElement('select');
  roleSel.className = 'major-role';
  for (const role of EXTRA_ROLES) {
    const opt = document.createElement('option');
    opt.value = role;
    opt.textContent = role;
    roleSel.appendChild(opt);
  }

  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'major-remove';
  rm.textContent = '삭제';
  rm.addEventListener('click', () => row.remove());

  catSel.addEventListener('change', () => {
    void syncTrackField(catSel.value, trackField, trackSel, true);
  });
  void syncTrackField(catSel.value, trackField, trackSel, true);

  // Order: catalog, 세부전공, 전공종류(role), remove.
  row.append(catSel, trackField, roleSel, rm);
  return row;
}

async function init() {
  try {
    setStatus('전공 목록을 불러오는 중…');
    catalogIndex = await window.JnuPlanner.loadCatalogIndex();
    if (catalogIndex.length === 0) {
      setStatus('등록된 전공 카탈로그가 없습니다.', 'error');
      return;
    }
    fillCatalogOptions(primarySel);
    primarySel.addEventListener('change', () => {
      void syncTrackField(
        primarySel.value,
        primaryTrackField,
        primaryTrackSel,
        true,
      );
    });
    await syncTrackField(
      primarySel.value,
      primaryTrackField,
      primaryTrackSel,
      true,
    );
    setStatus('');
  } catch (err) {
    console.error(err);
    setStatus(`전공 목록을 불러오지 못했습니다: ${err.message}`, 'error');
  }
}

addBtn.addEventListener('click', () => {
  extrasEl.appendChild(extraRow());
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Ordered selections: 주전공 first, then all secondary majors in row order.
  const primary = { catalogId: primarySel.value, role: '주전공' };
  if (!primaryTrackField.hidden && primaryTrackSel.value) {
    primary.selectedTrack = primaryTrackSel.value;
  }
  const selections = [primary];
  for (const row of extrasEl.querySelectorAll('.major-row')) {
    const sel = {
      catalogId: row.querySelector('.major-catalog').value,
      role: row.querySelector('.major-role').value,
    };
    const trackField = row.querySelector('.major-track-field');
    const trackSel = row.querySelector('.major-track');
    if (trackField && !trackField.hidden && trackSel.value) {
      sel.selectedTrack = trackSel.value;
    }
    selections.push(sel);
  }

  const student = {
    entryYear: Number(document.getElementById('entry-year').value),
    track: document.getElementById('track').value,
  };

  try {
    setStatus('플래너를 생성하는 중… (잠시만 기다려 주세요)');
    const config = await window.JnuPlanner.buildConfig(
      student,
      selections,
      catalogIndex,
    );
    const name = await window.JnuPlanner.generateAndDownload(config);
    setStatus(`생성 완료: ${name} 을(를) 내려받았습니다.`, 'ok');
  } catch (err) {
    console.error(err);
    setStatus(`생성 실패: ${err.message}`, 'error');
  }
});

init();
