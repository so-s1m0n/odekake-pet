/**
 * src/screens/odekake.js
 * おでかけ選択画面モジュール。
 *
 * 責務:
 *  - spots.json のデータからスポットカード一覧を生成する
 *  - ユーザーによるスポット選択状態を管理する
 *  - 出発ボタンが押されたとき Visit を作成してストアに保存し、待機画面へ遷移する
 *
 * XSS対策: テキストの挿入はすべて textContent / createElement を使い、
 *           innerHTML への直接代入は行わない。
 */

import { createVisit } from '../domain/visit.js';
import { transitionPetState } from '../domain/pet.js';
import { loadPet, savePet, saveCurrentVisit } from '../store.js';
import { goHome, goWaiting } from '../router.js';

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** 現在選択中のスポットID（未選択は null）*/
let selectedSpotId = null;

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * おでかけ選択画面を初期化する。
 * 画面が表示されるたびに呼び出すことで選択状態をリセットする。
 *
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 *   spots.json から読み込んだスポット定義の配列
 */
export function initOdekakeScreen(spots) {
  // 選択状態をリセット
  selectedSpotId = null;

  // スポット一覧を描画する
  renderSpotList(spots);

  // 出発ボタンを非活性で初期化
  const departBtn = document.getElementById('depart-btn');
  if (departBtn) {
    departBtn.disabled = true;
    departBtn.setAttribute('aria-disabled', 'true');
  }

  // 戻るボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const backBtn = document.getElementById('odekake-back-btn');
  if (backBtn) {
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.replaceWith(newBackBtn);
    newBackBtn.addEventListener('click', () => goHome());
  }

  // 出発ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  if (departBtn) {
    const newDepartBtn = departBtn.cloneNode(true);
    departBtn.replaceWith(newDepartBtn);
    newDepartBtn.disabled = true;
    newDepartBtn.setAttribute('aria-disabled', 'true');
    newDepartBtn.addEventListener('click', () => onDepart());
  }
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * スポット一覧を #spot-list に描画する。
 * 既存の内容を一度クリアしてから生成する。
 *
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function renderSpotList(spots) {
  const listEl = document.getElementById('spot-list');
  if (!listEl) return;

  // 既存の子要素をすべて削除
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  spots.forEach(spot => {
    const card = buildSpotCard(spot);
    listEl.appendChild(card);
  });
}

/**
 * スポット1件分のカード要素を生成して返す。
 *
 * @param {import('../domain/event-generator.js').SpotDef} spot
 * @returns {HTMLElement}
 */
function buildSpotCard(spot) {
  // カードのラッパー要素
  const card = document.createElement('div');
  card.className = 'spot-card';
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', 'false');
  card.setAttribute('tabindex', '0');
  // カスタムデータ属性でスポットIDを保持する
  card.dataset.spotId = spot.id;

  // アイコン
  const iconEl = document.createElement('span');
  iconEl.className = 'spot-card__icon';
  iconEl.textContent = spot.icon;
  iconEl.setAttribute('aria-hidden', 'true');

  // テキスト部分のラッパー
  const textWrap = document.createElement('div');
  textWrap.className = 'spot-card__text';

  // スポット名
  const nameEl = document.createElement('p');
  nameEl.className = 'spot-card__name';
  nameEl.textContent = spot.displayName;

  // 説明文
  const descEl = document.createElement('p');
  descEl.className = 'spot-card__desc';
  descEl.textContent = spot.description;

  textWrap.appendChild(nameEl);
  textWrap.appendChild(descEl);
  card.appendChild(iconEl);
  card.appendChild(textWrap);

  // クリックで選択
  card.addEventListener('click', () => onSpotSelect(spot.id));

  // キーボード操作（Enter / Space で選択）
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSpotSelect(spot.id);
    }
  });

  return card;
}

/**
 * スポットが選択されたときの処理。
 * 同じスポットを再クリックすると選択解除する。
 *
 * @param {string} spotId - 選択されたスポットID
 */
function onSpotSelect(spotId) {
  const listEl = document.getElementById('spot-list');
  const departBtn = document.getElementById('depart-btn');
  if (!listEl || !departBtn) return;

  // 同じスポットを再クリック → 選択解除
  if (selectedSpotId === spotId) {
    selectedSpotId = null;
  } else {
    selectedSpotId = spotId;
  }

  // 全カードの選択状態を更新
  const allCards = listEl.querySelectorAll('.spot-card');
  allCards.forEach(card => {
    const isSelected = card.dataset.spotId === selectedSpotId;
    if (isSelected) {
      card.classList.add('is-selected');
      card.setAttribute('aria-checked', 'true');
    } else {
      card.classList.remove('is-selected');
      card.setAttribute('aria-checked', 'false');
    }
  });

  // 出発ボタンの活性・非活性を切り替え
  const hasSelection = selectedSpotId !== null;
  departBtn.disabled = !hasSelection;
  departBtn.setAttribute('aria-disabled', String(!hasSelection));
}

/**
 * 出発ボタンが押されたときの処理。
 *
 * 1. 選択スポットの Visit を作成する
 * 2. Visit をストアに保存する
 * 3. ペットの状態を home → visiting に遷移させる
 * 4. 待機画面へ遷移する
 */
function onDepart() {
  // スポット未選択時はボタン操作不可なので通常は到達しないが、防御的にガードする
  if (!selectedSpotId) return;

  const pet = loadPet();
  if (!pet) {
    console.error('[odekake] ペットデータが見つかりません');
    return;
  }

  // Visit を作成してストアに保存
  const visit = createVisit(selectedSpotId);
  saveCurrentVisit(visit);

  // ペットの状態を visiting に遷移させて保存
  const visitingPet = transitionPetState(pet, 'visiting');
  savePet(visitingPet);

  // 待機画面へ遷移
  goWaiting();
}
