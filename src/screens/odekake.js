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
import { deriveMemory } from '../domain/memory.js';
import { loadPet, savePet, saveCurrentVisit } from '../store.js';
import { goHome, goWaiting } from '../router.js';
import { decodeFriendCode, shortHash } from '../domain/odekake-code.js';
import { saveSyntheticSpot } from '../domain/synthetic-spot.js';

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** 現在選択中のスポットID（未選択は null）*/
let selectedSpotId = null;

/** 友達訪問用イベントテンプレート（friend-events.json。M7） */
let currentFriendEvents = [];

/** 検証済みのおともだちコードのペイロード（未検証は null。M7） */
let verifiedPayload = null;

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
export function initOdekakeScreen(spots, friendEvents = [], visits = []) {
  // 選択状態をリセット
  selectedSpotId = null;
  currentFriendEvents = friendEvents || [];
  verifiedPayload = null;

  // 冒険履歴から記憶を導出し、バッジとおすすめに使う
  const memory = deriveMemory(visits);

  // スポット一覧を描画する
  renderSpotList(spots, memory);

  // 記憶にもとづくおすすめ文を表示する
  renderMemoryHint(spots, memory);

  // 友達コード入力まわりを初期状態に戻す（M7）
  const friendInput = document.getElementById('friend-code-input');
  if (friendInput) friendInput.value = '';
  const friendError = document.getElementById('friend-code-error');
  if (friendError) friendError.hidden = true;
  const friendPreview = document.getElementById('friend-code-preview');
  if (friendPreview) friendPreview.hidden = true;

  // 「このコードで訪問」ボタンのイベントを設定（clone で差し替え）
  const verifyBtn = document.getElementById('verify-friend-code-btn');
  if (verifyBtn) {
    const newVerifyBtn = verifyBtn.cloneNode(true);
    verifyBtn.replaceWith(newVerifyBtn);
    newVerifyBtn.addEventListener('click', () => onVerifyFriendCode());
  }

  // 「出発する」ボタン（友達訪問用）のイベントを設定（clone で差し替え）
  const departFriendBtn = document.getElementById('depart-friend-btn');
  if (departFriendBtn) {
    const newDepartFriendBtn = departFriendBtn.cloneNode(true);
    departFriendBtn.replaceWith(newDepartFriendBtn);
    newDepartFriendBtn.addEventListener('click', () => onDepartFriend());
  }

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
 * @param {import('../domain/memory.js').PetMemory} memory
 */
function renderSpotList(spots, memory) {
  const listEl = document.getElementById('spot-list');
  if (!listEl) return;

  // 既存の子要素をすべて削除
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  spots.forEach(spot => {
    const card = buildSpotCard(spot, memory);
    listEl.appendChild(card);
  });
}

/**
 * 記憶にもとづくおすすめ文を表示する。
 * まだ行ったことのない場所があればそちらへの興味を、
 * 全部行ったことがあればお気に入りを表示する。
 * 冒険がまだ無い場合は何も表示しない。
 *
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 * @param {import('../domain/memory.js').PetMemory} memory
 */
function renderMemoryHint(spots, memory) {
  const hintEl = document.getElementById('odekake-memory-hint');
  if (!hintEl) return;

  const pet = loadPet();
  const petName = pet ? pet.name : 'あのこ';

  if (!memory || memory.totalTrips === 0) {
    hintEl.textContent = '';
    return;
  }

  const unvisited = spots.find(s => !memory.tripsBySpot[s.id]);
  if (unvisited) {
    hintEl.textContent =
      `🐾 ${petName}は、まだ行ったことのない「${unvisited.displayName}」が気になるみたい`;
    return;
  }

  const favorite = spots.find(s => s.id === memory.favoriteSpotId);
  hintEl.textContent = favorite
    ? `🐾 ${petName}のお気に入りは「${favorite.displayName}」みたい。また行く？`
    : '';
}

/**
 * スポット1件分のカード要素を生成して返す。
 *
 * @param {import('../domain/event-generator.js').SpotDef} spot
 * @param {import('../domain/memory.js').PetMemory} [memory]
 * @returns {HTMLElement}
 */
function buildSpotCard(spot, memory) {
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

  // 記憶バッジ（行った回数・お気に入り・はじめて）
  if (memory) {
    const count = memory.tripsBySpot[spot.id] || 0;
    const badgeEl = document.createElement('p');
    badgeEl.className = 'spot-card__badge';
    if (count === 0) {
      badgeEl.textContent = '✨ はじめての場所';
    } else if (spot.id === memory.favoriteSpotId && memory.totalTrips >= 2) {
      badgeEl.textContent = `⭐ お気に入り ・ ${count}回行った`;
    } else {
      badgeEl.textContent = `🐾 ${count}回行ったことがある`;
    }
    textWrap.appendChild(badgeEl);
  }

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
 * 「このコードで訪問」ボタンが押されたときの処理（M7）。
 * おともだちコードを検証し、成功したらプレビューを表示する。
 */
function onVerifyFriendCode() {
  const input = document.getElementById('friend-code-input');
  const errorEl = document.getElementById('friend-code-error');
  const previewEl = document.getElementById('friend-code-preview');
  const previewTextEl = document.getElementById('friend-code-preview-text');
  if (!input || !errorEl || !previewEl || !previewTextEl) return;

  const { payload, error } = decodeFriendCode(input.value);
  if (error) {
    verifiedPayload = null;
    errorEl.textContent = error;
    errorEl.hidden = false;
    previewEl.hidden = true;
    return;
  }

  verifiedPayload = payload;
  errorEl.hidden = true;
  previewTextEl.textContent = `${payload.petName} ちゃんのおうちを訪問します`;
  previewEl.hidden = false;
}

/**
 * FriendCodePayload と友達訪問用イベントから合成スポット定義を組み立てる（M7）。
 * イベント文の {hostName} はここでホスト名に置換しておく（設計書 2.5節）。
 *
 * @param {import('../domain/odekake-code.js').FriendCodePayload} payload
 * @param {Object[]} friendEvents - friend-events.json のテンプレート群
 * @returns {Object} SyntheticSpot
 */
function buildSyntheticSpot(payload, friendEvents) {
  return {
    id: 'friend-' + shortHash(payload.petName),
    displayName: `${payload.petName} のおうち`,
    themeColor: '#b8d4e8',
    icon: '🏠',
    events: (friendEvents || []).map(t => ({
      ...t,
      text: t.text.replaceAll('{hostName}', payload.petName),
    })),
    hostPet: {
      name: payload.petName,
      type: payload.petType,
      personality: { curiosity: payload.curiosity, sociability: payload.sociability },
    },
  };
}

/**
 * 「出発する」ボタン（友達訪問用）が押されたときの処理（M7）。
 * 合成スポットをセッションに保存し、isFriendVisit フラグ付きの Visit で出発する。
 */
function onDepartFriend() {
  if (!verifiedPayload) return;

  const pet = loadPet();
  if (!pet) {
    console.error('[odekake] ペットデータが見つかりません');
    return;
  }

  const syntheticSpot = buildSyntheticSpot(verifiedPayload, currentFriendEvents);
  saveSyntheticSpot(syntheticSpot);

  const visit = { ...createVisit(syntheticSpot.id), isFriendVisit: true };
  saveCurrentVisit(visit);

  const visitingPet = transitionPetState(pet, 'visiting');
  savePet(visitingPet);

  goWaiting();
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
