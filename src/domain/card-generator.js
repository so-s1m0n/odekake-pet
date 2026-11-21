/**
 * src/domain/card-generator.js
 * 絵日記カードの Canvas 描画ロジック。
 * DOM（Canvas 2D API）に依存するため純粋関数ではないが、
 * localStorage・router などの副作用には依存しない。
 */

import { badgeLabelFor } from '../ai/diary-ai.js';

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

  // 推論元バッジ（右上ピル型。AI日記のときだけ描く）
  BADGE_MARGIN:    40,
  BADGE_Y:         44,
  BADGE_HEIGHT:    68,
  BADGE_FONT_SIZE: 36,
  BADGE_PADDING_X: 30,
};

/** イベント文の最大文字数 */
const MAX_EVENT_TEXT_LENGTH = 100;

// ─────────────────────────────────────────────
// ヘルパー関数（truncateText / formatDateJa は単体テストのため export する）
// ─────────────────────────────────────────────

/**
 * テキストを最大 `maxLen` 文字に切り詰める。
 * 超過した場合は `maxLen` 文字目を「…」に置き換えて返す。
 *
 * @param {string} text
 * @param {number} [maxLen=100]
 * @returns {string}
 */
export function truncateText(text, maxLen = MAX_EVENT_TEXT_LENGTH) {
  if (text.length <= maxLen) return text;
  // maxLen 文字目（index: maxLen-1）を「…」に置き換え
  return text.slice(0, maxLen - 1) + '…';
}

/**
 * ISO 8601 文字列を「YYYY年M月D日」形式に変換して返す。
 * Intl の ja-JP 数値書式は環境により「2026/11/2」のようなスラッシュ表記に
 * なるため、年月日表記を保証するためにローカル日付から組み立てる。
 * 月・日はゼロパディングしない。
 *
 * @param {string} isoString - ISO 8601 形式の日時文字列
 * @returns {string} 例: '2026年11月2日'
 */
export function formatDateJa(isoString) {
  const date = new Date(isoString);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
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

// ─────────────────────────────────────────────
// 内部ヘルパー関数（TASK-16 追加分）
// ─────────────────────────────────────────────

/**
 * 画像 URL を読み込み ImageBitmap を返す。
 * fetch または createImageBitmap が失敗した場合は null を返す（例外を投げない）。
 *
 * @param {string} url - 読み込む画像の URL
 * @returns {Promise<ImageBitmap|null>}
 */
async function loadImage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    // ネットワークエラー・デコードエラーいずれも null で返す
    return null;
  }
}

// ─────────────────────────────────────────────
// 公開 API（TASK-16 追加分）
// ─────────────────────────────────────────────

/**
 * 絵日記カードを Canvas に描画する。
 * 背景画像の読み込みを含むため非同期。
 *
 * 描画順:
 *  1. Canvas をクリア
 *  2. 背景画像（失敗時はテーマカラーで塗りつぶし）
 *  3. 下部半透明オーバーレイ
 *  4. テキスト（ペット名・出来事・日付）
 *  5. ロゴ（失敗時はスキップ）
 *
 * @param {import('./card-generator.js').CardData} cardData - 描画するカードのデータ
 * @param {HTMLCanvasElement} canvas - 描画対象の Canvas 要素
 * @param {{ themeColor: string }} spot - テーマカラー取得用のスポット定義
 * @returns {Promise<void>}
 */
export async function generateCard(cardData, canvas, spot) {
  const ctx = canvas.getContext('2d');

  // 1. Canvas をクリア
  ctx.clearRect(0, 0, CARD_LAYOUT.WIDTH, CARD_LAYOUT.HEIGHT);

  // 2. 背景画像
  const bgImage = await loadImage('assets/spots/' + cardData.spotId + '/bg.png');
  if (bgImage !== null) {
    // 読み込み成功: 全面に描画
    ctx.drawImage(bgImage, 0, 0, CARD_LAYOUT.WIDTH, CARD_LAYOUT.HEIGHT);
  } else {
    // 読み込み失敗: スポットのテーマカラーで塗りつぶす
    ctx.fillStyle = spot.themeColor;
    ctx.fillRect(0, 0, CARD_LAYOUT.WIDTH, CARD_LAYOUT.HEIGHT);
  }

  // 3. 下部半透明オーバーレイ
  ctx.fillStyle = CARD_LAYOUT.OVERLAY_COLOR;
  ctx.fillRect(
    0,
    CARD_LAYOUT.OVERLAY_Y,
    CARD_LAYOUT.WIDTH,
    CARD_LAYOUT.OVERLAY_HEIGHT,
  );

  // 4. テキストを白色で描画
  ctx.fillStyle = '#FFFFFF';

  // 4a. ペット名（中央揃え）
  ctx.font = CARD_LAYOUT.PET_NAME_SIZE + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(cardData.petName, CARD_LAYOUT.PET_NAME_X, CARD_LAYOUT.PET_NAME_Y);

  // 4b. 出来事テキスト（折り返し描画）
  ctx.font = CARD_LAYOUT.EVENT_TEXT_SIZE + 'px sans-serif';
  ctx.textAlign = 'left';
  drawWrappedText(
    ctx,
    truncateText(cardData.eventText),
    CARD_LAYOUT.EVENT_TEXT_X,
    CARD_LAYOUT.EVENT_TEXT_Y,
    CARD_LAYOUT.EVENT_MAX_WIDTH,
    CARD_LAYOUT.EVENT_LINE_H,
  );

  // 4c. 日付（中央揃え）
  ctx.font = CARD_LAYOUT.DATE_SIZE + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    formatDateJa(cardData.returnedAt),
    CARD_LAYOUT.DATE_X,
    CARD_LAYOUT.DATE_Y,
  );

  // 5. ロゴ（右下。読み込み失敗時はスキップ）
  const logo = await loadImage('assets/ui/logo.svg');
  if (logo !== null) {
    ctx.drawImage(logo, CARD_LAYOUT.LOGO_X, CARD_LAYOUT.LOGO_Y, CARD_LAYOUT.LOGO_W, CARD_LAYOUT.LOGO_H);
  }

  // 6. 推論元バッジ（右上。cardData.inferenceSource があるときだけ描く。
  //    AI未設定・旧データでは存在しないため、従来の見た目のままになる）
  const badgeLabel = badgeLabelFor(cardData.inferenceSource);
  if (badgeLabel !== null) {
    drawInferenceBadge(ctx, badgeLabel);
  }
}

/**
 * 推論元バッジを右上にピル型で描画する。
 * 背景写真の上でも読めるよう、半透明の黒地に白文字で描く。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} label - バッジ表示文（badgeLabelFor の戻り値）
 */
function drawInferenceBadge(ctx, label) {
  const { WIDTH, BADGE_MARGIN, BADGE_Y, BADGE_HEIGHT, BADGE_FONT_SIZE, BADGE_PADDING_X } = CARD_LAYOUT;

  ctx.font = BADGE_FONT_SIZE + 'px sans-serif';
  const textWidth = ctx.measureText(label).width;
  const badgeWidth = textWidth + BADGE_PADDING_X * 2;
  const badgeX = WIDTH - BADGE_MARGIN - badgeWidth;

  // ピル型の地
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(badgeX, BADGE_Y, badgeWidth, BADGE_HEIGHT, BADGE_HEIGHT / 2);
  } else {
    ctx.rect(badgeX, BADGE_Y, badgeWidth, BADGE_HEIGHT);
  }
  ctx.fill();

  // ラベル（中央揃え・縦中央）
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, badgeX + badgeWidth / 2, BADGE_Y + BADGE_HEIGHT / 2);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Canvas の内容を PNG ファイルとして端末に保存させる。
 * ファイル名は 'odekake-YYYYMMDD.png' 形式（例: odekake-20261102.png）。
 *
 * @param {HTMLCanvasElement} canvas     - 保存する Canvas 要素
 * @param {string}            returnedAt - 帰宅日時（ISO 8601）。ファイル名の日付部分に使う
 */
export function downloadCardAsPng(canvas, returnedAt) {
  canvas.toBlob((blob) => {
    // Blob が生成できなかった場合は何もしない
    if (blob === null) return;

    // ファイル名用の日付文字列（YYYYMMDD）を生成する
    // ISO 8601 の先頭10文字（YYYY-MM-DD）からハイフンを除去する
    const datePart = returnedAt.slice(0, 10).replace(/-/g, '');
    const filename = 'odekake-' + datePart + '.png';

    // <a download> を使って保存を促す
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    // Object URL を解放してメモリリークを防ぐ
    URL.revokeObjectURL(url);
  }, 'image/png');
}
