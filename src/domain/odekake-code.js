/**
 * src/domain/odekake-code.js
 * おともだちコード／足跡コードのエンコード・デコード（M7）。
 * 純粋関数のみで構成し、DOM・localStorage には一切依存しない。
 *
 * コード形式: 'v1:' + Base64URL( UTF-8 JSON )
 * ペイロードには FNV-1a 32bit チェックサムを含め、破損・改ざんを検出する。
 * 設計: .kiro/specs/friend-visit/design.md 2.1 / 2.2 / 3.1 / 4.1〜4.3
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** コードのバージョン */
export const CODE_VERSION = 1;

/** コードのプレフィクス（バージョン識別子） */
export const CODE_PREFIX = 'v1:';

/** コード全体の最大文字数 */
export const CODE_MAX_LENGTH = 500;

/** 足跡コードの eventSummary 最大文字数 */
const EVENT_SUMMARY_MAX_LENGTH = 50;

// ─────────────────────────────────────────────
// 型定義（JSDocのみ）
// ─────────────────────────────────────────────

/**
 * @typedef {Object} FriendCodePayload
 * @property {number} v           - コードバージョン（現行: 1）
 * @property {string} petName     - ペットの名前
 * @property {string} petType     - ペットの種類ID
 * @property {number} curiosity   - 好奇心パラメータ（0〜2）
 * @property {number} sociability - 社交性パラメータ（0〜2）
 * @property {string} issuedAt    - 発行日時（ISO 8601）
 * @property {number} checksum    - FNV-1a 32bit チェックサム
 */

/**
 * @typedef {Object} FootprintCodePayload
 * @property {number} v              - コードバージョン（現行: 1）
 * @property {string} visitorPetName - 訪問者ペットの名前
 * @property {string} visitorPetType - 訪問者ペットの種類ID
 * @property {string} visitedAt      - 帰宅日時（ISO 8601）
 * @property {string} eventSummary   - イベント文の要約（最大50文字）
 * @property {number} checksum       - FNV-1a 32bit チェックサム
 */

// ─────────────────────────────────────────────
// チェックサムと正規化
// ─────────────────────────────────────────────

/**
 * FNV-1a 32bit ハッシュを返す（UTF-8 バイト列に対して計算）。
 * 空文字列でもエラーにならない（オフセット基底値を返す）。
 *
 * @param {string} str
 * @returns {number} 符号なし 32bit 整数
 */
export function fnv1a32(str) {
  const bytes = new TextEncoder().encode(str);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * オブジェクトのキーを昇順にソートし、`checksum` フィールドを除外して
 * JSON 文字列化する。チェックサム計算の入力として使う（キー順に依存しない）。
 *
 * @param {Object} obj
 * @returns {string}
 */
export function canonicalStringify(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    if (key === 'checksum') continue;
    sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}

/**
 * 名前から短いハッシュ文字列（16進数8桁）を返す。合成スポットIDの生成に使う。
 *
 * @param {string} name
 * @returns {string}
 */
export function shortHash(name) {
  return fnv1a32(name).toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────
// Base64URL 変換（内部ヘルパー）
// ─────────────────────────────────────────────

/**
 * UTF-8 文字列を Base64URL 文字列に変換する。
 *
 * @param {string} str
 * @returns {string}
 */
function toBase64url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Base64URL 文字列を UTF-8 文字列に戻す。失敗時は null。
 *
 * @param {string} b64
 * @returns {string|null}
 */
function fromBase64url(b64) {
  if (!/^[A-Za-z0-9_-]+$/.test(b64)) return null;
  try {
    const padded = b64.replaceAll('-', '+').replaceAll('_', '/')
      + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// エンコード／デコード（共通実装）
// ─────────────────────────────────────────────

/**
 * ペイロードにチェックサムを付加してコード文字列を生成する共通処理。
 *
 * @param {Object} payload - checksum を含まないペイロード
 * @returns {{ code: string, error: string|null }}
 */
function encodePayload(payload) {
  const body = { ...payload };
  delete body.checksum;
  const full = { ...body, checksum: fnv1a32(canonicalStringify(body)) };
  const code = CODE_PREFIX + toBase64url(JSON.stringify(full));
  if (code.length > CODE_MAX_LENGTH) {
    return { code: '', error: 'コードが長すぎるよ' };
  }
  return { code, error: null };
}

/**
 * コード文字列を検証してペイロードを取り出す共通処理。
 * 検証シーケンスは設計書 4.2 節の5ステップどおり。
 *
 * @param {string} code
 * @param {string[]} requiredFields - 必須フィールド名の配列
 * @returns {{ payload: Object|null, error: string|null }}
 */
function decodePayload(code, requiredFields) {
  // ステップ1: プレフィクス確認
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (!trimmed.startsWith(CODE_PREFIX)) {
    return { payload: null, error: 'バージョンが合わないコードだよ' };
  }
  // ステップ2: Base64URL デコード
  const json = fromBase64url(trimmed.slice(CODE_PREFIX.length));
  if (json === null) {
    return { payload: null, error: '読み込めないコードだよ' };
  }
  // ステップ3: JSON パース
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return { payload: null, error: 'コードの形式が正しくないよ' };
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { payload: null, error: 'コードの形式が正しくないよ' };
  }
  // ステップ4: 必須フィールドとバージョンの確認
  if (payload.v !== undefined && payload.v !== CODE_VERSION) {
    return { payload: null, error: 'バージョンが合わないコードだよ' };
  }
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      return { payload: null, error: 'コードのデータが足りないよ' };
    }
  }
  // ステップ5: チェックサム照合
  const expected = fnv1a32(canonicalStringify(payload));
  if (payload.checksum !== expected) {
    return { payload: null, error: 'コードが壊れているか改ざんされているよ' };
  }
  return { payload, error: null };
}

// ─────────────────────────────────────────────
// おともだちコード
// ─────────────────────────────────────────────

const FRIEND_REQUIRED_FIELDS = ['v', 'petName', 'petType', 'curiosity', 'sociability', 'issuedAt', 'checksum'];

/**
 * FriendCodePayload をおともだちコード文字列にエンコードする。
 *
 * @param {Omit<FriendCodePayload, 'checksum'>} payload
 * @returns {{ code: string, error: string|null }}
 */
export function encodeFriendCode(payload) {
  return encodePayload(payload);
}

/**
 * おともだちコード文字列をデコードして FriendCodePayload を返す。
 *
 * @param {string} code
 * @returns {{ payload: FriendCodePayload|null, error: string|null }}
 */
export function decodeFriendCode(code) {
  return decodePayload(code, FRIEND_REQUIRED_FIELDS);
}

// ─────────────────────────────────────────────
// 足跡コード
// ─────────────────────────────────────────────

const FOOTPRINT_REQUIRED_FIELDS = ['v', 'visitorPetName', 'visitorPetType', 'visitedAt', 'eventSummary', 'checksum'];

/**
 * FootprintCodePayload を足跡コード文字列にエンコードする。
 * eventSummary が50文字を超える場合は、50文字目を「…」に置き換えて切り詰める。
 *
 * @param {Omit<FootprintCodePayload, 'checksum'>} payload
 * @returns {{ code: string, error: string|null }}
 */
export function encodeFootprintCode(payload) {
  const body = { ...payload };
  if (typeof body.eventSummary === 'string' && body.eventSummary.length > EVENT_SUMMARY_MAX_LENGTH) {
    body.eventSummary = body.eventSummary.slice(0, EVENT_SUMMARY_MAX_LENGTH - 1) + '…';
  }
  return encodePayload(body);
}

/**
 * 足跡コード文字列をデコードして FootprintCodePayload を返す。
 *
 * @param {string} code
 * @returns {{ payload: FootprintCodePayload|null, error: string|null }}
 */
export function decodeFootprintCode(code) {
  return decodePayload(code, FOOTPRINT_REQUIRED_FIELDS);
}
