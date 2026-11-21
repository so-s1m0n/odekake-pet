/**
 * src/domain/visit.js
 * Visitエンティティのドメインロジック。
 * 純粋関数のみで構成し、DOM・localStorageには一切依存しない。
 *
 * Visit はペットの1回のおでかけを表すオブジェクト。
 * ライフサイクル: ongoing（不在中）→ completed（帰宅済み）
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * 不在期間（ミリ秒）。
 * デモ実演では 60_000（1分）に設定。
 * 本番用は 5 * 60 * 1000（5分）を推奨。
 */
export const VISIT_DURATION_MS = 60_000; // デモ用: 1分 / 本番: 5 * 60 * 1000

/** Visitのステータス値 */
export const VISIT_STATUS = {
  ONGOING:   'ongoing',
  COMPLETED: 'completed',
};

// ─────────────────────────────────────────────
// 型定義（JSDocのみ。実行時には存在しない）
// ─────────────────────────────────────────────

/**
 * @typedef {Object} Visit
 * @property {string}               id          - 一意ID（`visit-${timestamp}` 形式）
 * @property {string}               spotId      - 訪問先スポットID
 * @property {string}               departedAt  - 出発日時（ISO 8601）
 * @property {number}               durationMs  - 不在期間（ミリ秒）
 * @property {'ongoing'|'completed'} status     - 訪問状態
 * @property {string|null}          eventId     - 選択されたイベントテンプレートID（帰宅時に設定）
 * @property {string|null}          souvenirId  - 付与されたおみやげID（帰宅時に設定）
 * @property {CardData|null}        cardData    - 絵日記データ（帰宅時に設定）
 */

/**
 * @typedef {Object} CardData
 * @property {string}      spotId     - 訪問先スポットID
 * @property {string}      petName    - ペットの名前
 * @property {string}      petType    - ペットの種類ID
 * @property {string}      eventText  - 生成済みイベント文
 * @property {string|null} souvenirId - おみやげID（null可）
 * @property {string}      returnedAt - 帰宅日時（ISO 8601）
 * @property {string}      [inferenceSource] - 日記文の推論元（'on_device' | 'cloud' | 'template'。
 *   AI日記で生成したカードにだけ付く。無い場合はバッジを描かない）
 */

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * 新規 Visit を作成して返す。
 * status は 'ongoing'、eventId / souvenirId / cardData はすべて null。
 *
 * @param {string} spotId - 訪問先スポットID
 * @returns {Visit}
 */
export function createVisit(spotId) {
  const now = Date.now();
  return {
    id:         `visit-${now}`,
    spotId,
    departedAt: new Date(now).toISOString(),
    durationMs: VISIT_DURATION_MS,
    status:     VISIT_STATUS.ONGOING,
    eventId:    null,
    souvenirId: null,
    cardData:   null,
  };
}

/**
 * 帰宅可能かどうかを判定する。
 * `now >= departedAt + durationMs` であれば true を返す。
 *
 * @param {Visit}  visit
 * @param {number} [now] - テスト用に現在時刻を注入できる（省略時は Date.now()）
 * @returns {boolean}
 */
export function isReturnReady(visit, now = Date.now()) {
  const departedAt = new Date(visit.departedAt).getTime();
  return now >= departedAt + visit.durationMs;
}

/**
 * Visit に帰宅データを付加して完了状態にした新しい Visit を返す。
 * 元のオブジェクトは変更しない（イミュータブル）。
 *
 * @param {Visit}          visit
 * @param {string}         eventId    - 選択されたイベントテンプレートID
 * @param {string|null}    souvenirId - 付与されたおみやげID
 * @param {CardData}       cardData   - 絵日記データ
 * @returns {Visit}
 */
export function completeVisit(visit, eventId, souvenirId, cardData) {
  return {
    ...visit,
    status:    VISIT_STATUS.COMPLETED,
    eventId,
    souvenirId,
    cardData,
  };
}

/**
 * 出発からの経過時間と残り時間をミリ秒で返す。
 * remainingMs が負になった場合は 0 にクランプする。
 *
 * @param {Visit}  visit
 * @param {number} [now] - テスト用に現在時刻を注入できる（省略時は Date.now()）
 * @returns {{ elapsedMs: number, remainingMs: number }}
 */
export function getVisitTiming(visit, now = Date.now()) {
  const departedAt  = new Date(visit.departedAt).getTime();
  const elapsedMs   = now - departedAt;
  const remainingMs = Math.max(0, visit.durationMs - elapsedMs);
  return { elapsedMs, remainingMs };
}
