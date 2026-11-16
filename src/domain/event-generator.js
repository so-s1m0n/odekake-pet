/**
 * src/domain/event-generator.js
 * イベント生成ロジック。
 * 純粋関数のみで構成し、DOM・localStorageには一切依存しない。
 *
 * spots.json のイベントテンプレートを選択し、ペット名を埋め込んで
 * 最終的なイベント文字列を生成する。
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** 時間帯の区分。時間帯条件フィルタで使用する */
export const TIME_OF_DAY = {
  MORNING:   'morning',   // 朝:   5時以上12時未満
  AFTERNOON: 'afternoon', // 昼:  12時以上17時未満
  EVENING:   'evening',   // 夕方: 17時以上21時未満
  NIGHT:     'night',     // 夜:  21時以上 または 5時未満
};

// ─────────────────────────────────────────────
// 型定義（JSDocのみ）
// ─────────────────────────────────────────────

/**
 * @typedef {Object} EventConditions
 * @property {number[]|null}  curiosity   - 適合する好奇心値の配列
 * @property {number[]|null}  sociability - 適合する社交性値の配列
 * @property {string[]|null}  timeOfDay   - 適合する時間帯の配列
 */

/**
 * @typedef {Object} EventTemplate
 * @property {string}               id         - テンプレートID
 * @property {string}               text       - {petName} プレースホルダー入りのイベント本文
 * @property {string|null}          souvenirId - 付随するおみやげID
 * @property {EventConditions|null} conditions - 選択条件（null は無条件）
 */

/**
 * @typedef {Object} SpotDef
 * @property {string}          id          - スポットID
 * @property {string}          displayName - 表示名
 * @property {EventTemplate[]} events      - イベントテンプレートの配列
 */

/**
 * @typedef {Object} Pet
 * @property {string} name - ペット名
 * @property {{ curiosity: number, sociability: number }} personality - 性格パラメータ
 */

/**
 * @typedef {Object} GeneratedEvent
 * @property {string}      eventId    - 選択されたテンプレートID
 * @property {string}      eventText  - {petName} を置換済みのイベント文
 * @property {string|null} souvenirId - 付与するおみやげID（null は無し）
 */

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * Date オブジェクトから時間帯文字列を返す。
 *
 * 区分:
 *  - 朝（morning）:    5時以上12時未満
 *  - 昼（afternoon）: 12時以上17時未満
 *  - 夕方（evening）: 17時以上21時未満
 *  - 夜（night）:     21時以上 または 0時〜5時未満
 *
 * @param {Date} date
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
export function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour >= 5  && hour < 12) return TIME_OF_DAY.MORNING;
  if (hour >= 12 && hour < 17) return TIME_OF_DAY.AFTERNOON;
  if (hour >= 17 && hour < 21) return TIME_OF_DAY.EVENING;
  return TIME_OF_DAY.NIGHT;
}

/**
 * スポット定義・ペット情報・出発日時からイベントを生成して返す。
 *
 * 選択アルゴリズム:
 * 1. スポットの全テンプレートから、ペットの personality と出発時刻の時間帯に
 *    合致するものをフィルタリングする（条件がすべて一致するもの）。
 * 2. フィルタ後0件なら、conditions が null のテンプレートのみを候補にする（フォールバック）。
 * 3. それでも0件なら先頭テンプレートを使う（防御的実装）。
 * 4. 候補の中からランダムに1件を選択する。
 * 5. テンプレートの `{hostName}` をホスト名で、`{petName}` をペット名で
 *    置換してイベント文を完成させる。
 *
 * @param {SpotDef} spot           - spots.json の1スポット分
 * @param {Pet}     pet            - ペットオブジェクト（name と personality を使用）
 * @param {Date}    [departedAt]   - 出発日時（省略時は現在時刻）
 * @param {string}  [hostName]     - ホストペット名（M7 友達訪問用。省略時は空文字）
 * @returns {GeneratedEvent}
 * @throws {Error} spot.events が空配列の場合
 */
export function generateEvent(spot, pet, departedAt = new Date(), hostName = '') {
  const templates = spot.events;

  if (!templates || templates.length === 0) {
    throw new Error(`スポット "${spot.id}" にイベントテンプレートがありません`);
  }

  const timeOfDay = getTimeOfDay(departedAt);

  // ステップ1: 条件フィルタリング
  const matched = templates.filter(t => matchesConditions(t, pet, timeOfDay));

  // ステップ2: 条件一致なし → conditions=null のテンプレートにフォールバック
  const candidates = matched.length > 0
    ? matched
    : templates.filter(t => t.conditions === null);

  // ステップ3: フォールバックも0件 → 先頭テンプレートを使う
  const pool = candidates.length > 0 ? candidates : [templates[0]];

  // ステップ4: ランダム選択
  const selected = pool[Math.floor(Math.random() * pool.length)];

  // ステップ5: {hostName} → {petName} の順に置換
  const eventText = selected.text
    .replaceAll('{hostName}', hostName)
    .replaceAll('{petName}', pet.name);

  return {
    eventId:   selected.id,
    eventText,
    souvenirId: selected.souvenirId,
  };
}

// ─────────────────────────────────────────────
// モジュール内部の補助関数（非export）
// ─────────────────────────────────────────────

/**
 * テンプレートの conditions がペット・時間帯に合致するかを判定する。
 * conditions が null（無条件）のテンプレートは常に true を返す。
 *
 * 各条件フィールドは null の場合は「条件なし（常に通過）」を意味する。
 * 複数フィールドはすべて AND 条件で評価する。
 *
 * @param {EventTemplate} template
 * @param {Pet}           pet
 * @param {string}        timeOfDay - TIME_OF_DAY の値
 * @returns {boolean}
 */
function matchesConditions(template, pet, timeOfDay) {
  const cond = template.conditions;

  // conditions が null → 無条件で通過（ただし、フィルタ後候補として優先されない）
  // ※ ステップ1の「条件あり」候補を優先させるため、ここでは false を返す設計。
  // → 無条件テンプレートはフォールバック専用として扱うことで、
  //   条件付きテンプレートのほうが選ばれやすくなる。
  if (cond === null) return false;

  // curiosity 条件: null は「条件なし」として通過
  if (cond.curiosity !== null && !cond.curiosity.includes(pet.personality.curiosity)) {
    return false;
  }

  // sociability 条件: null は「条件なし」として通過
  if (cond.sociability !== null && !cond.sociability.includes(pet.personality.sociability)) {
    return false;
  }

  // timeOfDay 条件: null は「条件なし」として通過
  if (cond.timeOfDay !== null && !cond.timeOfDay.includes(timeOfDay)) {
    return false;
  }

  return true;
}
