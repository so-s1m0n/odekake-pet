/**
 * src/domain/synthetic-spot.js
 * 友達訪問の合成スポット定義を画面間で共有するためのキャッシュ（M7）。
 * sessionStorage に保存し、ページ再読み込み（待機中のリロード等）でも
 * 待機画面・帰宅画面から参照できるようにする。
 * 設計: .kiro/specs/friend-visit/design.md 2.4 / 3.6
 */

const SESSION_KEY = 'odekakepet::session::synthetic-spot';

/**
 * 合成スポット定義を保存する。
 *
 * @param {Object} spot - SyntheticSpot（friend-visit 設計書 2.4節）
 */
export function saveSyntheticSpot(spot) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(spot));
  } catch (e) {
    console.error('[synthetic-spot] 合成スポットの保存に失敗しました:', e);
  }
}

/**
 * 保存済みの合成スポット定義を読み込む。なければ null。
 *
 * @returns {Object|null}
 */
export function loadSyntheticSpot() {
  try {
    const json = sessionStorage.getItem(SESSION_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch (e) {
    console.error('[synthetic-spot] 合成スポットの読み込みに失敗しました:', e);
    return null;
  }
}

/**
 * 合成スポット定義を削除する（帰宅完了時に呼ぶ）。
 */
export function clearSyntheticSpot() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.error('[synthetic-spot] 合成スポットの削除に失敗しました:', e);
  }
}
