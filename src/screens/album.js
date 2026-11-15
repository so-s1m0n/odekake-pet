/**
 * src/screens/album.js
 * おもいでアルバム画面モジュール。
 *
 * 責務:
 *  - おみやげ棚: 獲得済みおみやげをスポット別に表示する（TASK-20）
 *  - 旅のきろく: 完了済み Visit を帰宅日時の降順で一覧表示する（TASK-20）
 *  - 「もう一度見る」ボタン: 過去の CardData から絵日記カードを再生成して
 *    プレビュー表示する（TASK-20）
 *  - 「絵日記を保存」ボタン: プレビュー中のカードを PNG として保存する（TASK-20）
 *  - 「← ホームへ」ボタン: ホーム画面へ遷移する（TASK-20）
 *
 * XSS対策: テキストの挿入はすべて textContent / createElement を使い、
 *           innerHTML への直接代入は行わない。
 */

import { goHome } from '../router.js';
import { generateCard, downloadCardAsPng } from '../domain/card-generator.js';

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** 現在プレビュー表示中の CardData。「絵日記を保存」ボタンで参照する */
let currentCardData = null;

/** 現在プレビュー表示中の CardData に対応するスポット定義 */
let currentSpot = null;

/** initAlbumScreen に渡されたスポット定義一覧。onViewCard で参照する */
let currentSpots = [];

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * アルバム画面を初期化する。画面遷移ごとに呼ぶ（TASK-23 で配線予定）。
 *
 * @param {import('../domain/visit.js').Visit[]} visits
 *   loadVisitsAll() の結果（完了済み Visit の履歴）
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 *   spots.json から読み込んだスポット定義の配列
 */
export function initAlbumScreen(visits, spots) {
  currentSpots = spots || [];
  const visitList = visits || [];

  // 前の表示のカードが残らないよう、プレビューを隠して保存ボタンを無効化する
  const previewArea = document.getElementById('album-card-preview');
  if (previewArea) previewArea.hidden = true;
  const saveBtnInit = document.getElementById('album-save-card-btn');
  if (saveBtnInit) {
    saveBtnInit.disabled = true;
    saveBtnInit.setAttribute('aria-disabled', 'true');
  }
  currentCardData = null;
  currentSpot = null;

  renderSouvenirShelf(visitList, currentSpots);
  renderVisitList(visitList, currentSpots);

  // 「← ホームへ」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const backBtn = document.getElementById('album-back-btn');
  if (backBtn) {
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.replaceWith(newBackBtn);
    newBackBtn.addEventListener('click', () => goHome());
  }

  // 「絵日記を保存」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const saveCardBtn = document.getElementById('album-save-card-btn');
  if (saveCardBtn) {
    const newSaveCardBtn = saveCardBtn.cloneNode(true);
    saveCardBtn.replaceWith(newSaveCardBtn);
    newSaveCardBtn.addEventListener('click', () => onSaveCard());
  }

  // 「閉じる」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const closeBtn = document.getElementById('album-close-card-btn');
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.replaceWith(newCloseBtn);
    newCloseBtn.addEventListener('click', () => onCloseCard());
  }
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * おみやげ棚を描画する。設計書 3.2節どおり:
 *  souvenirId が null でない Visit を spotId でグループ化し、
 *  グループごとに .souvenir-group を #souvenir-list に挿入する。
 *  おみやげゼロ件のときは .souvenir-shelf__empty を表示する。
 *
 * @param {import('../domain/visit.js').Visit[]} visits
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function renderSouvenirShelf(visits, spots) {
  const listEl = document.getElementById('souvenir-list');
  if (!listEl) return;

  // 既存の子要素をクリア
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  // souvenirId がある Visit だけを抽出し、spotId でグループ化する
  // （入力の配列は変更しない。グループ内の順序は Visit の並びを保つ）
  const groups = new Map();
  for (const visit of visits) {
    if (!visit.souvenirId) continue;
    if (!groups.has(visit.spotId)) {
      groups.set(visit.spotId, []);
    }
    groups.get(visit.spotId).push(visit);
  }

  if (groups.size === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'souvenir-shelf__empty';
    emptyEl.textContent = 'まだおみやげはないよ';
    listEl.appendChild(emptyEl);
    return;
  }

  for (const [spotId, groupVisits] of groups) {
    const spot = spots.find(s => s.id === spotId);

    const groupEl = document.createElement('div');
    groupEl.className = 'souvenir-group';

    const titleEl = document.createElement('h3');
    titleEl.className = 'souvenir-group__title';
    titleEl.textContent = spot ? spot.displayName : spotId;
    groupEl.appendChild(titleEl);

    // グループ内は横並び・折り返し（album.css の .souvenir-group .souvenir-list）
    const cardsEl = document.createElement('div');
    cardsEl.className = 'souvenir-list';

    for (const visit of groupVisits) {
      const souvenir = spot?.souvenirs?.find(sv => sv.id === visit.souvenirId);

      const cardEl = document.createElement('div');
      cardEl.className = 'souvenir-card';

      const nameEl = document.createElement('span');
      nameEl.className = 'souvenir-card__name';
      nameEl.textContent = souvenir
        ? `${souvenir.icon} ${souvenir.displayName}`
        : visit.souvenirId;
      cardEl.appendChild(nameEl);

      const spotEl = document.createElement('span');
      spotEl.className = 'souvenir-card__spot';
      spotEl.textContent = spot ? spot.displayName : spotId;
      cardEl.appendChild(spotEl);

      cardsEl.appendChild(cardEl);
    }

    groupEl.appendChild(cardsEl);
    listEl.appendChild(groupEl);
  }
}

/**
 * 旅のきろくを描画する。設計書 3.2節どおり:
 *  returnedAt の降順にソートし、各 Visit に対し .visit-card を生成して
 *  #visit-list に挿入する。cardData がある Visit にだけ「もう一度見る」
 *  ボタンを付ける。0件のときは空メッセージとホーム誘導ボタンを表示する。
 *
 * @param {import('../domain/visit.js').Visit[]} visits
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function renderVisitList(visits, spots) {
  const listEl = document.getElementById('visit-list');
  if (!listEl) return;

  // 既存の子要素をクリア
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  // 件数を表示する（0件のときは空にする）
  const countEl = document.getElementById('visit-count');
  if (countEl) {
    countEl.textContent = visits.length > 0 ? `（${visits.length}件）` : '';
  }

  if (visits.length === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'visit-list__empty';
    emptyEl.textContent = 'まだ旅のきろくはないよ';
    listEl.appendChild(emptyEl);

    const homeBtn = document.createElement('button');
    homeBtn.id = 'to-home-from-album-btn';
    homeBtn.className = 'btn btn--secondary';
    homeBtn.textContent = 'ホームへ';
    homeBtn.addEventListener('click', () => goHome());
    listEl.appendChild(homeBtn);
    return;
  }

  // returnedAt の降順にソートする（入力の配列は変更しない）
  const sorted = [...visits].sort((a, b) => {
    const aTime = new Date(visitReturnedAt(a)).getTime();
    const bTime = new Date(visitReturnedAt(b)).getTime();
    return bTime - aTime;
  });

  for (const visit of sorted) {
    const spot = spots.find(s => s.id === visit.spotId);
    const cardData = visit.cardData;

    const cardEl = document.createElement('article');
    cardEl.className = 'visit-card';

    // 日付とスポット名の行
    const headerEl = document.createElement('div');
    headerEl.className = 'visit-card__header';

    const dateEl = document.createElement('span');
    dateEl.className = 'visit-card__date';
    dateEl.textContent = formatDateDot(visitReturnedAt(visit));
    headerEl.appendChild(dateEl);

    const spotEl = document.createElement('span');
    spotEl.className = 'visit-card__spot';
    spotEl.textContent = spot ? `${spot.icon} ${spot.displayName}` : visit.spotId;
    headerEl.appendChild(spotEl);

    cardEl.appendChild(headerEl);

    // 出来事テキストの冒頭 40 文字
    if (cardData?.eventText) {
      const textEl = document.createElement('p');
      textEl.className = 'visit-card__text';
      textEl.textContent = cardData.eventText.slice(0, 40);
      cardEl.appendChild(textEl);
    }

    // おみやげの行（ある場合のみ）
    if (visit.souvenirId) {
      const souvenir = spot?.souvenirs?.find(sv => sv.id === visit.souvenirId);
      const souvenirEl = document.createElement('p');
      souvenirEl.className = 'visit-card__souvenir';
      souvenirEl.textContent = souvenir
        ? `おみやげ: ${souvenir.icon} ${souvenir.displayName}`
        : `おみやげ: ${visit.souvenirId}`;
      cardEl.appendChild(souvenirEl);
    }

    // cardData がある場合のみ「もう一度見る」ボタンを付ける
    if (cardData) {
      const actionEl = document.createElement('div');
      actionEl.className = 'visit-card__action';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn btn--secondary';
      viewBtn.textContent = 'もう一度見る 📖';
      viewBtn.addEventListener('click', () => onViewCard(cardData, spot));
      actionEl.appendChild(viewBtn);

      cardEl.appendChild(actionEl);
    }

    listEl.appendChild(cardEl);
  }
}

/**
 * Visit の帰宅日時を返す。cardData.returnedAt がなければ departedAt を使う。
 *
 * @param {import('../domain/visit.js').Visit} visit
 * @returns {string} ISO 8601 形式の日時文字列
 */
function visitReturnedAt(visit) {
  return visit.cardData?.returnedAt || visit.departedAt;
}

/**
 * ISO 8601 文字列を「YYYY.MM.DD」形式に変換して返す。
 * 設計書 1.3節の表示例（2026.11.01）どおり、月・日はゼロ埋めする。
 *
 * @param {string} isoString - ISO 8601 形式の日時文字列
 * @returns {string} 例: '2026.11.01'
 */
function formatDateDot(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * 「もう一度見る」ボタンが押されたときの処理（TASK-20）。
 * 設計書 3.2節どおり:
 *  1. #album-card-preview を表示する
 *  2. generateCard(cardData, albumCanvas, spot) を await で呼ぶ
 *  3. 完了後 #album-save-card-btn を有効化する
 *
 * @param {import('../domain/visit.js').CardData} cardData
 * @param {import('../domain/event-generator.js').SpotDef|undefined} spot
 */
async function onViewCard(cardData, spot) {
  currentCardData = cardData;
  currentSpot = spot || { themeColor: '#6a3fa0' };

  const canvas = document.getElementById('album-diary-canvas');
  if (!canvas) {
    console.error('[album] #album-diary-canvas が見つかりません');
    return;
  }

  const previewArea = document.getElementById('album-card-preview');
  if (previewArea) previewArea.hidden = false;

  await generateCard(cardData, canvas, currentSpot);

  const saveBtn = document.getElementById('album-save-card-btn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.setAttribute('aria-disabled', 'false');
  }
}

/**
 * 「絵日記を保存」ボタンが押されたときの処理。
 * プレビュー中の Canvas を PNG ファイルとして端末に保存させる。
 */
function onSaveCard() {
  if (!currentCardData) {
    console.error('[album] プレビュー中のカードがありません');
    return;
  }

  const canvas = document.getElementById('album-diary-canvas');
  if (!canvas) {
    console.error('[album] #album-diary-canvas が見つかりません');
    return;
  }

  downloadCardAsPng(canvas, currentCardData.returnedAt);
}

/**
 * 「閉じる」ボタンが押されたときの処理。
 * カード再表示エリアを非表示にする。
 */
function onCloseCard() {
  const previewArea = document.getElementById('album-card-preview');
  if (previewArea) previewArea.hidden = true;
}
