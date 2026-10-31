# 設計 — ペット登録とホーム画面

対象スペック: M1（ペット登録）、M2（ホーム画面）  
対応要件: REQ-001 〜 REQ-024

---

## 1. 画面構成

### 1.1 画面一覧

| 画面ID | 名称 | 対応ファイル | 表示条件 |
|---|---|---|---|
| `screen-setup` | ペット登録画面 | `src/screens/setup.js` | localStorageにペットデータがない（初回起動時） |
| `screen-home` | ホーム画面 | `src/screens/home.js` | ペットデータが存在する |

このスペックで扱う画面は2つ。両画面は `index.html` 内で `<section>` として共存し、JSで表示・非表示を切り替える（画面遷移はDOMの `hidden` 属性で制御する）。

---

### 1.2 ペット登録画面（`screen-setup`）

```
┌─────────────────────────────────┐
│  おでかけペット                   │
│  ペットをえらんでね               │
│                                 │
│  ┌────┐  ┌────┐  ┌────┐        │
│  │うさぎ│  │ペンギン│  │しば  │        │
│  │[○]│  │    │  │    │        │  ← プリセット選択カード
│  └────┘  └────┘  └────┘        │
│                                 │
│  ┌──────────────────┐           │
│  │ [ペットのイラスト大] │           │  ← 選択中のプレビュー
│  └──────────────────┘           │
│                                 │
│  なまえをつけてね                 │
│  ┌────────────────────┐         │
│  │                    │ (0/12)  │  ← 名前入力フィールド
│  └────────────────────┘         │
│                                 │
│  ┌────────────────────┐         │
│  │  このこにする（決定）  │         │  ← 確定ボタン（名前空白時はdisabled）
│  └────────────────────┘         │
└─────────────────────────────────┘
```

**DOM構造（主要要素）**

```html
<section id="screen-setup" class="screen">
  <h1 class="screen__title">ペットをえらんでね</h1>

  <ul class="preset-list" role="radiogroup" aria-label="ペットの種類">
    <li class="preset-card js-preset-card" data-pet-type="hoshikuzu-usagi">
      <img src="assets/pets/hoshikuzu-usagi/idle.png" alt="ほしくずうさぎ">
      <span class="preset-card__name">ほしくずうさぎ</span>
    </li>
    <!-- 他2種 -->
  </ul>

  <figure class="setup-preview">
    <img id="setup-preview-img" src="" alt="">
  </figure>

  <label class="name-input-label" for="pet-name-input">なまえをつけてね</label>
  <input id="pet-name-input" type="text" maxlength="12" autocomplete="off">
  <span id="pet-name-count" aria-live="polite">0/12</span>

  <button id="setup-confirm-btn" disabled>このこにする</button>
</section>
```

**インタラクション仕様**

- プリセットカードをクリック: 選択状態（`is-selected` クラス）を切り替え、プレビュー画像を更新
- 名前入力: 文字数カウンタをリアルタイム更新。1文字以上かつペット選択済みで確定ボタンを活性化
- 確定ボタンクリック: `setup.js` の `confirmSetup()` を呼び出す

---

### 1.3 ホーム画面（`screen-home`）

```
┌─────────────────────────────────┐
│  ♥♥♥♥♥♥♥♥♥♡♡ なかよし度 72    │  ← なかよし度バー
│                                 │
│  ┌──────────────────────────┐   │
│  │                          │   │
│  │      [ペットのイラスト]    │   │  ← ペットの部屋（メイン表示）
│  │                          │   │
│  └──────────────────────────┘   │
│          ○○ちゃん               │  ← ペット名
│                                 │
│  ┌───────┐ ┌───────┐ ┌───────┐  │
│  │餌をあげる│ │なでる  │ │声をかける│  │  ← 世話アクションボタン
│  └───────┘ └───────┘ └───────┘  │
│                                 │
│  おもいで: 3こ                   │  ← おもいで数
│                                 │
│  ┌────────────────────────────┐ │
│  │       おでかけへ ▶         │ │  ← おでかけボタン
│  └────────────────────────────┘ │
│                                 │
│  [アルバムを見る]                 │  ← アルバムへのリンク
└─────────────────────────────────┘
```

**DOM構造（主要要素）**

```html
<section id="screen-home" class="screen" hidden>
  <div class="affinity-bar">
    <span class="affinity-bar__label">なかよし度</span>
    <progress id="affinity-progress" max="99" value="0"></progress>
    <span id="affinity-value">0</span>
  </div>

  <div class="pet-room">
    <img id="pet-sprite" src="" alt="" class="pet-sprite">
    <p id="pet-name-display" class="pet-name"></p>
  </div>

  <div class="care-actions" id="care-actions">
    <button class="care-btn js-care-btn" data-action="eat">餌をあげる</button>
    <button class="care-btn js-care-btn" data-action="stroke">なでる</button>
    <button class="care-btn js-care-btn" data-action="speak">声をかける</button>
  </div>

  <p class="memory-count">おもいで: <span id="memory-count">0</span>こ</p>

  <button id="odekake-btn" class="odekake-btn">おでかけへ</button>

  <a href="#" id="album-link" class="album-link">アルバムを見る</a>
</section>
```

**おでかけ中の状態**

```html
<!-- state === 'visiting' のとき -->
<div class="pet-room is-away">
  <img src="assets/pets/{type}/away.png" alt="おでかけ中">
  <p class="away-message">○○ちゃんは おでかけ中...</p>
</div>
<!-- 世話ボタン: disabled -->
<!-- おでかけボタン: disabled（または非表示） -->
```

---

## 2. データモデル

### 2.1 Petエンティティ

```javascript
/**
 * @typedef {Object} Pet
 * @property {string} id          - 固定値 'current'（MVP では1匹のみ）
 * @property {string} type        - ペット種類ID ('hoshikuzu-usagi' | 'soraaru-penguin' | 'mameshiba')
 * @property {string} name        - ユーザーが付けた名前（1〜12文字）
 * @property {PetPersonality} personality - 性格パラメータ（イベント分岐用の隠し値）
 * @property {number} affinity    - なかよし度（0〜99）
 * @property {PetState} state     - 現在の状態
 * @property {string} createdAt   - 登録日時（ISO 8601）
 */

/**
 * @typedef {'home' | 'visiting' | 'returning'} PetState
 */

/**
 * @typedef {Object} PetPersonality
 * @property {number} curiosity   - 好奇心（0〜2）: イベント分岐の冒険度合いに影響
 * @property {number} sociability - 社交性（0〜2）: 訪問先でのホストとの交流度に影響
 */
```

**初期値の生成**

性格パラメータはペット種類に応じてランダム生成する（ユーザーには非表示）。種類ごとの重み付けは `data/pets.json` で管理する。

```javascript
// 例: ほしくずうさぎは好奇心が高め
{
  "hoshikuzu-usagi": {
    "curiosity": [0.2, 0.3, 0.5],   // 0: 20%, 1: 30%, 2: 50%
    "sociability": [0.4, 0.4, 0.2]
  }
}
```

### 2.2 localStorageの保存形式

```javascript
// キー: 'odekakepet::pet::current'
{
  "schemaVersion": 1,
  "id": "current",
  "type": "hoshikuzu-usagi",
  "name": "ルナ",
  "personality": { "curiosity": 2, "sociability": 1 },
  "affinity": 15,
  "state": "home",
  "createdAt": "2026-11-04T10:00:00+09:00"
}
```

---

## 3. モジュール設計

### 3.1 `src/domain/pet.js`

ドメインロジックの純粋関数群。DOMや `localStorage` に依存しない。

```javascript
export const PET_STATE = {
  HOME: 'home',
  VISITING: 'visiting',
  RETURNING: 'returning',
};

export const PET_TYPES = ['hoshikuzu-usagi', 'soraaru-penguin', 'mameshiba'];

/**
 * 新規ペットを作成する
 * @param {string} type
 * @param {string} name
 * @returns {Pet}
 */
export function createPet(type, name) { ... }

/**
 * 世話アクションを適用し、新しいPetオブジェクトを返す
 * @param {Pet} pet
 * @param {'eat'|'stroke'|'speak'} action
 * @returns {Pet}  なかよし度を+1した新しいPet
 */
export function applyCareAction(pet, action) { ... }

/**
 * ペットの状態を遷移させる
 * @param {Pet} pet
 * @param {PetState} nextState
 * @returns {Pet}
 * @throws {Error} 不正な遷移（home→returning等）の場合
 */
export function transitionPetState(pet, nextState) { ... }
```

### 3.2 `src/store.js`

localStorageの読み書きを一元管理する。他のモジュールはlocalStorageに直接アクセスしない。

```javascript
const KEYS = {
  PET: 'odekakepet::pet::current',
  SCHEMA_VERSION: 'odekakepet::settings::version',
};

export function loadPet() { ... }      // Pet | null
export function savePet(pet) { ... }   // void
export function hasPet() { ... }       // boolean
```

### 3.3 `src/screens/setup.js`

ペット登録画面のUIロジック。

```javascript
export function initSetupScreen() { ... }   // イベントハンドラの登録
function onPresetSelect(type) { ... }        // プリセット選択時の処理
function onNameInput(value) { ... }          // 名前入力時の処理
function confirmSetup() { ... }              // 確定: createPet → savePet → router.goHome()
```

### 3.4 `src/screens/home.js`

ホーム画面のUIロジック。

```javascript
export function initHomeScreen() { ... }    // 画面初期化。loadPet→描画
function renderPet(pet) { ... }             // ペットのイラスト・名前・なかよし度を描画
function renderCareActions(pet) { ... }     // 状態に応じてボタンの活性/非活性を設定
function onCareAction(action) { ... }       // 世話アクション: applyCareAction → savePet → renderPet
function playCareAnimation(action) { ... }  // リアクションイラストを2秒表示してidleに戻す
```

---

## 4. 状態遷移図

```
┌─────────────────────────────────────────────────────────┐
│ このスペックの範囲                                         │
│                                                         │
│   [初回起動]                                             │
│       │                                                 │
│       ▼                                                 │
│  ┌──────────┐  確定ボタン   ┌──────────────────────┐    │
│  │ setup    │ ──────────▶ │ home (state='home')  │    │
│  │ (登録画面)│              │                      │◀─┐ │
│  └──────────┘              │  世話アクション        │  │ │
│                            │  └─ なかよし度+1      │  │ │
│                            │     イラスト2秒表示   │  │ │
│                            └──────────────────────┘  │ │
│                                       │               │ │
│                                  おでかけへボタン       │ │
│                                       │               │ │
│                                       ▼               │ │
│                              [M3スペックへ渡す]         │ │
│                              (state='visiting')        │ │
│                              ....                      │ │
│                              (state='returning')       │ │
│                                       │               │ │
│                                   帰宅完了 ────────────┘ │
└─────────────────────────────────────────────────────────┘
```

このスペックで管理する状態遷移は「登録→在宅」と「在宅での世話アクション」のみ。`visiting` / `returning` への遷移は `odekake-and-event` スペックで定義する。

---

## 5. ファイル別の責務まとめ

| ファイル | 責務 |
|---|---|
| `src/domain/pet.js` | Petエンティティの生成・状態遷移・世話ロジック（純粋関数） |
| `src/store.js` | localStorageの読み書き（Pet以外のエンティティも今後ここへ追加） |
| `src/screens/setup.js` | ペット登録画面のUI制御 |
| `src/screens/home.js` | ホーム画面のUI制御・アニメーション |
| `src/router.js` | 画面の表示切り替え（`hidden`属性の操作） |
| `src/main.js` | 起動時の分岐（ペットあり→home、なし→setup）、各画面の初期化 |

---

## 6. テスト対象

| テストファイル | テスト内容 |
|---|---|
| `tests/pet.test.js` | `createPet`: バリデーション（名前の長さ等） |
| | `applyCareAction`: なかよし度の加算、上限（99）の確認 |
| | `transitionPetState`: 正常遷移（home→visiting）の確認 |
| | `transitionPetState`: 不正遷移（home→returning）でエラーになることの確認 |
