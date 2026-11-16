/**
 * src/screens/footprints.js
 * あしあと画面（screen-footprints）モジュール（M7・TASK-37）。
 *
 * 責務:
 *  - 足跡コードの入力を受け取り、検証して来訪記録として保存する
 *  - 保存済みの来訪記録を新しい順に一覧表示する
 *
 * XSS対策: テキストの挿入はすべて textContent / createElement を使い、
 *           innerHTML への直接代入は行わない。
 */

import { goHome } from '../router.js';
import { loadFootprints, appendFootprint } from '../store.js';
import { decodeFootprintCode } from '../domain/odekake-code.js';
import { PET_TYPE_ICONS } from '../domain/pet.js';
import { formatDateJa } from '../domain/card-generator.js';

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * あしあと画面を初期化する。
 * 画面が表示されるたびに main.js から呼ばれる。
 *
 * @param {Object[]} footprints - 保存済み FootprintRecord の配列
 */
export function initFootprintsScreen(footprints) {
  renderFootprintList(footprints || []);

  // 入力フィードバックを初期状態に戻す
  const errorEl = document.getElementById('footprint-input-error');
  if (errorEl) errorEl.hidden = true;
  const successEl = document.getElementById('footprint-input-success');
  if (successEl) successEl.hidden = true;

  // 「足跡を記録」ボタン（重複登録を避けるため clone で差し替え）
  const recordBtn = document.getElementById('record-footprint-btn');
  if (recordBtn) {
    const newRecordBtn = recordBtn.cloneNode(true);
    recordBtn.replaceWith(newRecordBtn);
    newRecordBtn.addEventListener('click', () => onRecordFootprint());
  }

  // 「← ホームへ」ボタン（重複登録を避けるため clone で差し替え）
  const backBtn = document.getElementById('footprints-back-btn');
  if (backBtn) {
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.replaceWith(newBackBtn);
    newBackBtn.addEventListener('click', () => goHome());
  }
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * 来訪記録の一覧を描画する。visitedAt の降順。
 * 0件なら空メッセージを表示する。
 *
 * @param {Object[]} footprints - FootprintRecord の配列
 */
function renderFootprintList(footprints) {
  const listEl = document.getElementById('footprint-list');
  const emptyEl = document.getElementById('footprint-list-empty');
  if (!listEl || !emptyEl) return;

  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  if (!footprints || footprints.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const sorted = [...footprints]
    .sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
  for (const record of sorted) {
    listEl.appendChild(buildFootprintItem(record));
  }
}

/**
 * 来訪記録1件分の <li> を生成する。
 *
 * @param {Object} record - FootprintRecord
 * @returns {HTMLElement}
 */
function buildFootprintItem(record) {
  const li = document.createElement('li');
  li.className = 'footprint-list__item';

  const head = document.createElement('p');
  head.className = 'footprint-list__head';
  const icon = PET_TYPE_ICONS[record.visitorPetType] || '🐾';
  head.textContent = `${icon} ${record.visitorPetName}ちゃん`;

  const date = document.createElement('p');
  date.className = 'footprint-list__date';
  date.textContent = formatDateJa(record.visitedAt);

  const summary = document.createElement('p');
  summary.className = 'footprint-list__summary';
  summary.textContent = record.eventSummary;

  li.appendChild(head);
  li.appendChild(date);
  li.appendChild(summary);
  return li;
}

/**
 * 「足跡を記録」ボタンが押されたときの処理。
 * コードを検証し、重複がなければ記録してリストを再描画する。
 */
function onRecordFootprint() {
  const input = document.getElementById('footprint-code-input');
  const errorEl = document.getElementById('footprint-input-error');
  const successEl = document.getElementById('footprint-input-success');
  if (!input || !errorEl || !successEl) return;

  const { payload, error } = decodeFootprintCode(input.value);
  if (error) {
    errorEl.textContent = error;
    errorEl.hidden = false;
    successEl.hidden = true;
    return;
  }
  errorEl.hidden = true;

  // 重複確認（同じペットの同じ訪問は1回だけ記録する）
  const existing = loadFootprints();
  const isDuplicate = existing.some(r =>
    r.visitorPetName === payload.visitorPetName && r.visitedAt === payload.visitedAt);
  if (isDuplicate) {
    successEl.textContent = 'すでに記録済みだよ';
    successEl.hidden = false;
    return;
  }

  appendFootprint({
    id: `footprint-${Date.now()}`,
    visitorPetName: payload.visitorPetName,
    visitorPetType: payload.visitorPetType,
    visitedAt: payload.visitedAt,
    eventSummary: payload.eventSummary,
    recordedAt: new Date().toISOString(),
  });

  renderFootprintList(loadFootprints());
  successEl.textContent = '記録したよ！';
  successEl.hidden = false;
  input.value = '';
}
