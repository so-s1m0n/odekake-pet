/**
 * src/screens/homecoming.js
 * 帰宅画面モジュール。
 *
 * 責務:
 *  - 帰宅した Visit のイベント文・おみやげ情報を画面に表示する
 *  - ペットのスプライト画像を表示する（帰宅状態）
 *  - 「絵日記をつくる」ボタン: M6実装まではスタブ
 *  - 「おうちへ」ボタン: Visit を履歴に追記してストアから削除し、ホーム画面へ遷移する
 *
 * XSS対策: テキストの挿入はすべて textContent / createElement を使い、
 *           innerHTML への直接代入は行わない。
 */

import { appendVisit, clearCurrentVisit } from '../store.js';
import { goHome } from '../router.js';

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** 現在表示中の完了済み Visit。「おうちへ」ボタンで参照する */
let currentVisit = null;

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * 帰宅画面を初期化して Visit の結果を表示する。
 * waiting.js の executeReturn() から goHomecoming() が呼ばれた後、
 * main.js がこの関数を呼び出す想定。
 *
 * @param {import('../domain/visit.js').Visit} visit
 *   completeVisit() 済みの Visit（status='completed', cardData 設定済み）
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 *   スポット定義の配列（スポット名の表示に使用）
 */
export function initHomecomingScreen(visit, spots) {
  // モジュールスコープに保持する（onGoHome で参照する）
  currentVisit = visit;

  // 結果を描画する
  renderEventResult(visit, spots);

  // 「絵日記をつくる」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const makeCardBtn = document.getElementById('make-card-btn');
  if (makeCardBtn) {
    const newMakeCardBtn = makeCardBtn.cloneNode(true);
    makeCardBtn.replaceWith(newMakeCardBtn);
    newMakeCardBtn.addEventListener('click', () => onMakeCard());
  }

  // 「おうちへ」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const goHomeBtn = document.getElementById('go-home-btn');
  if (goHomeBtn) {
    const newGoHomeBtn = goHomeBtn.cloneNode(true);
    goHomeBtn.replaceWith(newGoHomeBtn);
    newGoHomeBtn.addEventListener('click', () => onGoHome());
  }
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * 帰宅した Visit の内容（ペット名・スポット名・イベント文・おみやげ）を
 * 画面の各要素に書き込む。
 *
 * @param {import('../domain/visit.js').Visit} visit
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function renderEventResult(visit, spots) {
  const cardData = visit.cardData;

  // cardData が存在しない場合はログだけ出して終了（防御的実装）
  if (!cardData) {
    console.error('[homecoming] cardData が設定されていません:', visit);
    return;
  }

  // スポット定義を取得する
  const spot = spots.find(s => s.id === visit.spotId);

  // ── ペットのスプライト表示 ──────────────────────────
  renderPetSprite(cardData.petType, cardData.petName);

  // ── スポット名 ─────────────────────────────────────
  const spotNameEl = document.getElementById('homecoming-spot-name');
  if (spotNameEl) {
    if (spot) {
      spotNameEl.textContent = `${spot.icon} ${spot.displayName}`;
    } else {
      spotNameEl.textContent = visit.spotId;
    }
  }

  // ── イベント文 ─────────────────────────────────────
  const eventTextEl = document.getElementById('homecoming-event-text');
  if (eventTextEl) {
    // イベント文は改行を含む場合があるため、複数の <p> に分割して表示する
    renderMultilineText(eventTextEl, cardData.eventText);
  }

  // ── おみやげ ───────────────────────────────────────
  renderSouvenir(visit, spots);
}

/**
 * ペットのスプライト画像とペット名を表示する。
 * 画像ファイルが存在しない場合は絵文字アイコンで代替する。
 *
 * @param {string} petType - ペット種類ID
 * @param {string} petName - ペット名
 */
function renderPetSprite(petType, petName) {
  const spriteEl = document.getElementById('homecoming-sprite');
  if (spriteEl) {
    // 既存の子要素をクリア
    while (spriteEl.firstChild) {
      spriteEl.removeChild(spriteEl.firstChild);
    }

    // ペット画像を設定する（assets/pets/{petType}/idle.png を使用）
    const img = document.createElement('img');
    img.src = `assets/pets/${petType}/idle.png`;
    img.alt = petName;
    img.className = 'homecoming-sprite__img';

    // 画像が見つからない場合は絵文字で代替する
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'homecoming-sprite__fallback';
      fallback.textContent = '🐾';
      fallback.setAttribute('aria-label', petName);
      if (spriteEl.contains(img)) {
        spriteEl.replaceChild(fallback, img);
      }
    });

    spriteEl.appendChild(img);
  }

  // ペット名の表示
  const petNameEl = document.getElementById('homecoming-pet-name');
  if (petNameEl) {
    petNameEl.textContent = `${petName} が帰ってきたよ`;
  }
}

/**
 * 複数行テキストを改行で分割して要素に設定する。
 * 既存の子要素をクリアしてから、各行を <span> として追加する。
 * 空の要素に対してテキスト直接書き込みの場合は textContent を使う。
 *
 * @param {HTMLElement} containerEl - テキストを表示するコンテナ要素
 * @param {string}      text        - 改行（\n）区切りのテキスト
 */
function renderMultilineText(containerEl, text) {
  // 既存の子要素をクリア
  while (containerEl.firstChild) {
    containerEl.removeChild(containerEl.firstChild);
  }

  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    const span = document.createElement('span');
    span.textContent = line;
    containerEl.appendChild(span);
    // 最後の行以外には改行要素を追加する
    if (idx < lines.length - 1) {
      containerEl.appendChild(document.createElement('br'));
    }
  });
}

/**
 * おみやげ情報を画面に表示する。
 * おみやげが存在しない場合はセクション全体を非表示にする。
 *
 * @param {import('../domain/visit.js').Visit} visit
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function renderSouvenir(visit, spots) {
  const souvenirSection = document.getElementById('homecoming-souvenir');
  const souvenirNameEl  = document.getElementById('homecoming-souvenir-name');

  if (!souvenirSection) return;

  const souvenirId = visit.souvenirId;
  if (!souvenirId) {
    // おみやげなし → セクションを非表示
    souvenirSection.setAttribute('hidden', '');
    return;
  }

  // スポットからおみやげ定義を検索する
  const spot = spots.find(s => s.id === visit.spotId);
  const souvenir = spot?.souvenirs?.find(sv => sv.id === souvenirId);

  if (souvenir && souvenirNameEl) {
    souvenirNameEl.textContent = `${souvenir.icon} ${souvenir.displayName}`;
  } else if (souvenirNameEl) {
    // おみやげIDは存在するが定義が見つからない場合の fallback
    souvenirNameEl.textContent = souvenirId;
  }

  // セクションを表示する
  souvenirSection.removeAttribute('hidden');
}

/**
 * 「絵日記をつくる」ボタンが押されたときの処理。
 * M6 実装まではスタブ。押したことをコンソールに記録する。
 */
function onMakeCard() {
  // M6（src/domain/card-generator.js）で実装予定
  console.info('[homecoming] 絵日記カード生成機能はM6で実装予定です');
  alert('絵日記カード機能は近日公開予定です 📖');
}

/**
 * 「おうちへ」ボタンが押されたときの処理。
 *
 * 1. 完了済み Visit を履歴に追記する
 * 2. 進行中 Visit をストアから削除する
 * 3. ホーム画面へ遷移する
 */
function onGoHome() {
  if (!currentVisit) {
    console.error('[homecoming] currentVisit が設定されていません');
    goHome();
    return;
  }

  // Visit を履歴に追記してから進行中のVisitを削除する
  appendVisit(currentVisit);
  clearCurrentVisit();

  // モジュールスコープの状態をリセット
  currentVisit = null;

  // ホーム画面へ遷移する
  goHome();
}
