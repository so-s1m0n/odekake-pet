# 設計 — 絵日記とアルバム

対象スペック: M5（絵日記カード生成）・M6（おもいでアルバム）  
対応要件: REQ-M6-001 〜 REQ-M6-016、REQ-M6-NF-001 〜 REQ-M6-NF-004

---

## 1. 画面構成

### 1.1 画面一覧

| 画面ID | 名称 | 対応ファイル | 表示条件 |
|---|---|---|---|
| `screen-homecoming` | 帰宅画面（拡張） | `src/screens/homecoming.js` | 帰宅処理完了直後（M3/M5で共用） |
| `screen-album` | おもいでアルバム | `src/screens/album.js` | ペットが `home` 状態のとき |

`screen-homecoming` は odekake-and-event スペックで定義済み。本スペックでは「絵日記をつくる」ボタンのスタブを本実装に差し替える拡張のみ行う。

---

### 1.2 帰宅画面の拡張（`screen-homecoming`）

M3 スペックで定義した DOM に、カードプレビュー領域と保存ボタンを追加する。

```
┌─────────────────────────────────┐
│           おかえり！              │
│  ─────────────────────────────  │
│  （ペット名・スポット名・出来事・   │  ← M3スペック定義済み
│    おみやげ）                    │
│  ─────────────────────────────  │
│   ┌────────────────────────┐    │
│   │     絵日記をつくる 📖    │    │  ← 押すとカード生成開始
│   └────────────────────────┘    │
│                                 │
│   ┌──────────────────────────┐  │
│   │  [絵日記カードのプレビュー]  │  │  ← 生成後に表示（最大幅360px）
│   │  1080×1920 → 縮小表示    │  │
│   └──────────────────────────┘  │
│   ┌────────────────────────┐    │
│   │   絵日記を保存 ⬇        │    │  ← 生成完了後に有効化
│   └────────────────────────┘    │
│                                 │
│   ┌────────────────────────┐    │
│   │       おうちへ 🏠        │    │
│   └────────────────────────┘    │
└─────────────────────────────────┘
```

**追加する DOM 要素**

```html
<!-- screen-homecoming の <main> 内、#make-card-btn の直後に追加 -->
<div id="card-preview-area" class="card-preview-area" hidden>
  <canvas id="diary-card-canvas" class="card-preview-area__canvas"
          width="1080" height="1920"
          aria-label="絵日記カードのプレビュー"></canvas>
</div>
<button id="save-card-btn" class="btn btn--secondary" disabled aria-disabled="true">
  絵日記を保存 ⬇
</button>
```

**インタラクション仕様**

- 「絵日記をつくる」ボタン押下: `generateCard(cardData, canvas)` を呼ぶ。非同期完了後に `#card-preview-area` を表示し `#save-card-btn` を有効化する
- 「絵日記を保存」ボタン押下: `downloadCardAsPng(canvas, returnedAt)` を呼ぶ
- 「おうちへ」ボタン押下: カードの生成状態に関わらず実行できる（保存を強制しない）

---

### 1.3 おもいでアルバム画面（`screen-album`）

```
┌─────────────────────────────────┐
│  ← ホームへ    おもいでアルバム   │
│                                 │
│  ▼ おみやげ棚                    │  ← 折りたたみ可（デフォルト展開）
│  ┌────────────┐ ┌────────────┐  │
│  │ ⭐ 星のかけら│ │ 🍄 森のきのこ│  │  ← おみやげカード
│  │  月夜の小屋   │ │ 森の標本室  │  │
│  └────────────┘ └────────────┘  │
│                                 │
│  ▼ 旅のきろく（3件）              │
│                                 │
│  ┌─────────────────────────────┐│
│  │ 2026.11.01  ★ 月夜の小屋      ││  ← 訪問カード（Visit 1件分）
│  │ 星のかけらをみつけた…          ││
│  │ おみやげ: ⭐               ││
│  │      [もう一度見る 📖]      ││  ← cardData がある場合のみ表示
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ 2026.10.30  🌿 森の標本室   ││
│  │ テオと標本の整理をした…        ││
│  │        [もう一度見る 📖]    ││
│  └─────────────────────────────┘│
│                                 │
└─────────────────────────────────┘
```

**DOM構造（主要要素）**

```html
<section id="screen-album" class="screen" hidden>
  <header class="screen__header">
    <button id="album-back-btn" class="screen__back-btn">← ホームへ</button>
    <h1 class="screen__title">おもいでアルバム</h1>
  </header>
  <main class="screen__body">

    <!-- おみやげ棚 -->
    <section class="souvenir-shelf" aria-label="おみやげ棚">
      <h2 class="souvenir-shelf__title">おみやげ棚</h2>
      <div id="souvenir-list" class="souvenir-list">
        <!-- JS で生成。おみやげなし時は空メッセージ -->
      </div>
    </section>

    <!-- 旅のきろく -->
    <section class="visit-log" aria-label="旅のきろく">
      <h2 class="visit-log__title">旅のきろく
        <span id="visit-count" class="visit-log__count"></span>
      </h2>
      <div id="visit-list" class="visit-list">
        <!-- JS で生成。空時はメッセージ＋ホーム誘導ボタン -->
      </div>
    </section>

    <!-- カード再表示エリア（クリック時にトグル表示） -->
    <div id="album-card-preview" class="album-card-preview" hidden>
      <canvas id="album-diary-canvas" class="album-card-preview__canvas"
              width="1080" height="1920"
              aria-label="過去の絵日記カードのプレビュー"></canvas>
      <button id="album-save-card-btn" class="btn btn--secondary">
        絵日記を保存 ⬇
      </button>
      <button id="album-close-card-btn" class="btn btn--ghost">閉じる</button>
    </div>

  </main>
</section>
```

**インタラクション仕様**

- 「もう一度見る」ボタン: `#album-card-preview` を表示し `generateCard(cardData, albumCanvas)` を呼ぶ
- 「絵日記を保存」: `downloadCardAsPng(albumCanvas, returnedAt)` を呼ぶ
- 「閉じる」: `#album-card-preview` を非表示にする
- 「← ホームへ」: `goHome()` を呼ぶ

---

## 2. データモデル

本スペックでは新たなエンティティを定義しない。  
入力として使用する既存の型を以下に再掲する（定義元: odekake-and-event/design.md §2.1）。

### 2.1 CardData（参照）

```javascript
/**
 * @typedef {Object} CardData
 * @property {string}      spotId     - 訪問先スポットID
 * @property {string}      petName    - ペットの名前
 * @property {string}      petType    - ペットの種類ID
 * @property {string}      eventText  - 生成済みイベント文
 * @property {string|null} souvenirId - おみやげID（null可）
 * @property {string}      returnedAt - 帰宅日時（ISO 8601）
 */
```

### 2.2 カード描画パラメータ（内部型）

```javascript
/**
 * card-generator.js 内部で使うレイアウト定数。
 * すべてカードの論理サイズ（1080×1920）基準のピクセル値。
 */
const CARD_LAYOUT = {
  WIDTH:  1080,
  HEIGHT: 1920,

  // 背景
  BG_X: 0, BG_Y: 0,

  // テキストエリア（下部オーバーレイ上）
  OVERLAY_Y:        1200,   // 半透明オーバーレイの上端
  OVERLAY_HEIGHT:    720,

  PET_NAME_X:        80,
  PET_NAME_Y:       1280,
  PET_NAME_FONT:    '64px sans-serif',

  EVENT_TEXT_X:      80,
  EVENT_TEXT_Y:     1380,
  EVENT_TEXT_FONT:  '48px sans-serif',
  EVENT_TEXT_MAX_W:  920,   // 折り返し幅
  EVENT_TEXT_LINE_H:  60,   // 行間

  DATE_X:            80,
  DATE_Y:           1820,
  DATE_FONT:        '40px sans-serif',

  // ロゴ（右下）
  LOGO_W:           120,
  LOGO_H:            40,
  LOGO_X:           880,
  LOGO_Y:           1860,
};
```

### 2.3 localStorage との接続

本スペックで新たなキーは追加しない。  
読み込み元: `odekakepet::visits::all`（odekake-and-event スペックで定義済み）。

```
visits::all[i].cardData  ──→  card-generator.js  ──→  <canvas>  ──→  PNG DL
```

---

## 3. モジュール設計

### 3.1 `src/domain/card-generator.js`（新規）

カード描画ロジックの純粋関数群。Canvas 要素は引数で受け取る。

```javascript
/**
 * 絵日記カードを描画する（非同期: 背景画像の読み込みを含む）
 * @param {CardData}         cardData
 * @param {HTMLCanvasElement} canvas
 * @param {SpotDef}          spot     - テーマカラー取得用
 * @returns {Promise<void>}
 */
export async function generateCard(cardData, canvas, spot) { ... }

/**
 * canvas の内容を PNG として端末に保存させる
 * @param {HTMLCanvasElement} canvas
 * @param {string}            returnedAt - ISO 8601。ファイル名の日付部分に使う
 */
export function downloadCardAsPng(canvas, returnedAt) { ... }

// --- 内部ヘルパー（export しない）---

/**
 * 画像 URL を読み込み ImageBitmap を返す（失敗時は null を返す）
 * @param {string} url
 * @returns {Promise<ImageBitmap|null>}
 */
async function loadImage(url) { ... }

/**
 * テキストを折り返しながら描画する
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @returns {number} 最後の行の y 座標（次の要素の配置計算に使う）
 */
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) { ... }

/**
 * 文字列が100文字を超える場合に末尾を「…」で切る
 * @param {string} text
 * @param {number} [maxLen=100]
 * @returns {string}
 */
function truncateText(text, maxLen = 100) { ... }

/**
 * ISO 8601 の日時文字列を「YYYY年MM月DD日」にフォーマットする
 * @param {string} isoString
 * @returns {string}
 */
function formatDateJa(isoString) { ... }
```

**描画シーケンス**

1. `canvas.getContext('2d')` を取得し `clearRect` でリセット
2. 背景画像を `loadImage('assets/spots/{spotId}/bg.png')` で読み込む
   - 成功: `drawImage` で全面に描画
   - 失敗: `spot.themeColor` で `fillRect` を塗る
3. 下部に半透明オーバーレイ（`rgba(0,0,0,0.55)`）を描画
4. `ctx.fillStyle = '#FFFFFF'` でテキスト色を設定し、各フィールドを描画:
   - ペット名: `fillText`（`CARD_LAYOUT.PET_NAME_*`）
   - 出来事テキスト: `truncateText` → `drawWrappedText`
   - 日付: `formatDateJa(returnedAt)` → `fillText`
5. ロゴ画像を `loadImage('assets/ui/logo.svg')` で読み込み右下に描画（失敗時はスキップ）

---

### 3.2 `src/screens/album.js`（新規）

```javascript
/**
 * アルバム画面を初期化する（画面遷移ごとに呼ぶ）
 * @param {Visit[]}   visits   - loadVisitsAll() の結果
 * @param {SpotDef[]} spots    - spots.json から読み込んだスポット定義の配列
 */
export function initAlbumScreen(visits, spots) { ... }
// 内部: renderSouvenirShelf, renderVisitList, onViewCard, onSaveCard, onCloseCard, onBack
```

**`renderSouvenirShelf(visits, spots)`**

- `visits` から `souvenirId !== null` のものを抽出
- `spotId` でグループ化し、グループごとに `<div class="souvenir-group">` を生成
- おみやげゼロ: `<p class="souvenir-shelf__empty">まだおみやげはないよ</p>` を表示

**`renderVisitList(visits, spots)`**

- 降順ソート（`returnedAt` の降順）
- 各 Visit に対し `<article class="visit-card">` を生成:
  - スポット名・帰宅日付・`eventText` の冒頭 40 文字
  - `cardData` が存在する場合のみ「もう一度見る」ボタンを追加
- 0件: `<p class="visit-list__empty">` と `<button id="to-home-from-album-btn">` を表示

**`onViewCard(cardData, spot)`**

1. `#album-card-preview` を表示
2. `generateCard(cardData, albumCanvas, spot)` を呼ぶ
3. 完了後 `#album-save-card-btn` を有効化

---

### 3.3 `src/screens/homecoming.js`（変更）

odekake-and-event スペックで実装した `onMakeCard` スタブを本実装に差し替える。

```javascript
// 変更前: スタブ（console.log のみ）
// 変更後:
async function onMakeCard(cardData, spot) {
  const canvas = document.getElementById('diary-card-canvas');
  await generateCard(cardData, canvas, spot);
  document.getElementById('card-preview-area').hidden = false;
  const saveBtn = document.getElementById('save-card-btn');
  saveBtn.disabled = false;
  saveBtn.setAttribute('aria-disabled', 'false');
}

function onSaveCard(canvas, returnedAt) {
  downloadCardAsPng(canvas, returnedAt);
}
```

---

### 3.4 `src/router.js`（拡張）

```javascript
// 追加
const SCREEN_IDS = [
  ...既存,
  'screen-album',   // 追加
];

export function goAlbum() { showScreen('screen-album'); }
```

---

### 3.5 `src/screens/home.js`（変更）

- `initHomeScreen` 内に「おもいでアルバム」ボタンのイベントリスナーを追加し、クリックで `goAlbum()` を呼ぶ
- ペットが `visiting` 状態の場合はボタンを `disabled` にする（REQ-M6-010）

---

### 3.6 `src/main.js`（変更）

`bootstrap` 関数に以下を追加する。

```javascript
// screen-album の初期化
import { initAlbumScreen } from './screens/album.js';

// goAlbum() に連動して initAlbumScreen を呼ぶ
// router.js の showScreen フックで visits/spots を渡す
```

---

### 3.7 `index.html`（変更）

- `screen-album` セクションを追加する
- `<canvas id="diary-card-canvas">` を `screen-homecoming` 内に追加する
- `<canvas id="album-diary-canvas">` を `screen-album` 内に追加する
- `<link rel="stylesheet" href="styles/screens/album.css">` を追加する

---

## 4. 状態遷移図（M6 追加分）

```
screen-home
    │
    │  「おもいでアルバム」ボタン（pet.state === 'home' のみ）
    ▼
screen-album
    │
    │  「← ホームへ」ボタン
    ▼
screen-home

screen-homecoming
    │
    │  「絵日記をつくる」ボタン
    │    └─ generateCard() → canvas 描画
    │         └─ 「絵日記を保存」ボタン有効化
    │
    │  「おうちへ」ボタン（カード保存とは独立）
    ▼
screen-home
```

---

## 5. ファイル別の責務まとめ

| ファイル | 責務 | 新規/変更 |
|---|---|---|
| `src/domain/card-generator.js` | Canvas描画・PNG DL・テキスト処理ヘルパー（純粋関数） | 新規 |
| `src/screens/album.js` | アルバム画面のUI（訪問履歴・おみやげ棚・カード再表示） | 新規 |
| `src/screens/homecoming.js` | `onMakeCard` スタブを本実装に差し替え | 変更 |
| `src/router.js` | `screen-album` の追加・`goAlbum()` の追加 | 変更 |
| `src/screens/home.js` | 「おもいでアルバム」ボタンのリスナー追加 | 変更 |
| `src/main.js` | `initAlbumScreen` の初期化呼び出し追加 | 変更 |
| `index.html` | `screen-album` セクション・canvas 要素・CSS link の追加 | 変更 |
| `styles/screens/album.css` | アルバム画面固有のスタイル | 新規 |
| `styles/screens/homecoming.css` | カードプレビューエリアのスタイル追加 | 変更 |

---

## 6. テスト対象

| テストファイル | テスト内容 |
|---|---|
| `tests/card-generator.test.js` | `truncateText`: 100文字以下はそのまま・101文字以上は末尾「…」で切ること |
| | `truncateText`: 空文字・ちょうど100文字の境界値 |
| | `formatDateJa`: ISO 8601 → 「YYYY年MM月DD日」への変換確認 |
| | `formatDateJa`: タイムゾーンオフセット付き文字列（+09:00）でも正しい日付になること |
| | `drawWrappedText`: （目視確認。自動テストは行わない） |
| | `generateCard`: （スナップショット目視確認。自動テストは行わない） |
