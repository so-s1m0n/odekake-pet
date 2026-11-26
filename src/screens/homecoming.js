/**
 * src/screens/homecoming.js
 * 帰宅画面モジュール。
 *
 * 責務:
 *  - 帰宅した Visit のイベント文・おみやげ情報を画面に表示する
 *  - ペットのスプライト画像を表示する（帰宅状態）
 *  - 「絵日記をつくる」ボタン: AI日記（diary-ai）を試みてから generateCard で
 *    絵日記カードを生成してプレビュー表示する（TASK-19 / #BuildHybridAI）
 *    AI が使えない場合は従来のテンプレート文のままカードを作る
 *  - 「絵日記を保存」ボタン: プレビュー中のカードを PNG として保存する（TASK-19）
 *  - 「おうちへ」ボタン: Visit を履歴に追記してストアから削除し、ホーム画面へ遷移する
 *
 * XSS対策: テキストの挿入はすべて textContent / createElement を使い、
 *           innerHTML への直接代入は行わない。
 */

import { appendVisit, clearCurrentVisit, loadPet } from '../store.js';
import { goHome } from '../router.js';
import { generateCard, downloadCardAsPng } from '../domain/card-generator.js';
import {
  generateDiaryText,
  INFERENCE_SOURCE,
  getLastAiError,
  clearAiError,
} from '../ai/diary-ai.js';
import { encodeFootprintCode } from '../domain/odekake-code.js';
import { clearSyntheticSpot } from '../domain/synthetic-spot.js';

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** 現在表示中の完了済み Visit。「おうちへ」ボタンで参照する */
let currentVisit = null;

/** 現在表示中の Visit に対応するスポット定義一覧。onMakeCard で参照する */
let currentSpots = [];

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
  // モジュールスコープに保持する（onGoHome / onMakeCard で参照する）
  currentVisit = visit;
  currentSpots = spots || [];

  // 結果を描画する
  renderEventResult(visit, spots);

  // 前の Visit の失敗理由が残らないよう、AI日記の診断表示を初期化する
  clearAiError();
  renderAiDiagnostics();

  // 前の Visit のカードが残らないよう、プレビューを隠して保存ボタンを無効化する
  const previewArea = document.getElementById('card-preview-area');
  if (previewArea) previewArea.hidden = true;
  const saveBtnInit = document.getElementById('save-card-btn');
  if (saveBtnInit) {
    saveBtnInit.disabled = true;
    saveBtnInit.setAttribute('aria-disabled', 'true');
  }

  // 「絵日記をつくる」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const makeCardBtn = document.getElementById('make-card-btn');
  if (makeCardBtn) {
    const newMakeCardBtn = makeCardBtn.cloneNode(true);
    makeCardBtn.replaceWith(newMakeCardBtn);
    newMakeCardBtn.addEventListener('click', () => onMakeCard());
  }

  // 「絵日記を保存」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const saveCardBtn = document.getElementById('save-card-btn');
  if (saveCardBtn) {
    const newSaveCardBtn = saveCardBtn.cloneNode(true);
    saveCardBtn.replaceWith(newSaveCardBtn);
    newSaveCardBtn.addEventListener('click', () => onSaveCard());
  }

  // 「おうちへ」ボタンのイベントを設定（重複登録を避けるため clone で差し替え）
  const goHomeBtn = document.getElementById('go-home-btn');
  if (goHomeBtn) {
    const newGoHomeBtn = goHomeBtn.cloneNode(true);
    goHomeBtn.replaceWith(newGoHomeBtn);
    newGoHomeBtn.addEventListener('click', () => onGoHome());
  }

  // 足跡コード発行ボタンは友達訪問のときだけ表示する（M7・TASK-36）
  const issueFootprintBtn = document.getElementById('issue-footprint-code-btn');
  if (issueFootprintBtn) {
    issueFootprintBtn.hidden = visit.isFriendVisit !== true;
    const newIssueBtn = issueFootprintBtn.cloneNode(true);
    issueFootprintBtn.replaceWith(newIssueBtn);
    newIssueBtn.hidden = visit.isFriendVisit !== true;
    newIssueBtn.addEventListener('click', () => onIssueFootprintCode());
  }

  // 足跡コードモーダルのコピー・閉じるボタン（M7・TASK-36）
  const copyFootprintBtn = document.getElementById('copy-footprint-code-btn');
  if (copyFootprintBtn) {
    const newCopyBtn = copyFootprintBtn.cloneNode(true);
    copyFootprintBtn.replaceWith(newCopyBtn);
    newCopyBtn.addEventListener('click', () => onCopyFootprintCode());
  }
  const closeFootprintBtn = document.getElementById('close-footprint-code-modal-btn');
  if (closeFootprintBtn) {
    const newCloseBtn = closeFootprintBtn.cloneNode(true);
    closeFootprintBtn.replaceWith(newCloseBtn);
    newCloseBtn.addEventListener('click', () => {
      const modal = document.getElementById('footprint-code-modal');
      if (modal) modal.hidden = true;
    });
  }
}

/**
 * 「足跡コードを発行」ボタンが押されたときの処理（M7・TASK-36）。
 * 完了済み Visit の cardData から足跡コードを生成してモーダルに表示する。
 */
function onIssueFootprintCode() {
  if (!currentVisit || !currentVisit.cardData) {
    console.error('[homecoming] cardData が設定されていません:', currentVisit);
    return;
  }
  const { cardData } = currentVisit;
  const { code, error } = encodeFootprintCode({
    v: 1,
    visitorPetName: cardData.petName,
    visitorPetType: cardData.petType,
    visitedAt: cardData.returnedAt,
    eventSummary: cardData.eventText,
  });
  if (error) {
    alert(error);
    return;
  }
  const output = document.getElementById('footprint-code-output');
  if (output) output.value = code;
  const modal = document.getElementById('footprint-code-modal');
  if (modal) modal.hidden = false;
}

/**
 * 「コピー」ボタン（足跡コード）が押されたときの処理（M7・TASK-36）。
 * クリップボードへコピーし、ラベルを2秒間「コピーしました！」に変える。
 */
async function onCopyFootprintCode() {
  const output = document.getElementById('footprint-code-output');
  const btn = document.getElementById('copy-footprint-code-btn');
  if (!output) return;
  try {
    await navigator.clipboard.writeText(output.value);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'コピーしました！';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
  } catch (e) {
    console.error('[homecoming] クリップボードへのコピーに失敗しました:', e);
    output.select();
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
 * 「絵日記をつくる」ボタンが押されたときの処理（TASK-19 本実装）。
 * 設計書 3.3節どおり:
 *  1. AI日記（diary-ai）で一人称の日記文の生成を試みる
 *     - 生成中はボタンに待機表示を出す
 *     - AI が使えた場合は画面の出来事文も日記文に差し替え、
 *       カードには推論元バッジが付く
 *     - AI が使えない場合は静かにテンプレート文のまま進む
 *  2. generateCard(cardData, canvas, spot) を await で呼ぶ
 *  3. #card-preview-area を表示する
 *  4. #save-card-btn を有効化する
 */
async function onMakeCard() {
  if (!currentVisit || !currentVisit.cardData) {
    console.error('[homecoming] cardData が設定されていません:', currentVisit);
    return;
  }

  const canvas = document.getElementById('diary-card-canvas');
  if (!canvas) {
    console.error('[homecoming] #diary-card-canvas が見つかりません');
    return;
  }

  // スポット定義を取得する（見つからなければテーマカラーのフォールバックを使う）
  const spot = currentSpots.find(s => s.id === currentVisit.spotId)
    || { themeColor: '#6a3fa0' };

  // AI日記の生成を試みる（失敗しても例外は来ない。テンプレ文が返る）
  const cardData = await buildDiaryCardData(spot);

  await generateCard(cardData, canvas, spot);

  const previewArea = document.getElementById('card-preview-area');
  if (previewArea) previewArea.hidden = false;

  const saveBtn = document.getElementById('save-card-btn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.setAttribute('aria-disabled', 'false');
  }
}

/**
 * AI日記つきの CardData を組み立てる。
 *
 * diary-ai に旅の事実を渡して日記文を生成させる。推論元がテンプレの
 * ときは元の cardData をそのまま返す（バッジなし・従来動作と同一）。
 * AI で書けたときは、画面の出来事文も日記文に差し替えてから、
 * eventText と inferenceSource を差し替えたコピーを返す。
 * 保存済みの Visit データ自体は書き換えない。
 *
 * @param {import('../domain/event-generator.js').SpotDef|{themeColor: string}} spot
 * @returns {Promise<import('../domain/visit.js').CardData>}
 */
async function buildDiaryCardData(spot) {
  const cardData = currentVisit.cardData;
  const makeCardBtn = document.getElementById('make-card-btn');
  const originalLabel = makeCardBtn ? makeCardBtn.textContent : '';

  // 待機表示（AI生成には数秒かかることがある）
  if (makeCardBtn) {
    makeCardBtn.disabled = true;
    makeCardBtn.textContent = 'AIが日記を書いているよ… ✍️';
  }

  try {
    const pet = loadPet();
    const souvenir = spot.souvenirs?.find(sv => sv.id === cardData.souvenirId);
    const facts = {
      petName:      cardData.petName,
      personality:  pet ? pet.personality : null,
      spotName:     spot.displayName || cardData.spotId,
      eventText:    cardData.eventText,
      souvenirName: souvenir ? souvenir.displayName : null,
    };

    const diary = await generateDiaryText(facts, cardData.eventText);
    // 診断表示を最新の失敗理由に合わせる（成功時は隠れる）
    renderAiDiagnostics();
    if (diary.source === INFERENCE_SOURCE.TEMPLATE) {
      // AI が使えなかった → テンプレ文のまま（従来動作）
      return cardData;
    }

    // AI で書けた → 画面の出来事文も日記文に差し替える
    const eventTextEl = document.getElementById('homecoming-event-text');
    if (eventTextEl) {
      renderMultilineText(eventTextEl, diary.text);
    }

    return { ...cardData, eventText: diary.text, inferenceSource: diary.source };
  } finally {
    if (makeCardBtn) {
      makeCardBtn.disabled = false;
      makeCardBtn.textContent = originalLabel;
    }
  }
}

/**
 * AI日記の診断表示を更新する（#BuildHybridAI の失敗切り分け用）。
 *
 * 生成がテンプレートに落ちたときだけ、diary-ai が保持した失敗理由の
 * 概要を画面下部の #ai-diagnostics に小さく出す。AI で書けたとき・
 * 理由が無いときは隠す。
 *
 * 【提出前に外す対象】診断表示の置き場所はこの関数と index.html の
 * #ai-diagnostics 要素、homecoming.css の .ai-diagnostics の3か所だけ。
 * 外すときはこの関数と呼び出し2か所（init / buildDiaryCardData）も消す。
 */
function renderAiDiagnostics() {
  const el = document.getElementById('ai-diagnostics');
  if (!el) return;
  const error = getLastAiError();
  if (!error) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  const parts = [`AI日記: ${error.name}`];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.status !== null && error.status !== undefined) {
    parts.push(`status=${error.status}`);
  }
  if (error.message) parts.push(error.message);
  el.textContent = parts.join(' / ');
  el.hidden = false;
}

/**
 * 「絵日記を保存」ボタンが押されたときの処理。
 * プレビュー中の Canvas を PNG ファイルとして端末に保存させる。
 */
function onSaveCard() {
  if (!currentVisit || !currentVisit.cardData) {
    console.error('[homecoming] cardData が設定されていません:', currentVisit);
    return;
  }

  const canvas = document.getElementById('diary-card-canvas');
  if (!canvas) {
    console.error('[homecoming] #diary-card-canvas が見つかりません');
    return;
  }

  downloadCardAsPng(canvas, currentVisit.cardData.returnedAt);
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
  clearSyntheticSpot();

  // モジュールスコープの状態をリセット
  currentVisit = null;

  // ホーム画面へ遷移する
  goHome();
}
