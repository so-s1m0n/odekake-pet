/**
 * src/screens/waiting.js
 * 待機画面（旅の途中メモ）モジュール。
 *
 * 責務:
 *  - おでかけ中のペットが「不在である」ことを表現する
 *  - 出発からの経過時間・帰宅までの残り時間をカウントアップ/ダウン表示する
 *  - 残り時間が0になると帰宅可能状態であることをユーザーに通知する
 *  - 「帰宅チェック」ボタンが押されたとき isReturnReady を確認し、
 *    帰宅可能であればイベント生成→Visit完了→帰宅画面へ遷移する
 *
 * XSS対策: テキストの挿入はすべて textContent を使い、
 *           innerHTML への直接代入は行わない。
 */

import { isReturnReady, getVisitTiming, completeVisit } from '../domain/visit.js';
import { generateEvent } from '../domain/event-generator.js';
import { loadSyntheticSpot } from '../domain/synthetic-spot.js';
import { transitionPetState, PET_STATE } from '../domain/pet.js';
import { loadPet, savePet, loadCurrentVisit, saveCurrentVisit } from '../store.js';
import { goHomecoming } from '../router.js';

// ─────────────────────────────────────────────
// 待機中メッセージ（不在感を演出するランダムテキスト）
// ─────────────────────────────────────────────

const WAITING_MEMOS = [
  'いまごろ何してるかな……',
  'たのしんでるかな？',
  'おみやげ、あるかな',
  'そろそろかな……まだかな',
  'あっちはどんな景色だろう',
  'ひとりでだいじょうぶかな',
  'きっとたのしくやってるよ',
  'おかえり、待ってるよ',
];

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** setInterval のタイマーID。stopWaitingTimer() で停止する */
let timerId = null;

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * 待機画面を初期化し、タイマーを起動する。
 * 画面が表示されるたびに呼び出す。前のタイマーがあれば自動で停止する。
 *
 * @param {import('../domain/visit.js').Visit} visit
 *   進行中の Visit オブジェクト
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 *   スポット定義の配列（スポット名の表示に使用）
 */
export function initWaitingScreen(visit, spots) {
  // 既存のタイマーがあれば停止してから再起動する
  stopWaitingTimer();

  // スポット名とペット名を表示する
  renderWaitingHeader(visit, spots);

  // 途中メモをランダムに表示する
  renderRandomMemo();

  // 帰宅チェックボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const checkBtn = document.getElementById('check-return-btn');
  if (checkBtn) {
    const newCheckBtn = checkBtn.cloneNode(true);
    checkBtn.replaceWith(newCheckBtn);
    newCheckBtn.addEventListener('click', () => checkReturn(visit, spots));
  }

  // 「帰宅完了」メッセージを初期非表示にしておく
  const readyMsg = document.getElementById('return-ready-msg');
  if (readyMsg) {
    readyMsg.setAttribute('hidden', '');
  }

  // タイマーを起動する
  startTimer(visit, spots);
}

/**
 * タイマーを停止する。
 * 帰宅画面への遷移時や、外部（main.js など）から呼び出す。
 */
export function stopWaitingTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * スポット名とペット名をヘッダー部に表示する。
 *
 * @param {import('../domain/visit.js').Visit} visit
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function renderWaitingHeader(visit, spots) {
  // スポット名を表示する（友達訪問の場合は合成スポットをキャッシュから引く）
  const spot = spots.find(s => s.id === visit.spotId)
    || (visit.isFriendVisit ? loadSyntheticSpot() : null);
  const spotNameEl = document.getElementById('waiting-spot-name');
  if (spotNameEl) {
    if (spot) {
      // ペット名を組み合わせた文章を生成する
      const pet = loadPet();
      const petName = pet ? pet.name : 'あのこ';
      spotNameEl.textContent = `${petName} は ${spot.icon} ${spot.displayName} を訪問中...`;
    } else {
      spotNameEl.textContent = 'どこかを訪問中...';
    }
  }
}

/**
 * 「途中メモ」テキストをランダムに選んで表示する。
 */
function renderRandomMemo() {
  const memoEl = document.getElementById('waiting-memo-text');
  if (!memoEl) return;
  const idx = Math.floor(Math.random() * WAITING_MEMOS.length);
  memoEl.textContent = WAITING_MEMOS[idx];
}

/**
 * 1秒インターバルのタイマーを起動する。
 * 毎秒 updateTimerDisplay() を呼び、帰宅可能状態になれば通知する。
 *
 * @param {import('../domain/visit.js').Visit} visit
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function startTimer(visit, spots) {
  // 初回表示を即時実行
  updateTimerDisplay(visit);

  timerId = setInterval(() => {
    updateTimerDisplay(visit);

    // 帰宅可能になったら通知表示に切り替える（一度表示したら繰り返さない）
    if (isReturnReady(visit)) {
      showReturnReady();
    }
  }, 1000);
}

/**
 * 経過時間・残り時間のDOM表示を現在時刻に合わせて更新する。
 *
 * @param {import('../domain/visit.js').Visit} visit
 */
function updateTimerDisplay(visit) {
  const { elapsedMs, remainingMs } = getVisitTiming(visit);

  const elapsedEl   = document.getElementById('elapsed-time');
  const remainingEl = document.getElementById('remaining-time');

  if (elapsedEl) {
    elapsedEl.textContent = formatMs(elapsedMs);
  }
  if (remainingEl) {
    remainingEl.textContent = remainingMs > 0 ? formatMs(remainingMs) : '00:00';
  }
}

/**
 * 帰宅可能になったときのUIを表示する。
 * 残り時間ラベルを「帰宅OK！」に更新し、案内メッセージを表示する。
 */
function showReturnReady() {
  // 残り時間ラベルを更新する
  const remainingLabel = document.getElementById('remaining-time-label');
  if (remainingLabel) {
    remainingLabel.textContent = '帰宅できます！';
  }

  // 帰宅案内メッセージを表示する
  const readyMsg = document.getElementById('return-ready-msg');
  if (readyMsg) {
    readyMsg.removeAttribute('hidden');
  }

  // 「帰宅チェック」ボタンのラベルを更新する
  const checkBtn = document.getElementById('check-return-btn');
  if (checkBtn) {
    checkBtn.textContent = 'おかえり！ 🎉';
  }
}

/**
 * 「帰宅チェック」ボタンが押されたときの処理。
 *
 * - 帰宅可能であれば帰宅処理を実行する
 * - まだ帰宅できない場合はその旨を一時表示する
 *
 * @param {import('../domain/visit.js').Visit} visit
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function checkReturn(visit, spots) {
  if (!isReturnReady(visit)) {
    // 帰宅不可 → 一時メッセージを表示して処理を終了する
    showNotReadyMessage();
    return;
  }

  // 帰宅可能 → 帰宅処理を実行する
  executeReturn(visit, spots);
}

/**
 * 帰宅不可のときに一時メッセージを表示する。
 * 2秒後に自動で非表示にする。
 */
function showNotReadyMessage() {
  const checkBtn = document.getElementById('check-return-btn');
  if (!checkBtn) return;

  const originalText = checkBtn.textContent;
  checkBtn.textContent = 'まだおでかけ中だよ 🐾';
  checkBtn.disabled = true;

  setTimeout(() => {
    checkBtn.textContent = originalText;
    checkBtn.disabled = false;
  }, 2000);
}

/**
 * 帰宅処理を実行する。
 *
 * 1. ペットの状態を visiting → returning → home と順番に遷移させる
 * 2. 最新の Visit を localStorage から再読み込みして使う
 * 3. generateEvent() でイベントを生成する
 * 4. completeVisit() で Visit を完了状態にする
 * 5. ストアに保存する
 * 6. タイマーを停止して帰宅画面へ遷移する
 *
 * @param {import('../domain/visit.js').Visit} visit - 進行中の Visit
 * @param {import('../domain/event-generator.js').SpotDef[]} spots
 */
function executeReturn(visit, spots) {
  const pet = loadPet();
  if (!pet) {
    console.error('[waiting] ペットデータが見つかりません');
    return;
  }

  // スポット定義を取得する（友達訪問の場合は合成スポットをキャッシュから引く）
  const spot = spots.find(s => s.id === visit.spotId)
    || (visit.isFriendVisit ? loadSyntheticSpot() : null);
  if (!spot) {
    console.error('[waiting] スポットが見つかりません:', visit.spotId);
    return;
  }

  // ペットの状態遷移: visiting → returning → home
  const returningPet = transitionPetState(pet, PET_STATE.RETURNING);
  const homePet      = transitionPetState(returningPet, PET_STATE.HOME);

  // イベントを生成する（出発日時を渡して時間帯フィルタに使う）
  const departedAt = new Date(visit.departedAt);
  const { eventId, eventText, souvenirId } = generateEvent(spot, pet, departedAt);

  // 絵日記データを組み立てる（カード生成はM6で実装予定）
  const cardData = {
    spotId:     visit.spotId,
    petName:    pet.name,
    petType:    pet.type,
    eventText,
    souvenirId: souvenirId ?? null,
    returnedAt: new Date().toISOString(),
  };

  // Visit を完了状態にしてストアに保存する
  const completedVisit = completeVisit(visit, eventId, souvenirId ?? null, cardData);
  saveCurrentVisit(completedVisit);

  // ペットの最終状態をストアに保存する
  savePet(homePet);

  // タイマーを停止してから帰宅画面へ遷移する
  stopWaitingTimer();
  goHomecoming();
}

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

/**
 * ミリ秒を "MM:SS" 形式の文字列に変換する。
 * 60分を超える場合も MM は繰り上がる（例: 75:00）。
 *
 * @param {number} ms - ミリ秒（0以上）
 * @returns {string} "MM:SS" 形式
 */
function formatMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min      = Math.floor(totalSec / 60);
  const sec      = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
