/**
 * src/main.js
 * アプリのエントリポイント。
 * - localStorageのマイグレーション
 * - ペットデータの有無による初回起動分岐
 * - 各画面モジュールの初期化
 */

import { migrate, hasPet } from './store.js';
import { goSetup, goHome } from './router.js';
import { initSetupScreen } from './screens/setup.js';
import { initHomeScreen }  from './screens/home.js';

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

  // ─── 3. ホーム画面を初期化しておく（setupからの遷移後にも使う）───
  initHomeScreen();

  // ─── 4. ペット登録画面を初期化（petTypesを渡す）───
  initSetupScreen(petTypes);

  // ─── 5. ペット登録完了後にホーム画面を再初期化するハンドラ ───
  document.addEventListener('petregistered', () => {
    initHomeScreen();
  });

  // ─── 6. 画面振り分け ───
  if (hasPet()) {
    goHome();
  } else {
    goSetup();
  }
}

// DOMが構築されてから起動する
document.addEventListener('DOMContentLoaded', bootstrap);
