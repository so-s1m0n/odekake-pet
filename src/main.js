/**
 * src/main.js
 * アプリのエントリポイント。
 * - localStorageのマイグレーション
 * - ペットデータの有無による初回起動分岐
 * - spots.json の読み込みと各画面モジュールの初期化
 * - 起動時おでかけ状態チェック（visiting中 → 待機画面、帰宅可能 → 帰宅処理実行）
 *
 * 画面遷移フック:
 *   router.js は hidden 属性を操作するだけであり、初期化コールバックを持たない。
 *   そのため MutationObserver で screen-waiting / screen-homecoming の
 *   hidden 属性を監視し、表示されるたびに対応する init 関数を呼び出す。
 */

import { migrate, hasPet, loadCurrentVisit, saveCurrentVisit, loadPet, savePet, loadVisitsAll } from './store.js';
import { goSetup, goHome, goWaiting, goHomecoming } from './router.js';
import { initSetupScreen }      from './screens/setup.js';
import { initHomeScreen }       from './screens/home.js';
import { initOdekakeScreen }    from './screens/odekake.js';
import { initWaitingScreen, stopWaitingTimer } from './screens/waiting.js';
import { initHomecomingScreen } from './screens/homecoming.js';
import { initAlbumScreen }      from './screens/album.js';
import { isReturnReady, completeVisit } from './domain/visit.js';
import { generateEvent }        from './domain/event-generator.js';
import { transitionPetState, PET_STATE } from './domain/pet.js';

// ─────────────────────────────────────────────
// アプリ起動
// ─────────────────────────────────────────────

/**
 * アプリを起動する。
 * DOMContentLoaded 後に一度だけ実行される。
 */
async function bootstrap() {
  // ─── 1. マイグレーション ───
  migrate();

  // ─── 2. pets.json の読み込み ───
  let petTypes = [];
  try {
    const res  = await fetch('./data/pets.json');
    const json = await res.json();
    petTypes   = json.petTypes;
  } catch (e) {
    console.error('[main] data/pets.json の読み込みに失敗しました:', e);
  }

  // ─── 3. spots.json の読み込み ───
  let spotsData = [];
  try {
    const res  = await fetch('./data/spots.json');
    const json = await res.json();
    spotsData  = json.spots;
  } catch (e) {
    console.error('[main] data/spots.json の読み込みに失敗しました:', e);
  }

  // ─── 4. 静的な画面を初期化しておく ───
  //   （hidden のまま初期化。ルーター切り替え後に即座に動作する）
  initHomeScreen();
  initSetupScreen(petTypes);
  initOdekakeScreen(spotsData);

  // ─── 5. ペット登録完了後にホーム画面を再初期化するハンドラ ───
  document.addEventListener('petregistered', () => {
    initHomeScreen();
  });

  // ─── 6. 待機画面・帰宅画面の表示フック ───
  //   router.js は showScreen() で hidden を操作するだけなので、
  //   MutationObserver で表示変化を検知して init 関数を呼び出す。
  watchScreen('screen-waiting', () => {
    const visit = loadCurrentVisit();
    if (visit) {
      initWaitingScreen(visit, spotsData);
    }
  });

  watchScreen('screen-homecoming', () => {
    const visit = loadCurrentVisit();
    if (visit) {
      initHomecomingScreen(visit, spotsData);
    }
  });

  watchScreen('screen-album', () => {
    initAlbumScreen(loadVisitsAll(), spotsData);
  });

  // ─── 7. 起動時の状態チェック ───
  const currentVisit = loadCurrentVisit();
  const pet          = loadPet();

  if (currentVisit && pet) {
    // 進行中の Visit が存在する（おでかけ中 or 帰宅可能）
    if (isReturnReady(currentVisit)) {
      // 帰宅可能: 帰宅処理を実行してから帰宅画面へ
      const completedVisit = executeReturnOnStartup(currentVisit, spotsData, pet);
      if (completedVisit) {
        // watchScreen が発火するので initHomecomingScreen は自動で呼ばれる
        goHomecoming();
        return;
      }
    } else {
      // まだおでかけ中: 待機画面へ（watchScreen が initWaitingScreen を呼ぶ）
      goWaiting();
      return;
    }
  }

  // ─── 8. 通常の画面振り分け ───
  if (hasPet()) {
    goHome();
  } else {
    goSetup();
  }
}

// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────

/**
 * 指定した画面IDの `hidden` 属性が削除された（=表示された）タイミングで
 * コールバックを実行する MutationObserver を設定する。
 *
 * @param {string} screenId - 監視対象の画面ID
 * @param {() => void} onShow - 表示されたときに呼ぶコールバック
 */
function watchScreen(screenId, onShow) {
  const el = document.getElementById(screenId);
  if (!el) {
    console.warn(`[main] watchScreen: 要素が見つかりません #${screenId}`);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
        // hidden 属性が存在しなくなった（=表示された）ときに呼ぶ
        if (!el.hasAttribute('hidden')) {
          onShow();
        }
      }
    }
  });

  observer.observe(el, { attributes: true, attributeFilter: ['hidden'] });
}

/**
 * 起動時に帰宅可能状態だった場合に実行する帰宅処理。
 * waiting.js の executeReturn と同等の処理をここで行う
 * （waiting 画面を経由せず直接 homecoming へ遷移するため）。
 *
 * @param {import('./domain/visit.js').Visit} visit - 進行中のVisit
 * @param {import('./domain/event-generator.js').SpotDef[]} spots - スポット定義
 * @param {import('./domain/pet.js').Pet} pet - 現在のペット
 * @returns {import('./domain/visit.js').Visit | null} 完了済みVisit（失敗時null）
 */
function executeReturnOnStartup(visit, spots, pet) {
  const spot = spots.find(s => s.id === visit.spotId);
  if (!spot) {
    console.error('[main] 帰宅処理: スポットが見つかりません:', visit.spotId);
    return null;
  }

  // ペット状態を visiting → returning → home に遷移させる
  const returningPet = transitionPetState(pet, PET_STATE.RETURNING);
  const homePet      = transitionPetState(returningPet, PET_STATE.HOME);

  // 出発日時を使ってイベントを生成する
  const departedAt = new Date(visit.departedAt);
  const { eventId, eventText, souvenirId } = generateEvent(spot, pet, departedAt);

  // 絵日記データを組み立てる
  const cardData = {
    spotId:     visit.spotId,
    petName:    pet.name,
    petType:    pet.type,
    eventText,
    souvenirId: souvenirId ?? null,
    returnedAt: new Date().toISOString(),
  };

  // Visit を完了状態にして保存する
  const completedVisit = completeVisit(visit, eventId, souvenirId ?? null, cardData);
  saveCurrentVisit(completedVisit);
  savePet(homePet);

  // タイマーが動いていれば停止しておく（念のため）
  stopWaitingTimer();

  return completedVisit;
}

// DOMが構築されてから起動する
document.addEventListener('DOMContentLoaded', bootstrap);
