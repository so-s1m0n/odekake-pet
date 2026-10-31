/**
 * src/domain/pet.js
 * Petエンティティのドメインロジック。
 * 純粋関数のみで構成し、DOM・localStorageには一切依存しない。
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** ペットの状態。この3値のみを使用し、生文字列での比較は行わない */
export const PET_STATE = {
  HOME:      'home',
  VISITING:  'visiting',
  RETURNING: 'returning',
};

/** ペット種類IDの配列。data/pets.json と同期させること */
export const PET_TYPES = [
  'hoshikuzu-usagi',
  'soraaru-penguin',
  'mameshiba',
];

/** 世話アクションの種類 */
export const CARE_ACTIONS = {
  EAT:    'eat',
  STROKE: 'stroke',
  SPEAK:  'speak',
};

/** なかよし度の上限 */
export const MAX_AFFINITY = 99;

/** 名前の文字数制限 */
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 12;

// ─────────────────────────────────────────────
// 許可される状態遷移マップ
// 「home → visiting → returning → home」の単方向ループのみ許可する
// ─────────────────────────────────────────────
const VALID_TRANSITIONS = {
  [PET_STATE.HOME]:      [PET_STATE.VISITING],
  [PET_STATE.VISITING]:  [PET_STATE.RETURNING],
  [PET_STATE.RETURNING]: [PET_STATE.HOME],
};

// ─────────────────────────────────────────────
// ヘルパー関数（非export）
// ─────────────────────────────────────────────

/**
 * 重み配列にもとづいて 0〜2 のインデックスをランダムに選ぶ
 * @param {number[]} weights - 長さ3の確率配列（合計1.0）
 * @returns {number} 0 | 1 | 2
 */
function weightedRandom(weights) {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return i;
  }
  // 浮動小数点誤差対策: 最後の値を返す
  return weights.length - 1;
}

// ─────────────────────────────────────────────
// 公開関数
// ─────────────────────────────────────────────

/**
 * 新規ペットを作成して返す。
 * 性格パラメータはペット種類の重み配列からランダムに決定する。
 *
 * @param {string} type - PET_TYPES に含まれるID
 * @param {string} name - 1〜12文字
 * @param {{ curiosity: number[], sociability: number[] }} personalityWeights
 *   data/pets.json の personality フィールドをそのまま渡す
 * @returns {import('./types.js').Pet}
 * @throws {Error} バリデーション失敗時
 */
export function createPet(type, name, personalityWeights) {
  // --- バリデーション ---
  if (!PET_TYPES.includes(type)) {
    throw new Error(`不正なペット種類: ${type}`);
  }
  const trimmedName = String(name).trim();
  if (trimmedName.length < NAME_MIN_LENGTH) {
    throw new Error('名前は1文字以上にしてください');
  }
  if (trimmedName.length > NAME_MAX_LENGTH) {
    throw new Error(`名前は${NAME_MAX_LENGTH}文字以内にしてください`);
  }

  // --- 性格パラメータの生成 ---
  const personality = {
    curiosity:   weightedRandom(personalityWeights.curiosity),
    sociability: weightedRandom(personalityWeights.sociability),
  };

  return {
    id:          'current',
    type,
    name:        trimmedName,
    personality,
    affinity:    0,
    state:       PET_STATE.HOME,
    createdAt:   new Date().toISOString(),
  };
}

/**
 * 世話アクションを適用して、新しいPetオブジェクトを返す（元のオブジェクトは変更しない）。
 * なかよし度を1ポイント加算する。上限は MAX_AFFINITY（99）。
 *
 * @param {import('./types.js').Pet} pet
 * @param {'eat'|'stroke'|'speak'} action
 * @returns {import('./types.js').Pet}
 */
export function applyCareAction(pet, action) {
  const validActions = Object.values(CARE_ACTIONS);
  if (!validActions.includes(action)) {
    throw new Error(`不正な世話アクション: ${action}`);
  }
  return {
    ...pet,
    affinity: Math.min(pet.affinity + 1, MAX_AFFINITY),
  };
}

/**
 * ペットの状態を遷移させて、新しいPetオブジェクトを返す。
 * 許可されていない遷移はErrorをthrowする。
 *
 * @param {import('./types.js').Pet} pet
 * @param {'home'|'visiting'|'returning'} nextState
 * @returns {import('./types.js').Pet}
 * @throws {Error} 不正な遷移の場合
 */
export function transitionPetState(pet, nextState) {
  const allowed = VALID_TRANSITIONS[pet.state];
  if (!allowed || !allowed.includes(nextState)) {
    throw new Error(
      `不正な状態遷移: ${pet.state} → ${nextState}。` +
      `許可されている遷移: ${(allowed || []).join(', ') || 'なし'}`
    );
  }
  return { ...pet, state: nextState };
}

/**
 * ペットが在宅かどうかを返す
 * @param {import('./types.js').Pet} pet
 * @returns {boolean}
 */
export function isAtHome(pet) {
  return pet.state === PET_STATE.HOME;
}
