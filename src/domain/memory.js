/**
 * src/domain/memory.js
 * 「おもいで（記憶）」のドメインロジック。
 * 純粋関数のみで構成し、DOM・localStorage には一切依存しない。
 *
 * 新コンセプト「あなたの日常や記憶から、自分だけの世界を形成していく
 * ペット」の中核。冒険履歴（完了済み Visit の配列）から記憶を導出し、
 * その記憶が次の冒険を変える:
 *
 *  1. 経験と性格の形成: 旅の内容に応じて経験値（XP）が貯まり、
 *     実効性格（effectivePersonality）が少しずつ育つ。出来事の条件
 *     フィルタは実効性格で判定されるため、育った性格は次回以降の
 *     出来事の選ばれ方そのものを変える。
 *  2. 出来事の反復回避: 同じ場所で前回と同じ出来事が続かないよう、
 *     前回の出来事を候補から外す（候補が複数ある場合のみ）。
 *  3. 日記の文脈: 記憶の要約（buildMemoryDigest）を日記プロンプトに
 *     渡し、過去の冒険への言及が生まれるようにする。要約は端末内で
 *     組み立てられ、クラウドへ送るかどうかは利用者の許可設定で
 *     決まる（diary-ai の planDiaryAttempts を参照）。
 *
 * 記憶そのものは端末内（localStorage の Visit 履歴）にだけ存在し、
 * サーバーへは送られない。
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/**
 * 経験値 → 実効性格の上昇ステップのしきい値。
 * XP が 3 で +1 段階、8 で +2 段階（ただし上限は性格値の最大 2）。
 */
export const XP_THRESHOLDS = [3, 8];

/** 経験で得られる XP: 条件付き出来事が鍛えた軸 */
const XP_FOR_CONDITIONED_AXIS = 2;
/** 経験で得られる XP: 無条件の出来事（両軸に少しずつ） */
const XP_FOR_UNCONDITIONED_AXIS = 1;
/** 経験で得られる XP: おみやげを持ち帰ったとき（好奇心） */
const XP_FOR_SOUVENIR = 1;

// ─────────────────────────────────────────────
// 経験値と性格の形成
// ─────────────────────────────────────────────

/**
 * 空の経験値を返す。
 * @returns {{ curiosityXp: number, sociabilityXp: number }}
 */
export function emptyExperience() {
  return { curiosityXp: 0, sociabilityXp: 0 };
}

/**
 * 経験値を正規化する。欠損・不正な値は 0 に丸める
 * （旧セーブデータには experience フィールドが無い）。
 *
 * @param {*} exp
 * @returns {{ curiosityXp: number, sociabilityXp: number }}
 */
export function normalizeExperience(exp) {
  const clean = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
  return {
    curiosityXp:   clean(exp?.curiosityXp),
    sociabilityXp: clean(exp?.sociabilityXp),
  };
}

/**
 * XP から性格の上昇段階（0〜2）を返す。
 *
 * @param {number} xp
 * @returns {number} 0 | 1 | 2
 */
export function growthSteps(xp) {
  const value = Number.isInteger(xp) && xp > 0 ? xp : 0;
  let steps = 0;
  for (const threshold of XP_THRESHOLDS) {
    if (value >= threshold) steps++;
  }
  return steps;
}

/**
 * ペットの実効性格を返す。生まれつきの性格（pet.personality）に、
 * 経験による上昇分を加えたもの（上限 2）。
 * 出来事生成と日記プロンプトは、この実効性格を使う。
 *
 * @param {{ personality: { curiosity: number, sociability: number },
 *           experience?: object }} pet
 * @returns {{ curiosity: number, sociability: number }}
 */
export function effectivePersonality(pet) {
  const base = pet?.personality ?? { curiosity: 1, sociability: 1 };
  const exp = normalizeExperience(pet?.experience);
  const raise = (baseValue, xp) => {
    const b = Number.isInteger(baseValue) ? Math.min(2, Math.max(0, baseValue)) : 1;
    return Math.min(2, b + growthSteps(xp));
  };
  return {
    curiosity:   raise(base.curiosity, exp.curiosityXp),
    sociability: raise(base.sociability, exp.sociabilityXp),
  };
}

/**
 * 性格の成長状態を UI 表示用に返す。
 * 各軸について、生まれつきの値・実効値・XP・次の上昇までの残り XP。
 *
 * @param {object} pet
 * @returns {{ curiosity: AxisStage, sociability: AxisStage }}
 * @typedef {Object} AxisStage
 * @property {number} base
 * @property {number} effective
 * @property {number} xp
 * @property {number|null} xpToNext - 次の段階までの残り XP（最大段階なら null）
 */
export function personalityStage(pet) {
  const base = pet?.personality ?? { curiosity: 1, sociability: 1 };
  const exp = normalizeExperience(pet?.experience);
  const effective = effectivePersonality(pet);
  const stage = (baseValue, xp, effectiveValue) => {
    const steps = growthSteps(xp);
    const nextThreshold = steps < XP_THRESHOLDS.length ? XP_THRESHOLDS[steps] : null;
    return {
      base: baseValue,
      effective: effectiveValue,
      xp,
      xpToNext: nextThreshold === null ? null : Math.max(0, nextThreshold - xp),
    };
  };
  return {
    curiosity:   stage(base.curiosity, exp.curiosityXp, effective.curiosity),
    sociability: stage(base.sociability, exp.sociabilityXp, effective.sociability),
  };
}

/**
 * 1回の旅から得られる経験値を計算する。
 *
 * ルール:
 *  - 出来事テンプレートに curiosity 条件があれば好奇心 +2、
 *    sociability 条件があれば社交性 +2（その出来事が鍛えた軸）
 *  - どちらの条件も無い出来事は、両軸に +1 ずつ
 *  - おみやげを持ち帰ったら好奇心に +1（集める楽しみ）
 *
 * @param {import('./event-generator.js').SpotDef} spot - 訪問先の定義
 * @param {string} eventId - 起きた出来事のテンプレートID
 * @param {string|null} souvenirId - 持ち帰ったおみやげID（null は無し）
 * @returns {{ curiosityXp: number, sociabilityXp: number }}
 */
export function experienceFromEvent(spot, eventId, souvenirId) {
  const gained = { curiosityXp: 0, sociabilityXp: 0 };
  const template = spot?.events?.find(t => t.id === eventId);
  const cond = template?.conditions ?? null;

  const hasCuriosity = cond !== null && cond.curiosity != null;
  const hasSociability = cond !== null && cond.sociability != null;

  if (hasCuriosity) gained.curiosityXp += XP_FOR_CONDITIONED_AXIS;
  if (hasSociability) gained.sociabilityXp += XP_FOR_CONDITIONED_AXIS;
  if (!hasCuriosity && !hasSociability) {
    gained.curiosityXp += XP_FOR_UNCONDITIONED_AXIS;
    gained.sociabilityXp += XP_FOR_UNCONDITIONED_AXIS;
  }
  if (souvenirId) gained.curiosityXp += XP_FOR_SOUVENIR;

  return gained;
}

/**
 * ペットに経験値を加算した新しいペットオブジェクトを返す
 * （元のオブジェクトは変更しない）。
 *
 * @param {object} pet
 * @param {{ curiosityXp: number, sociabilityXp: number }} gained
 * @returns {object}
 */
export function applyExperience(pet, gained) {
  const current = normalizeExperience(pet?.experience);
  const add = normalizeExperience(gained);
  return {
    ...pet,
    experience: {
      curiosityXp:   current.curiosityXp + add.curiosityXp,
      sociabilityXp: current.sociabilityXp + add.sociabilityXp,
    },
  };
}

// ─────────────────────────────────────────────
// 記憶の導出（冒険履歴 → 記憶）
// ─────────────────────────────────────────────

/**
 * @typedef {Object} PetMemory
 * @property {number} totalTrips - 完了した冒険の総数
 * @property {Object<string, number>} tripsBySpot - 行き先ごとの回数
 * @property {string|null} favoriteSpotId - いちばん多く訪れた場所（同数なら直近）
 * @property {number} souvenirCount - おみやげを持ち帰った回数
 * @property {number} distinctSpots - 訪れたことのある場所の数
 * @property {Object<string, string>} lastEventBySpot - 場所ごとの前回の出来事ID
 * @property {{ spotId: string, eventId: string|null }|null} lastTrip - 直近の冒険
 */

/**
 * 完了済み Visit の履歴から、ペットの「おもいで」を導出する。
 * 履歴の並び順（古い→新しい）を前提に集計する。
 *
 * @param {import('./visit.js').Visit[]} visits - Visit の配列（完了済み以外は無視）
 * @returns {PetMemory}
 */
export function deriveMemory(visits) {
  const completed = (visits || []).filter(
    v => v && v.status === 'completed' && typeof v.spotId === 'string',
  );

  const tripsBySpot = {};
  const lastEventBySpot = {};
  let souvenirCount = 0;

  for (const visit of completed) {
    tripsBySpot[visit.spotId] = (tripsBySpot[visit.spotId] || 0) + 1;
    if (visit.eventId) lastEventBySpot[visit.spotId] = visit.eventId;
    if (visit.souvenirId) souvenirCount++;
  }

  // お気に入り: 回数が最大の場所。同数なら最後に訪れたほうを採る
  let favoriteSpotId = null;
  let favoriteCount = 0;
  for (const visit of completed) {
    const count = tripsBySpot[visit.spotId];
    if (count >= favoriteCount) {
      favoriteCount = count;
      favoriteSpotId = visit.spotId;
    }
  }

  const last = completed.length > 0 ? completed[completed.length - 1] : null;

  return {
    totalTrips: completed.length,
    tripsBySpot,
    favoriteSpotId,
    souvenirCount,
    distinctSpots: Object.keys(tripsBySpot).length,
    lastEventBySpot,
    lastTrip: last ? { spotId: last.spotId, eventId: last.eventId ?? null } : null,
  };
}

// ─────────────────────────────────────────────
// 日記プロンプト用の記憶要約
// ─────────────────────────────────────────────

/**
 * 記憶を日記プロンプト用の短い要約文にする。
 * 端末内で組み立てる決定的な処理であり、AI は使わない。
 * 冒険がまだ無い場合は null（プロンプトに記憶セクションを入れない）。
 *
 * @param {PetMemory} memory
 * @param {import('./event-generator.js').SpotDef[]} spots - 場所名の解決用
 * @returns {string|null}
 */
export function buildMemoryDigest(memory, spots) {
  if (!memory || memory.totalTrips === 0) return null;

  const nameOf = (spotId) =>
    (spots || []).find(s => s.id === spotId)?.displayName || spotId;

  const parts = [`これまで${memory.totalTrips}回おでかけした`];
  if (memory.favoriteSpotId && memory.totalTrips >= 2) {
    parts.push(
      `いちばんよく行く場所は${nameOf(memory.favoriteSpotId)}` +
      `（${memory.tripsBySpot[memory.favoriteSpotId]}回）`,
    );
  }
  if (memory.souvenirCount > 0) {
    parts.push(`おみやげは${memory.souvenirCount}つ集めた`);
  }
  if (memory.lastTrip && memory.totalTrips >= 2) {
    parts.push(`前回は${nameOf(memory.lastTrip.spotId)}へ行った`);
  }
  return parts.join('。') + '。';
}
