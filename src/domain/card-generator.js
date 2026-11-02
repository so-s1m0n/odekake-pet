/**
 * src/domain/card-generator.js
 * 絵日記カードの Canvas 描画ロジック。
 * DOM（Canvas 2D API）に依存するため純粋関数ではないが、
 * localStorage・router などの副作用には依存しない。
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** カードのレイアウト定数（1080×1920px 相当の論理サイズ） */
export const CARD_LAYOUT = {
  WIDTH:          1080,
  HEIGHT:         1920,

  // 下部半透明オーバーレイ
  OVERLAY_Y:      1200,
  OVERLAY_HEIGHT: 720,
  OVERLAY_COLOR:  'rgba(0, 0, 0, 0.55)',

  // テキスト描画位置
  PET_NAME_X:     540,
  PET_NAME_Y:     1280,
  PET_NAME_SIZE:  72,

  EVENT_TEXT_X:    100,
  EVENT_TEXT_Y:    1390,
  EVENT_TEXT_SIZE: 48,
  EVENT_MAX_WIDTH: 880,
  EVENT_LINE_H:    72,

  DATE_X:         540,
  DATE_Y:         1810,
  DATE_SIZE:      40,

  // ロゴ（右下）
  LOGO_W:  200,
  LOGO_H:   80,
  LOGO_X:  840,
  LOGO_Y: 1820,
};

/** イベント文の最大文字数 */
const MAX_EVENT_TEXT_LENGTH = 100;

// ─────────────────────────────────────────────
// 内部ヘルパー関数（export しない）
// ─────────────────────────────────────────────

/**
 * テキストを最大 `maxLen` 文字に切り詰める。
 * 超過した場合は `maxLen` 文字目を「…」に置き換えて返す。
 *
 * @param {string} text
 * @param {number} [maxLen=100]
 * @returns {string}
 */
function truncateText(text, maxLen = MAX_EVENT_TEXT_LENGTH) {
  if (text.length <= maxLen) return text;
  // maxLen 文字目（index: maxLen-1）を「…」に置き換え
  return text.slice(0, maxLen - 1) + '…';
}

/**
 * ISO 8601 文字列を「YYYY年MM月DD日」形式に変換して返す。
 * `Intl.DateTimeFormat` を使用することでタイムゾーン依存を避ける。
 *
 * @param {string} isoString - ISO 8601 形式の日時文字列
 * @returns {string} 例: '2026年11月2日'
 */
function formatDateJa(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('ja-JP', {
    year:  'numeric',
    month: 'numeric',
    day:   'numeric',
  }).format(date);
}

/**
 * Canvas にテキストを折り返しながら描画する。
 * `ctx.measureText` でトークンを計測し、`maxWidth` を超えたら改行する。
 * 呼び出し元でフォント・色などのスタイルを設定しておくこと。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string}  text        - 描画するテキスト
 * @param {number}  x           - 描画開始 x 座標
 * @param {number}  y           - 描画開始 y 座標（1行目のベースライン）
 * @param {number}  maxWidth    - 1行の最大幅（ピクセル）
 * @param {number}  lineHeight  - 行間（ピクセル）
 * @returns {number} 最後の行を描画した y 座標
 */
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  // 文字単位でトークン化する（日本語は空白区切りではないため1文字ずつ）
  const chars = Array.from(text);
  let currentLine = '';
  let currentY = y;

  for (const char of chars) {
    const candidate = currentLine + char;
    const { width } = ctx.measureText(candidate);

    if (width > maxWidth && currentLine.length > 0) {
      // 現在の行を確定して描画し、次の行へ進む
      ctx.fillText(currentLine, x, currentY);
      currentLine = char;
      currentY += lineHeight;
    } else {
      currentLine = candidate;
    }
  }

  // 残った最終行を描画する
  if (currentLine.length > 0) {
    ctx.fillText(currentLine, x, currentY);
  }

  return currentY;
}
