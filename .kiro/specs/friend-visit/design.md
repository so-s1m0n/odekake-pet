# 設計 — おともだち訪問

対象スペック: M7（おともだちコードの発行・コードでの訪問・足跡コードの受け取り）  
対応要件: REQ-M7-001 〜 REQ-M7-020、REQ-M7-NF-001 〜 REQ-M7-NF-005

---

## 1. 画面構成

### 1.1 変更・追加する画面

| 画面ID | 変更区分 | 変更内容 |
|---|---|---|
| `screen-home` | 変更 | 「おともだちコードを発行」ボタン追加、足跡通知エリア追加、「あしあとを見る」ボタン追加 |
| `screen-odekake` | 変更 | コード入力エリアと「このコードで訪問」ボタン追加、コードプレビューエリア追加 |
| `screen-homecoming` | 変更 | 友達訪問時のみ「足跡コードを発行」ボタン追加 |
| `screen-footprints` | 新規 | 足跡レコードの全件一覧画面 |

---

### 1.2 ホーム画面の追加要素

```
┌─────────────────────────────────┐
│  （既存のペット表示エリア）         │
│                                 │
│  ┌────────────────────────────┐ │
│  │ 🐾 あしあと（3件）          │ │  ← 足跡通知エリア（件数が0件なら非表示）
│  │ ゆきちゃんが遊びに来たよ 🐧   │ │
│  │ むーちゃんが遊びに来たよ 🐰   │ │
│  │ ...                        │ │
│  │ [あしあとを見る →]          │ │
│  └────────────────────────────┘ │
│                                 │
│  [おともだちコードを発行]         │  ← state=home のときのみ活性化
│  （既存の世話ボタン群）           │
└─────────────────────────────────┘
```

**追加 DOM 要素**

```html
<!-- 足跡通知エリア（screen-home 内） -->
<section id="footprint-notice" class="footprint-notice" hidden>
  <h2 class="footprint-notice__title">🐾 あしあと</h2>
  <ul id="footprint-notice-list" class="footprint-notice__list"></ul>
  <button id="open-footprints-btn" class="btn btn--link">あしあとを見る →</button>
</section>

<!-- おともだちコード発行ボタン（screen-home 内） -->
<button id="issue-friend-code-btn" class="btn btn--secondary">
  おともだちコードを発行
</button>

<!-- コード発行モーダル（screen-home 内、hidden で初期配置） -->
<div id="friend-code-modal" class="modal" hidden role="dialog" aria-modal="true"
     aria-labelledby="friend-code-modal-title">
  <div class="modal__inner">
    <h2 id="friend-code-modal-title" class="modal__title">おともだちコード</h2>
    <p class="modal__lead">友達にこのコードを渡してね</p>
    <textarea id="friend-code-output" class="code-textarea" readonly rows="4"
              aria-label="おともだちコード"></textarea>
    <button id="copy-friend-code-btn" class="btn btn--primary">コピー</button>
    <button id="close-friend-code-modal-btn" class="btn btn--link">閉じる</button>
  </div>
</div>
```

---

### 1.3 おでかけ選択画面の追加要素

```
┌─────────────────────────────────┐
│  （既存のスポット選択リスト）       │
│                                 │
│  ── または ──                   │
│                                 │
│  友達のコードで訪問する            │
│  ┌───────────────────────────┐  │
│  │ コードをここに貼り付けてね   │  │  ← textarea
│  └───────────────────────────┘  │
│  [このコードで訪問]               │
│                                 │
│  ┌───────────────────────────┐  │
│  │ ✅ ゆきちゃんのおうちを訪問   │  │  ← 検証成功プレビュー（hidden で初期配置）
│  │    します                  │  │
│  └───────────────────────────┘  │
│  [出発する ✈]                   │  ← 検証成功後に活性化
└─────────────────────────────────┘
```

**追加 DOM 要素（`screen-odekake` 内）**

```html
<div class="odekake__divider">── または ──</div>

<section class="friend-code-section">
  <h2 class="friend-code-section__title">友達のコードで訪問する</h2>
  <textarea id="friend-code-input" class="code-textarea"
            placeholder="コードをここに貼り付けてね"
            rows="3" aria-label="おともだちコードの入力"></textarea>
  <p id="friend-code-error" class="friend-code-section__error" hidden
     role="alert"></p>
  <button id="verify-friend-code-btn" class="btn btn--secondary">
    このコードで訪問
  </button>
  <div id="friend-code-preview" class="friend-code-preview" hidden>
    <p id="friend-code-preview-text" class="friend-code-preview__text"></p>
    <button id="depart-friend-btn" class="btn btn--primary">出発する ✈</button>
  </div>
</section>
```

---

### 1.4 帰宅画面の追加要素

友達訪問の場合のみ「足跡コードを発行」ボタンを表示する。

```html
<!-- screen-homecoming 内、既存の make-card-btn の下に追加 -->
<button id="issue-footprint-code-btn" class="btn btn--secondary" hidden>
  足跡コードを発行 🐾
</button>

<!-- 足跡コードモーダル（hidden で初期配置） -->
<div id="footprint-code-modal" class="modal" hidden role="dialog" aria-modal="true"
     aria-labelledby="footprint-code-modal-title">
  <div class="modal__inner">
    <h2 id="footprint-code-modal-title" class="modal__title">足跡コード</h2>
    <p class="modal__lead">友達にこのコードを渡してね</p>
    <textarea id="footprint-code-output" class="code-textarea" readonly rows="4"
              aria-label="足跡コード"></textarea>
    <button id="copy-footprint-code-btn" class="btn btn--primary">コピー</button>
    <button id="close-footprint-code-modal-btn" class="btn btn--link">閉じる</button>
  </div>
</div>
```

---

### 1.5 足跡一覧画面（新規 `screen-footprints`）

```
┌─────────────────────────────────┐
│  ← ホームへ       あしあと       │
│                                 │
│  足跡コードを入力する             │
│  ┌───────────────────────────┐  │
│  │ コードをここに貼り付けてね   │  │
│  └───────────────────────────┘  │
│  [足跡を記録]                    │
│  （エラー文言表示エリア）          │
│                                 │
│  ── これまでの来訪 ──            │
│  🐧 ゆきちゃん 11/15             │
│    「工房で星のかけらを…」         │
│  🐰 むーちゃん 11/14             │
│    「図書室の棚に…」              │
└─────────────────────────────────┘
```

**DOM 構造（`screen-footprints`）**

```html
<section id="screen-footprints" class="screen" hidden>
  <header class="screen__header">
    <button id="footprints-back-btn" class="screen__back-btn">← ホームへ</button>
    <h1 class="screen__title">あしあと</h1>
  </header>
  <main class="screen__body">
    <section class="footprint-input-section">
      <h2 class="footprint-input-section__title">足跡コードを入力する</h2>
      <textarea id="footprint-code-input" class="code-textarea"
                placeholder="コードをここに貼り付けてね"
                rows="3" aria-label="足跡コードの入力"></textarea>
      <p id="footprint-input-error" class="footprint-input-section__error" hidden
         role="alert"></p>
      <p id="footprint-input-success" class="footprint-input-section__success" hidden
         role="status"></p>
      <button id="record-footprint-btn" class="btn btn--primary">足跡を記録</button>
    </section>

    <section class="footprint-list-section">
      <h2 class="footprint-list-section__title">これまでの来訪</h2>
      <ul id="footprint-list" class="footprint-list" aria-live="polite"></ul>
      <p id="footprint-list-empty" class="footprint-list__empty" hidden>
        まだ来訪記録がないよ
      </p>
    </section>
  </main>
</section>
```

---

## 2. データモデル

### 2.1 FriendCode ペイロード

```javascript
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
```

**エンコード例（論理構造）**

```
コード = "v1:" + base64url(JSON.stringify(payload))
最大長 = 500文字以内（REQ-M7-005）
```

---

### 2.2 FootprintCode ペイロード

```javascript
/**
 * @typedef {Object} FootprintCodePayload
 * @property {number} v                - コードバージョン（現行: 1）
 * @property {string} visitorPetName   - 訪問者ペットの名前
 * @property {string} visitorPetType   - 訪問者ペットの種類ID
 * @property {string} visitedAt        - 帰宅日時（ISO 8601）
 * @property {string} eventSummary     - イベント文先頭50文字（超過時は「…」付き）
 * @property {number} checksum         - FNV-1a 32bit チェックサム
 */
```

---

### 2.3 FootprintRecord（localStorage 保存形式）

```javascript
/**
 * @typedef {Object} FootprintRecord
 * @property {string} id              - 一意ID（`footprint-${Date.now()}`）
 * @property {string} visitorPetName  - 訪問者ペットの名前
 * @property {string} visitorPetType  - 訪問者ペットの種類ID
 * @property {string} visitedAt       - 訪問日時（ISO 8601）
 * @property {string} eventSummary    - イベント要約文
 * @property {string} recordedAt      - 記録日時（ISO 8601）
 */
```

**localStorage キー**: `odekakepet::footprints::all`（配列 JSON）

```json
[
  {
    "id": "footprint-1731676800000",
    "visitorPetName": "ゆき",
    "visitorPetType": "soraaru-penguin",
    "visitedAt": "2026-11-15T14:30:00+09:00",
    "eventSummary": "工房の棚の隙間に星のかけらをみつけた。",
    "recordedAt": "2026-11-15T18:00:00+09:00"
  }
]
```

---

### 2.4 合成スポット定義（インメモリ）

```javascript
/**
 * @typedef {Object} SyntheticSpot
 * @property {string}          id          - `friend-{shortHash(petName)}`（一時値）
 * @property {string}          displayName - `{hostPetName} のおうち`
 * @property {string}          themeColor  - '#b8d4e8'（友達訪問用デフォルト）
 * @property {string}          icon        - '🏠'
 * @property {EventTemplate[]} events      - friend-events.json から読み込んだテンプレート群
 * @property {HostPet}         hostPet     - ホストペット情報
 */

/**
 * @typedef {Object} HostPet
 * @property {string} name        - ホストペットの名前
 * @property {string} type        - ホストペットの種類ID
 * @property {{ curiosity: number, sociability: number }} personality
 */
```

---

### 2.5 friend-events.json のイベントテンプレート形式

```javascript
/**
 * @typedef {Object} FriendEventTemplate
 * @property {string}               id         - テンプレートID（`friend-001` 形式）
 * @property {string}               text       - {petName}（訪問者）・{hostName}（ホスト）プレースホルダー入り
 * @property {string|null}          souvenirId - null 固定（友達訪問ではおみやげなし）
 * @property {EventConditions|null} conditions - 既存 EventConditions 型と同一
 */
```

**プレースホルダーの置換順序**

1. `generateEvent` を呼ぶ前に `{hostName}` を `hostPet.name` で一括置換してテンプレート文字列を加工する
2. `generateEvent` 内部の既存ロジックが `{petName}` を訪問者ペット名で置換する

---

## 3. モジュール設計

### 3.1 `src/domain/odekake-code.js`（新規）

コードのエンコード・デコード・検証を担う純粋関数群。DOM・localStorage に依存しない。

```javascript
/** 現行コードバージョン */
export const CODE_VERSION = 1;

/** コードプレフィクス */
export const CODE_PREFIX = 'v1:';

/** コード最大文字数 */
export const CODE_MAX_LENGTH = 500;

/**
 * FNV-1a 32bit チェックサムを算出する。
 * @param {string} str
 * @returns {number} 符号なし 32bit 整数
 */
export function fnv1a32(str) { ... }

/**
 * オブジェクトのチェックサム計算用文字列を生成する。
 * キーを昇順にソートし、checksum フィールドを除外して JSON.stringify する。
 * @param {Object} obj
 * @returns {string}
 */
export function canonicalStringify(obj) { ... }

/**
 * FriendCodePayload をおともだちコード文字列にエンコードする。
 * @param {Omit<FriendCodePayload, 'checksum'>} payload - checksum 未設定のペイロード
 * @returns {{ code: string, error: string|null }}
 *   code: 生成されたコード文字列（エラー時は空文字）
 *   error: エラーメッセージ（成功時は null）
 */
export function encodeFriendCode(payload) { ... }

/**
 * おともだちコード文字列をデコードして FriendCodePayload を返す。
 * @param {string} code
 * @returns {{ payload: FriendCodePayload|null, error: string|null }}
 */
export function decodeFriendCode(code) { ... }

/**
 * FootprintCodePayload を足跡コード文字列にエンコードする。
 * @param {Omit<FootprintCodePayload, 'checksum'>} payload
 * @returns {{ code: string, error: string|null }}
 */
export function encodeFootprintCode(payload) { ... }

/**
 * 足跡コード文字列をデコードして FootprintCodePayload を返す。
 * @param {string} code
 * @returns {{ payload: FootprintCodePayload|null, error: string|null }}
 */
export function decodeFootprintCode(code) { ... }

/**
 * petName の短縮ハッシュ値を返す（合成スポット ID 生成用）。
 * fnv1a32 の結果を 16進数 8桁にフォーマットする。
 * @param {string} name
 * @returns {string}
 */
export function shortHash(name) { ... }
```

**内部ヘルパー（非 export）**

```javascript
// UTF-8 文字列 → Uint8Array → Base64URL 文字列
function toBase64url(str) { ... }

// Base64URL 文字列 → UTF-8 文字列（失敗時は null）
function fromBase64url(b64) { ... }

// 共通デコード・検証ロジック（FriendCode / FootprintCode で共用）
// requiredFields: 検証するフィールド名の配列
function decodeAndVerify(code, requiredFields) { ... }
```

---

### 3.2 `src/domain/event-generator.js`（変更）

`generateEvent` にオプション引数 `hostName` を追加し、合成スポットのテンプレートに `{hostName}` プレースホルダーが含まれる場合を処理する。

```javascript
/**
 * @param {SpotDef|SyntheticSpot} spot
 * @param {Pet}     pet
 * @param {Date}    [departedAt]
 * @param {string}  [hostName]  ← 追加。合成スポットの場合のみ渡す
 * @returns {GeneratedEvent}
 */
export function generateEvent(spot, pet, departedAt = new Date(), hostName = '') { ... }
```

変更内容: ステップ5（`{petName}` 置換）の前に `{hostName}` を `hostName` で置換する処理を追加する。既存の呼び出し側への影響はない（デフォルト値 `''`）。

---

### 3.3 `src/store.js`（変更）

足跡レコードの読み書き関数を追加する。既存のキーと関数には手を加えない。

```javascript
// 追加するキー（KEYS オブジェクトに追加）
FOOTPRINTS_ALL: 'odekakepet::footprints::all',

// 追加する関数

/**
 * 足跡レコードの全件を読み込む。存在しない場合は空配列を返す。
 * @returns {FootprintRecord[]}
 */
export function loadFootprints() { ... }

/**
 * 足跡レコードを1件追記する。
 * @param {FootprintRecord} record
 */
export function appendFootprint(record) { ... }
```

**マイグレーション対応**: `SCHEMA_VERSION` を 3 に上げ、`migrate_v2_to_v3` を追加する。  
`v2 → v3`: `footprints::all` キーが存在しなければ空配列で初期化する。

---

### 3.4 `src/router.js`（変更）

```javascript
// SCREEN_IDS に追加
'screen-footprints',

// 追加する関数
export function goFootprints() { showScreen('screen-footprints'); }
```

---

### 3.5 `src/screens/home.js`（変更）

追加する処理:

1. `renderFootprintNotice(footprints)`: 直近3件を `footprint-notice-list` に描画。0件なら `footprint-notice` を `hidden`。
2. `issue-friend-code-btn` のクリックリスナー: `encodeFriendCode` でコードを生成し `friend-code-modal` を表示。
3. `copy-friend-code-btn` のクリックリスナー: `navigator.clipboard.writeText` を呼び出し、ボタンラベルを2秒間「コピーしました！」に変える。
4. `open-footprints-btn` のクリックリスナー: `goFootprints()` を呼ぶ。
5. `initHomeScreen` に `footprints` 引数を追加し `renderFootprintNotice` を呼ぶ。

---

### 3.6 `src/screens/odekake.js`（変更）

追加する処理:

1. `verify-friend-code-btn` のクリックリスナー:
   - `decodeFriendCode(input)` を呼ぶ
   - 失敗時: `friend-code-error` にエラー文を `textContent` で設定して表示
   - 成功時: `friend-code-preview-text` に「{petName} ちゃんのおうちを訪問します」を設定し `friend-code-preview` を表示
2. `depart-friend-btn` のクリックリスナー:
   - `buildSyntheticSpot(payload, friendEvents)` で合成スポットを組み立てる
   - `startVisit(syntheticSpot)` を呼んで待機画面へ遷移する
   - 訪問が友達訪問であることを示すフラグ `isFriendVisit: true` を Visit に付加して保存する（既存の Visit 型に追加フィールドとして許容）

追加するモジュール内関数（非 export）:

```javascript
// FriendCodePayload と friend-events.json から SyntheticSpot を組み立てる
function buildSyntheticSpot(payload, friendEvents) { ... }
```

---

### 3.7 `src/screens/homecoming.js`（変更）

追加する処理:

1. `initHomecomingScreen` の引数として `isFriendVisit` フラグを受け取る
2. `isFriendVisit === true` のとき `issue-footprint-code-btn` を表示する
3. `issue-footprint-code-btn` のクリックリスナー:
   - `encodeFootprintCode(...)` でコードを生成
   - `footprint-code-modal` を表示
4. `copy-footprint-code-btn` のクリックリスナー: コピー処理（home.js の「コピー」と同一ロジック）

---

### 3.8 `src/screens/footprints.js`（新規）

```javascript
/**
 * 足跡一覧画面を初期化する。
 * @param {FootprintRecord[]} footprints - 保存済み足跡レコード（visitedAt 降順で渡す）
 */
export function initFootprintsScreen(footprints) { ... }

// 内部関数（非export）:
// renderFootprintList(footprints): footprint-list を描画
// onRecordFootprint(): 足跡コード入力→検証→保存→リスト再描画
```

---

### 3.9 `src/main.js`（変更）

追加する処理:

1. `import { initFootprintsScreen } from './screens/footprints.js'`
2. `import { loadFootprints, appendFootprint } from './store.js'`
3. `import { ... } from './domain/odekake-code.js'`
4. `friend-events.json` を `spots.json` と同様に起動時に `fetch` で読み込む
5. `goFootprints()` ラッパーで `initFootprintsScreen(loadFootprints().sort(...))` を呼ぶ

---

## 4. コード生成と検証のフロー

### 4.1 おともだちコードのエンコードフロー

```
1. ペット情報を読み込む（loadPet()）
2. payload オブジェクトを構成する（v, petName, petType, curiosity, sociability, issuedAt）
3. canonicalStringify(payload) でチェックサム計算用文字列を生成
4. fnv1a32(str) でチェックサムを算出し payload.checksum に設定
5. JSON.stringify(payload) → toBase64url() → 'v1:' + b64
6. 文字数が CODE_MAX_LENGTH（500）以下であることを確認
7. コードを返す
```

### 4.2 おともだちコードのデコード・検証フロー

```
1. 'v1:' プレフィクスを確認 → 失敗: 'バージョンが合わないコードだよ'
2. Base64URL デコード → 失敗: '読み込めないコードだよ'
3. JSON.parse → 失敗: 'コードの形式が正しくないよ'
4. 必須フィールド存在確認 → 失敗: 'コードのデータが足りないよ'
5. チェックサム再計算・照合 → 失敗: 'コードが壊れているか改ざんされているよ'
6. 成功: payload オブジェクトを返す
```

### 4.3 足跡コードのエンコード/デコードフロー

FriendCode と同じ方式（プレフィクスは同一の `v1:`）。ペイロードのフィールド構成のみ異なる（§2.2 参照）。

---

## 5. 状態遷移への影響

M7 は既存の状態遷移マップを変更しない。友達訪問は `spotId` が合成スポット ID になるだけで、遷移は同一のパスを通る。

```
home
  ↓  createVisit(syntheticSpot.id) + transitionPetState(home→visiting)
visiting
  ↓  isReturnReady() = true → generateEvent(syntheticSpot, pet, ..., hostPet.name)
  ↓  completeVisit() + transitionPetState(visiting→returning) + transitionPetState(returning→home)
home（帰宅完了）
```

`isFriendVisit` フラグは Visit オブジェクトの追加フィールドとして保存するが、ドメインロジック（`visit.js`）には手を加えない。フラグの判定は Screen モジュール（`homecoming.js`）が行う。

---

## 6. ファイル別の責務まとめ

| ファイル | 責務 | 新規/変更 |
|---|---|---|
| `src/domain/odekake-code.js` | FriendCode / FootprintCode のエンコード・デコード・検証（純粋関数） | 新規 |
| `src/domain/event-generator.js` | `generateEvent` に `hostName` オプション引数を追加 | 変更 |
| `src/store.js` | `footprints::all` の読み書き追加、スキーマを v3 に更新 | 変更 |
| `src/router.js` | `screen-footprints` 追加、`goFootprints()` 追加 | 変更 |
| `src/screens/home.js` | 足跡通知表示・コード発行モーダル・コピー処理 | 変更 |
| `src/screens/odekake.js` | コード入力・検証プレビュー・合成スポット生成・友達訪問出発 | 変更 |
| `src/screens/homecoming.js` | 友達訪問フラグ判定・足跡コード発行モーダル | 変更 |
| `src/screens/footprints.js` | 足跡一覧・コード入力・記録処理 | 新規 |
| `src/main.js` | footprints 初期化・friend-events.json 読み込み | 変更 |
| `data/friend-events.json` | 友達訪問用汎用イベントテンプレート（最低5件） | 新規 |
| `index.html` | screen-footprints 追加、ホーム・おでかけ・帰宅各画面に要素追加 | 変更 |
| `styles/screens/footprints.css` | 足跡一覧画面のスタイル | 新規 |
| `styles/components.css` | `.modal`・`.code-textarea`・`.friend-code-preview` の共通スタイル | 変更 |
| `tests/odekake-code.test.js` | エンコード往復テスト・チェックサムテスト | 新規 |

---

## 7. テスト対象

| テストファイル | テスト内容 |
|---|---|
| `tests/odekake-code.test.js` | `fnv1a32`: 既知の入力値に対するチェックサムの一致確認 |
| | `canonicalStringify`: キーの順序不変性、`checksum` フィールド除外の確認 |
| | `encodeFriendCode → decodeFriendCode`: 全フィールドの往復一致（REQ-M7-NF-005） |
| | `encodeFootprintCode → decodeFootprintCode`: 全フィールドの往復一致（REQ-M7-NF-005） |
| | `decodeFriendCode`: プレフィクスなしコード → バージョンエラーを返すこと |
| | `decodeFriendCode`: Base64URL 破損コード → 形式エラーを返すこと |
| | `decodeFriendCode`: チェックサム改ざんコード → 改ざんエラーを返すこと |
| | `decodeFriendCode`: フィールド欠落コード → フィールド不足エラーを返すこと |
| | `encodeFriendCode`: 生成コードが 500 文字以内であること |
