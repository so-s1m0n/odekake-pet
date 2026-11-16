/**
 * src/screens/home.js
 * ホーム画面（screen-home）のUIロジック。
 * ペットの表示、世話アクション、状態に応じた表示切り替えを担当する。
 */

import { applyCareAction, PET_STATE, PET_TYPE_ICONS, isAtHome } from '../domain/pet.js';
import { loadPet, savePet, loadVisitsAll } from '../store.js';
import { goOdekake, goWaiting, goAlbum, goFootprints } from '../router.js';
import { encodeFriendCode, CODE_VERSION } from '../domain/odekake-code.js';

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** リアクションアニメーションの表示時間（ミリ秒）*/
const REACTION_DURATION_MS = 2000;

// ─────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────

/** アニメーション中かどうか（連打防止） */
let isAnimating = false;

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * ホーム画面を初期化し、ペットデータを読み込んで描画する。
 * main.js の DOMContentLoaded 後、またはペット登録完了後に呼ぶこと。
 */
export function initHomeScreen(footprints = []) {
  const pet = loadPet();
  if (!pet) {
    console.error('[home] ペットデータが存在しません');
    return;
  }

  // 世話ボタンのイベントハンドラを登録（重複登録を防ぐため一度削除して再登録）
  const careActions = document.getElementById('care-actions');
  if (careActions) {
    const newCareActions = careActions.cloneNode(true);
    careActions.parentNode.replaceChild(newCareActions, careActions);
    newCareActions.addEventListener('click', handleCareClick);
  }

  // 「おでかけへ」ボタン
  const odekakeBtn = document.getElementById('odekake-btn');
  if (odekakeBtn) {
    const newBtn = odekakeBtn.cloneNode(true);
    odekakeBtn.parentNode.replaceChild(newBtn, odekakeBtn);
    newBtn.addEventListener('click', () => goOdekake());
  }

  // アルバムリンク
  const albumLink = document.getElementById('album-link');
  if (albumLink) {
    albumLink.addEventListener('click', (e) => {
      e.preventDefault();
      goAlbum();
    });
  }

  // 「おもいでアルバム」ボタン（重複登録を防ぐため一度差し替えてから登録）
  const albumBtn = document.getElementById('open-album-btn');
  if (albumBtn) {
    const newAlbumBtn = albumBtn.cloneNode(true);
    albumBtn.parentNode.replaceChild(newAlbumBtn, albumBtn);
    newAlbumBtn.addEventListener('click', () => goAlbum());
  }

  // おもいで数を表示する（訪問履歴の件数）
  renderMemoriesCount();

  // 足跡通知エリアを描画する（M7・TASK-34）
  renderFootprintNotice(footprints || []);

  // 「おともだちコードを発行」ボタン（clone で差し替え）
  const issueBtn = document.getElementById('issue-friend-code-btn');
  if (issueBtn) {
    const newIssueBtn = issueBtn.cloneNode(true);
    issueBtn.parentNode.replaceChild(newIssueBtn, issueBtn);
    newIssueBtn.addEventListener('click', () => onIssueFriendCode());
  }

  // コード発行モーダルのコピー・閉じるボタン（clone で差し替え）
  const copyBtn = document.getElementById('copy-friend-code-btn');
  if (copyBtn) {
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
    newCopyBtn.addEventListener('click', () => onCopyFriendCode());
  }
  const closeBtn = document.getElementById('close-friend-code-modal-btn');
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', () => {
      const modal = document.getElementById('friend-code-modal');
      if (modal) modal.hidden = true;
    });
  }

  // 「あしあとを見る」ボタン（clone で差し替え）
  const footprintsBtn = document.getElementById('open-footprints-btn');
  if (footprintsBtn) {
    const newFootprintsBtn = footprintsBtn.cloneNode(true);
    footprintsBtn.parentNode.replaceChild(newFootprintsBtn, footprintsBtn);
    newFootprintsBtn.addEventListener('click', () => goFootprints());
  }

  renderPet(pet);
}

/**
 * 足跡通知エリアを描画する（M7・TASK-34）。
 * 0件ならエリア全体を隠し、1件以上なら直近3件を新しい順に並べる。
 *
 * @param {Object[]} footprints - FootprintRecord の配列
 */
function renderFootprintNotice(footprints) {
  const notice = document.getElementById('footprint-notice');
  const list = document.getElementById('footprint-notice-list');
  if (!notice || !list) return;

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  if (!footprints || footprints.length === 0) {
    notice.hidden = true;
    return;
  }

  const recent = [...footprints]
    .sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt))
    .slice(0, 3);
  for (const record of recent) {
    const li = document.createElement('li');
    const icon = PET_TYPE_ICONS[record.visitorPetType] || '🐾';
    li.textContent = `${record.visitorPetName}ちゃんが遊びに来たよ ${icon}`;
    list.appendChild(li);
  }
  notice.hidden = false;
}

/**
 * 「おともだちコードを発行」ボタンが押されたときの処理（M7・TASK-34）。
 * ペットがおでかけ中のときは何もしない。
 */
function onIssueFriendCode() {
  const pet = loadPet();
  if (!pet || pet.state !== PET_STATE.HOME) return;

  const { code, error } = encodeFriendCode({
    v: CODE_VERSION,
    petName: pet.name,
    petType: pet.type,
    curiosity: pet.personality.curiosity,
    sociability: pet.personality.sociability,
    issuedAt: new Date().toISOString(),
  });
  if (error) {
    alert(error);
    return;
  }
  const output = document.getElementById('friend-code-output');
  if (output) output.value = code;
  const modal = document.getElementById('friend-code-modal');
  if (modal) modal.hidden = false;
}

/**
 * 「コピー」ボタン（おともだちコード）が押されたときの処理（M7・TASK-34）。
 */
async function onCopyFriendCode() {
  const output = document.getElementById('friend-code-output');
  const btn = document.getElementById('copy-friend-code-btn');
  if (!output) return;
  try {
    await navigator.clipboard.writeText(output.value);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'コピーしました！';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
  } catch (e) {
    console.error('[home] クリップボードへのコピーに失敗しました:', e);
    output.select();
  }
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * ペットの現在状態を画面全体に反映する。
 * イラスト・名前・なかよし度・ボタン活性化状態を更新する。
 *
 * @param {import('../domain/pet.js').Pet} pet
 */
function renderPet(pet) {
  renderSprite(pet, 'idle');
  renderPetName(pet);
  renderAffinity(pet);
  renderCareActions(pet);
  renderOdekakeStatus(pet);
}

/**
 * ペットのSVGイラストを表示する。
 * index.html の <template id="pet-svg-{type}-{state}"> をクローンして挿入する。
 *
 * @param {import('../domain/pet.js').Pet} pet
 * @param {'idle'|'eat'|'stroke'|'speak'|'away'} spriteState
 */
function renderSprite(pet, spriteState) {
  const container = document.getElementById('pet-sprite-container');
  if (!container) return;

  const templateId = `pet-svg-${pet.type}-${spriteState}`;
  const template   = document.getElementById(templateId);

  container.textContent = '';
  if (template) {
    container.appendChild(template.content.cloneNode(true));
  } else {
    // フォールバック: テンプレートが見つからない場合はidleを表示
    const fallbackId = `pet-svg-${pet.type}-idle`;
    const fallback   = document.getElementById(fallbackId);
    if (fallback) {
      container.appendChild(fallback.content.cloneNode(true));
    } else {
      console.warn(`[home] SVGテンプレートが見つかりません: #${templateId}`);
    }
  }
}

/**
 * ペット名を描画する。
 *
 * @param {import('../domain/pet.js').Pet} pet
 */
function renderPetName(pet) {
  const el = document.getElementById('pet-name-display');
  if (el) el.textContent = pet.name;
}

/**
 * なかよし度のバーと数値を更新する。
 *
 * @param {import('../domain/pet.js').Pet} pet
 */
function renderAffinity(pet) {
  const progress = document.getElementById('affinity-progress');
  const valueEl  = document.getElementById('affinity-value');
  if (progress) progress.value = pet.affinity;
  if (valueEl)  valueEl.textContent = pet.affinity;
}

/**
 * 世話アクションボタンの活性/非活性を設定する。
 * ペットが在宅（state === 'home'）かつアニメーション中でない場合のみ有効にする。
 *
 * @param {import('../domain/pet.js').Pet} pet
 */
function renderCareActions(pet) {
  const buttons = document.querySelectorAll('#care-actions .js-care-btn');
  const enabled = isAtHome(pet) && !isAnimating;
  buttons.forEach((btn) => {
    btn.disabled = !enabled;
  });
}

/**
 * おでかけ中の状態表示を更新する。
 * - state === 'visiting': 「おでかけ中」バナーを表示し、「旅の途中を見る」ボタンも表示する
 * - state === 'returning': 「おでかけ中」バナーのみ表示（帰宅処理済みのため途中ボタンは非表示）
 * - それ以外（home）: バナーを非表示にし、おでかけボタンを有効化する
 *
 * @param {import('../domain/pet.js').Pet} pet
 */
function renderOdekakeStatus(pet) {
  const petRoom      = document.getElementById('pet-room');
  const banner       = document.getElementById('away-banner');
  const odekakeBtn   = document.getElementById('odekake-btn');
  const awayMsg      = document.getElementById('away-message');

  const isAway       = !isAtHome(pet);
  const isVisiting   = pet.state === PET_STATE.VISITING;

  // ペットルームの is-away クラスを切り替える
  if (petRoom) petRoom.classList.toggle('is-away', isAway);

  // おでかけ中バナーの表示切り替え
  if (banner)     banner.hidden = !isAway;

  // おでかけボタンの活性/非活性
  if (odekakeBtn) odekakeBtn.disabled = isAway;

  // アルバムボタンは visiting 中は無効化する（TASK-22）
  const albumBtn = document.getElementById('open-album-btn');
  if (albumBtn) albumBtn.disabled = isVisiting;

  // コード発行ボタンはおでかけ中は無効化する（M7・TASK-34）
  const issueBtn = document.getElementById('issue-friend-code-btn');
  if (issueBtn) issueBtn.disabled = isAway;

  // おでかけ中メッセージ
  if (awayMsg && isAway) {
    awayMsg.textContent = `${pet.name}は おでかけ中...`;
  }

  // 「旅の途中を見る」ボタン: visiting 状態のときだけ表示する
  const existingWaitingBtn = document.getElementById('waiting-link-btn');

  if (isVisiting) {
    // ボタンが未作成なら生成して挿入する
    if (!existingWaitingBtn) {
      const waitingBtn = document.createElement('button');
      waitingBtn.id        = 'waiting-link-btn';
      waitingBtn.className = 'btn btn--waiting-link';
      waitingBtn.textContent = '旅の途中を見る 🔍';
      waitingBtn.setAttribute('aria-label', 'おでかけ中のペットの様子を見る');
      waitingBtn.addEventListener('click', () => goWaiting());

      // おでかけボタンの直後に挿入する
      if (odekakeBtn && odekakeBtn.parentNode) {
        odekakeBtn.parentNode.insertBefore(waitingBtn, odekakeBtn.nextSibling);
      }
    }
  } else {
    // 在宅 or returning: ボタンが存在していれば削除する
    if (existingWaitingBtn) {
      existingWaitingBtn.remove();
    }
  }
}

/**
 * おもいで数（完了済みVisitの件数）を画面に表示する。
 * #memories-count 要素が存在する場合に更新する。
 */
function renderMemoriesCount() {
  const countEl = document.getElementById('memories-count');
  if (!countEl) return;
  const count = loadVisitsAll().length;
  countEl.textContent = String(count);
}

/**
 * 世話アクションボタンのクリックを処理するハンドラ（イベント委譲）。
 *
 * @param {MouseEvent} event
 */
function handleCareClick(event) {
  const btn = event.target.closest('.js-care-btn');
  if (!btn || btn.disabled) return;

  const action = btn.dataset.action;
  if (!action) return;

  onCareAction(action);
}

/**
 * 世話アクションの実行処理。
 * applyCareAction → savePet → playCareAnimation → renderPet の順に実行する。
 *
 * @param {'eat'|'stroke'|'speak'} action
 */
function onCareAction(action) {
  if (isAnimating) return;

  const pet = loadPet();
  if (!pet || !isAtHome(pet)) return;

  const updatedPet = applyCareAction(pet, action);
  savePet(updatedPet);

  playCareAnimation(updatedPet, action);
}

/**
 * 世話アクションのリアクションSVGを一定時間（REACTION_DURATION_MS）表示し、
 * その後 idle 状態に戻す。アニメーション中はボタンを非活性にする（連打防止）。
 *
 * @param {import('../domain/pet.js').Pet} pet - 更新後のPet
 * @param {'eat'|'stroke'|'speak'} action
 */
function playCareAnimation(pet, action) {
  isAnimating = true;

  // リアクションSVGを表示
  renderSprite(pet, action);
  renderAffinity(pet);
  renderCareActions(pet); // disabled にする

  // 2秒後に idle に戻す
  setTimeout(() => {
    isAnimating = false;
    renderSprite(pet, 'idle');
    renderCareActions(pet); // 再び有効化
  }, REACTION_DURATION_MS);
}
