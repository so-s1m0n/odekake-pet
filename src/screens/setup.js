/**
 * src/screens/setup.js
 * ペット登録画面（screen-setup）のUIロジック。
 * プリセット選択・名前入力・確定処理を担当する。
 */

import { createPet, NAME_MAX_LENGTH } from '../domain/pet.js';
import { savePet } from '../store.js';
import { goHome } from '../router.js';

// ─────────────────────────────────────────────
// モジュールスコープの状態（画面内ローカル）
// ─────────────────────────────────────────────

/** 現在選択中のペット種類ID */
let selectedType = null;

/** pets.jsonから受け取ったペット定義の配列 */
let petTypeDefinitions = [];

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * ペット登録画面を初期化し、イベントハンドラを登録する。
 * main.js の DOMContentLoaded 後に呼ぶこと。
 *
 * @param {Array<{id:string, displayName:string, personality:object}>} petTypes
 *   data/pets.json の petTypes 配列をそのまま渡す
 */
export function initSetupScreen(petTypes) {
  petTypeDefinitions = petTypes;

  const nameInput    = document.getElementById('pet-name-input');
  const confirmBtn   = document.getElementById('setup-confirm-btn');
  const nameCount    = document.getElementById('pet-name-count');

  if (!nameInput || !confirmBtn || !nameCount) {
    console.error('[setup] 必要なDOM要素が見つかりません');
    return;
  }

  // プリセットカードにクリックイベントを登録
  const cards = document.querySelectorAll('.js-preset-card');
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      onPresetSelect(card.dataset.petType);
    });
    // キーボード操作のためのイベント
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPresetSelect(card.dataset.petType);
      }
    });
  });

  // 名前入力イベント
  nameInput.addEventListener('input', () => {
    onNameInput(nameInput.value, nameCount, confirmBtn);
  });

  // 確定ボタン
  confirmBtn.addEventListener('click', () => {
    confirmSetup(nameInput.value);
  });

  // 初期状態: 確定ボタンを非活性に
  updateConfirmButton(confirmBtn, nameInput.value);
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * プリセットカードが選択されたときの処理。
 * 選択状態のクラスを切り替え、プレビューSVGを更新する。
 *
 * @param {string} type - ペット種類ID
 */
function onPresetSelect(type) {
  selectedType = type;

  // すべてのカードから選択クラスを外す
  document.querySelectorAll('.js-preset-card').forEach((card) => {
    const isSelected = card.dataset.petType === type;
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  // プレビューSVGを更新する
  updatePreview(type);

  // 確定ボタンの活性化状態を更新する
  const nameInput  = document.getElementById('pet-name-input');
  const confirmBtn = document.getElementById('setup-confirm-btn');
  if (nameInput && confirmBtn) {
    updateConfirmButton(confirmBtn, nameInput.value);
  }
}

/**
 * 名前入力フィールドの変更を処理する。
 * 文字数カウンタを更新し、確定ボタンの活性化状態を変える。
 *
 * @param {string} value - 現在の入力値
 * @param {HTMLElement} countEl - 文字数表示要素
 * @param {HTMLButtonElement} confirmBtn - 確定ボタン
 */
function onNameInput(value, countEl, confirmBtn) {
  const len = value.length;
  countEl.textContent = `${len}/${NAME_MAX_LENGTH}`;
  updateConfirmButton(confirmBtn, value);
}

/**
 * 確定ボタンの活性/非活性を更新する。
 * ペットが選択済みかつ名前が1〜12文字のときのみ活性化する。
 *
 * @param {HTMLButtonElement} btn
 * @param {string} nameValue
 */
function updateConfirmButton(btn, nameValue) {
  const trimmed = nameValue.trim();
  const valid = selectedType !== null
    && trimmed.length >= 1
    && trimmed.length <= NAME_MAX_LENGTH;
  btn.disabled = !valid;
}

/**
 * プレビューエリアのSVGを指定のペット種類に更新する。
 * index.html の <template id="pet-svg-{type}-idle"> から内容をクローンして挿入する。
 *
 * @param {string} type - ペット種類ID
 */
function updatePreview(type) {
  const container = document.getElementById('setup-preview-container');
  if (!container) return;

  const templateId = `pet-svg-${type}-idle`;
  const template   = document.getElementById(templateId);
  if (!template) {
    console.warn(`[setup] テンプレートが見つかりません: #${templateId}`);
    return;
  }

  // 既存のコンテンツを消去してSVGを挿入
  container.textContent = '';
  container.appendChild(template.content.cloneNode(true));
}

/**
 * 登録を確定してホーム画面へ遷移する。
 * createPet → savePet → goHome の順に実行する。
 *
 * @param {string} nameValue
 */
function confirmSetup(nameValue) {
  if (!selectedType) return;

  // 選択中ペット種類の性格パラメータ重みを取得
  const def = petTypeDefinitions.find((p) => p.id === selectedType);
  if (!def) {
    console.error('[setup] ペット種類定義が見つかりません:', selectedType);
    return;
  }

  try {
    const pet = createPet(selectedType, nameValue, def.personality);
    savePet(pet);
    // ホーム画面を初期化してから遷移する
    // （initHomeScreen は main.js 側で goHome 後に呼ぶため、ここではイベントで通知）
    const event = new CustomEvent('petregistered', { detail: { pet } });
    document.dispatchEvent(event);
    goHome();
  } catch (err) {
    // バリデーションエラーはユーザーに通知する（UI的にはconfirmBtnがdisabledなので通常到達しない）
    console.error('[setup] ペット登録エラー:', err.message);
    alert(err.message);
  }
}
