/**
 * src/store.js
 * localStorageの読み書きを一元管理するストア。
 * このファイル以外のモジュールは localStorage に直接アクセスしない。
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** 現在のデータスキーマバージョン */
const SCHEMA_VERSION = 2;

/** localStorageキーの一覧 */
const KEYS = {
  PET:            'odekakepet::pet::current',
  VISIT_CURRENT:  'odekakepet::visit::current',  // 進行中のVisit（1件のみ）
  VISITS_ALL:     'odekakepet::visits::all',      // 完了済みVisitの履歴（配列）
  SCHEMA_VERSION: 'odekakepet::settings::version',
};

// ─────────────────────────────────────────────
// マイグレーション
// ─────────────────────────────────────────────

/**
 * 保存済みのスキーマバージョンを確認し、必要であればマイグレーションを実行する。
 */
export function migrate() {
  const storedVersion = Number(localStorage.getItem(KEYS.SCHEMA_VERSION) || 0);

  if (storedVersion === 0) {
    // 初回起動（バージョン未設定）: バージョンを書き込むだけ
    localStorage.setItem(KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
    return;
  }

  if (storedVersion < SCHEMA_VERSION) {
    if (storedVersion < 2) {
      // v1 → v2: Visit関連キーを初期化する
      migrate_v1_to_v2();
    }
    localStorage.setItem(KEYS.SCHEMA_VERSION, String(SCHEMA_VERSION));
  }
}

/**
 * スキーマ v1 → v2 のマイグレーション。
 * Visit関連のキーが存在しなければ初期値を書き込む。
 * 既存データには触れないため、既に存在する場合はスキップする。
 */
function migrate_v1_to_v2() {
  if (localStorage.getItem(KEYS.VISIT_CURRENT) === null) {
    // 進行中のVisitは存在しない状態として明示的にnullを設定しない（キーなし=null扱い）
    // 特に何もしなくてよい
  }
  if (localStorage.getItem(KEYS.VISITS_ALL) === null) {
    // 履歴が存在しなければ空配列で初期化する
    localStorage.setItem(KEYS.VISITS_ALL, JSON.stringify([]));
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

// ─────────────────────────────────────────────
// 進行中の Visit の読み書き（1件のみ）
// ─────────────────────────────────────────────

/**
 * 進行中の Visit を localStorageから読み込む。
 * 存在しない場合は null を返す。
 *
 * @returns {import('./domain/visit.js').Visit | null}
 */
export function loadCurrentVisit() {
  try {
    const json = localStorage.getItem(KEYS.VISIT_CURRENT);
    if (!json) return null;
    return JSON.parse(json);
  } catch (e) {
    console.error('[store] 進行中Visitの読み込みに失敗しました:', e);
    return null;
  }
}

/**
 * 進行中の Visit を localStorageに保存する。
 *
 * @param {import('./domain/visit.js').Visit} visit
 */
export function saveCurrentVisit(visit) {
  try {
    localStorage.setItem(KEYS.VISIT_CURRENT, JSON.stringify(visit));
  } catch (e) {
    console.error('[store] 進行中Visitの保存に失敗しました:', e);
  }
}

/**
 * 進行中の Visit を localStorageから削除する。
 * 帰宅後に appendVisit() と組み合わせて呼ぶ。
 */
export function clearCurrentVisit() {
  localStorage.removeItem(KEYS.VISIT_CURRENT);
}

// ─────────────────────────────────────────────
// Visit 履歴の読み書き
// ─────────────────────────────────────────────

/**
 * 完了済み Visit の履歴をすべて読み込む。
 * 存在しない場合は空配列を返す。
 *
 * @returns {import('./domain/visit.js').Visit[]}
 */
export function loadVisitsAll() {
  try {
    const json = localStorage.getItem(KEYS.VISITS_ALL);
    if (!json) return [];
    return JSON.parse(json);
  } catch (e) {
    console.error('[store] Visit履歴の読み込みに失敗しました:', e);
    return [];
  }
}

/**
 * 完了済み Visit を履歴に追記する。
 * 既存の履歴の末尾に1件追加して保存する。
 *
 * @param {import('./domain/visit.js').Visit} visit
 */
export function appendVisit(visit) {
  try {
    const all = loadVisitsAll();
    all.push(visit);
    localStorage.setItem(KEYS.VISITS_ALL, JSON.stringify(all));
  } catch (e) {
    console.error('[store] Visit履歴への追記に失敗しました:', e);
  }
}
