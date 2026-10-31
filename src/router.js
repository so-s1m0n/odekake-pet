/**
 * src/router.js
 * 画面遷移（`hidden`属性による表示・非表示）を管理するルーター。
 * DOMの `<section class="screen">` を切り替えるだけのシンプルな実装。
 */

/** 全画面のIDリスト。新しい画面を追加する際はここに追記する */
const SCREEN_IDS = [
  'screen-setup',
  'screen-home',
  'screen-odekake',    // M3: おでかけ選択画面
  'screen-waiting',    // M3: 不在中の待機画面
  'screen-homecoming', // M3: 帰宅・絵日記生成画面
  // M6以降で追加: 'screen-album'
];

/**
 * 指定した画面のみを表示し、他の画面をすべて非表示にする。
 *
 * @param {string} screenId - 表示する画面のID
 */
export function showScreen(screenId) {
  for (const id of SCREEN_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id === screenId) {
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  }
}

/**
 * ペット登録画面（screen-setup）を表示する。
 */
export function goSetup() {
  showScreen('screen-setup');
}

/**
 * ホーム画面（screen-home）を表示する。
 */
export function goHome() {
  showScreen('screen-home');
}

/**
 * おでかけ選択画面（screen-odekake）を表示する。
 */
export function goOdekake() {
  showScreen('screen-odekake');
}

/**
 * 不在中の待機画面（screen-waiting）を表示する。
 */
export function goWaiting() {
  showScreen('screen-waiting');
}

/**
 * 帰宅・絵日記生成画面（screen-homecoming）を表示する。
 */
export function goHomecoming() {
  showScreen('screen-homecoming');
}

/**
 * アルバム画面へ遷移する（M6実装まではスタブ）。
 */
export function goAlbum() {
  // M6スペックで実装予定
  console.info('[router] アルバム画面はM6で実装予定です');
  alert('アルバム機能は近日公開予定です！');
}
