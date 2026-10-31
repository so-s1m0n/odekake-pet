/**
 * src/store.js
 * localStorageの読み書きを一元管理するストア。
 * このファイル以外のモジュールは localStorage に直接アクセスしない。
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** 現在のデータスキーマバージョン */
const SCHEMA_VERSION = 1;

/** localStorageキーの一覧 */
const KEYS = {
  PET:            'odekakepet::pet::current',
  SCHEMA_VERSION: 'odekakepet::settings::version',
};

// ─────────────────────────────────────────────
// マイグレーション
// ─────────────────────────────────────────────

/**
 * 保存済みのスキーマバージョンを確認し、必要であればマイグレーションを実行する。
 * 現在はv1のみ存在するためスタブ実装。
 * 将来バージョンアップ時は migrate_v1_to_v2() などを追加する。
 */
export function migrate() {
  const storedVersion = Number(localStorage.getItem(KEYS.SCHEMA_VERSION) || 0);

  if (storedVersion === 0) {
    // 初回起動（バージョン未設定）: バージョンを書き込むだけ
    localStorage.setItem(KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
    return;
  }

  if (storedVersion < SCHEMA_VERSION) {
    // 将来のマイグレーション処理をここに追加する
    // 例: if (storedVersion === 1) migrate_v1_to_v2();
    localStorage.setItem(KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
  }
}

// ─────────────────────────────────────────────
// Petの読み書き
// ─────────────────────────────────────────────

/**
 * localStorageからペットデータを読み込む。
 * データが存在しない場合は null を返す。
 *
 * @returns {import('./domain/pet.js').Pet | null}
 */
export function loadPet() {
  try {
    const json = localStorage.getItem(KEYS.PET);
    if (!json) return null;
    const data = JSON.parse(json);
    // schemaVersionフィールドを除いたPetオブジェクトを返す
    const { schemaVersion: _sv, ...pet } = data;
    return pet;
  } catch (e) {
    console.error('[store] ペットデータの読み込みに失敗しました:', e);
    return null;
  }
}

/**
 * ペットデータをlocalStorageに保存する。
 * schemaVersionを付与してJSONとして書き込む。
 *
 * @param {import('./domain/pet.js').Pet} pet
 */
export function savePet(pet) {
  try {
    const data = { schemaVersion: SCHEMA_VERSION, ...pet };
    localStorage.setItem(KEYS.PET, JSON.stringify(data));
  } catch (e) {
    console.error('[store] ペットデータの保存に失敗しました:', e);
  }
}

/**
 * ペットデータが存在するかどうかを返す。
 *
 * @returns {boolean}
 */
export function hasPet() {
  return localStorage.getItem(KEYS.PET) !== null;
}

/**
 * ペットデータをlocalStorageから削除する（デバッグ・テスト用）。
 * 本番UIからは呼び出さない。
 */
export function clearPet() {
  localStorage.removeItem(KEYS.PET);
}
