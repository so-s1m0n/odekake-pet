# 設計 — おでかけとイベント

対象スペック: M3（おでかけ状態遷移）・M4（イベント生成）・M5（帰宅処理と絵日記データ保存）  
対応要件: REQ-M3-001 〜 REQ-M5-006、REQ-NF-001 〜 REQ-NF-004

---

## 1. 画面構成

### 1.1 画面一覧

| 画面ID | 名称 | 対応ファイル | 表示条件 |
|---|---|---|---|
| `screen-odekake` | おでかけ選択画面 | `src/screens/odekake.js` | ペットが `home` 状態のとき `goOdekake()` を呼ぶ |
| `screen-waiting` | 待機画面（旅の途中メモ） | `src/screens/waiting.js` | ペットが `visiting` 状態のとき |
| `screen-homecoming` | 帰宅画面 | `src/screens/homecoming.js` | 帰宅処理完了直後 |

既存の `screen-setup` / `screen-home` は M1/M2 スペックで定義済み。  
router.js の `SCREEN_IDS` リストと index.html の `<section>` に3画面を追加する。

---

### 1.2 おでかけ選択画面（`screen-odekake`）

```
┌─────────────────────────────────┐
│  ← ホームへ        おでかけ       │  ← ヘッダー（戻るボタン＋タイトル）
│                                 │
│  どこにいく？                    │
│                                 │
│  ┌───────────────────────────┐  │
│  │  ★ 月夜の小屋               │  │  ← スポットカード（radio的なUI）
│  │  星のかけらが集まる不思議な工房│  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  🌿 森の標本室             │  │
│  │  静かな森の中の記録の部屋   │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  🕰 時計塔キッチン          │  │
│  │  時計塔の最上階にある食堂   │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌────────────────────────────┐ │
│  │       おでかけ！ ✈         │ │  ← 出発ボタン（スポット未選択で disabled）
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

**DOM構造（主要要素）**

```html
<section id="screen-odekake" class="screen" hidden>
  <header class="screen__header">
    <button id="odekake-back-btn" class="screen__back-btn">← ホームへ</button>
    <h1 class="screen__title">おでかけ</h1>
  </header>
  <main class="screen__body">
    <p class="odekake__lead">どこにいく？</p>
    <div id="spot-list" class="spot-list" role="radiogroup" aria-label="おでかけ先の選択">
      <!-- spots.json をもとに JS で生成 -->
    </div>
    <button id="depart-btn" class="btn btn--primary" disabled aria-disabled="true">
      おでかけ！ ✈
    </button>
  </main>
</section>
```

**インタラクション仕様**

- スポットカードをクリック: `is-selected` クラスを付与し出発ボタンを活性化。再クリックで選択解除
- 出発ボタンクリック: `startVisit(spotId)` を呼び出し → screen-waiting へ遷移
- 戻るボタン: ホーム画面へ戻る

---

### 1.3 待機画面（`screen-waiting`）

```
┌─────────────────────────────────┐
│           旅の途中               │
│                                 │
│   ┌──────────────────────┐      │
│   │  ✦ いまごろ何してるかな │      │  ← 途中メモ（ランダムメッセージ）
│   └──────────────────────┘      │
│                                 │
│   ○○ちゃんは                    │
│   ★月夜の小屋 を訪問中...          │
│                                 │
│   出発から: 01:23                │  ← 経過時間（MM:SS）
│   帰宅予定: あと 08:37           │  ← 残り時間
│                                 │
│   ┌────────────────────────┐    │
│   │    帰宅チェック 🔔       │    │  ← 帰宅可能になったら帰宅処理を実行
│   └────────────────────────┘    │
└─────────────────────────────────┘
```

**DOM構造（主要要素）**

```html
<section id="screen-waiting" class="screen" hidden>
  <header class="screen__header">
    <h1 class="screen__title">旅の途中</h1>
  </header>
  <main class="screen__body">
    <div class="waiting-memo">
      <p id="waiting-memo-text" class="waiting-memo__text"></p>
    </div>
    <p id="waiting-spot-name" class="waiting__spot-name"></p>
    <div class="waiting-timer">
      <p>出発から: <span id="elapsed-time">00:00</span></p>
      <p id="remaining-time-label">帰宅予定: あと <span id="remaining-time">--:--</span></p>
    </div>
    <p id="return-ready-msg" class="return-ready-msg" hidden>
      🎉 おかえり！帰宅チェックを押してね
    </p>
    <button id="check-return-btn" class="btn btn--secondary">
      帰宅チェック 🔔
    </button>
  </main>
</section>
```

**インタラクション仕様**

- 画面表示時に1秒インターバルタイマーを起動し、経過時間・残り時間を更新する
- 残り時間が0になると `return-ready-msg` を表示し、「帰宅チェック」ボタンのラベルが変化する
- 「帰宅チェック」ボタン: `checkReturn()` を呼び出す
  - 帰宅可能 → 帰宅処理実行 → screen-homecoming へ遷移
  - 帰宅不可 → 「まだおでかけ中だよ」を一時表示

---

### 1.4 帰宅画面（`screen-homecoming`）

```
┌─────────────────────────────────┐
│           おかえり！              │
│                                 │
│   ┌──────────────────────┐      │
│   │   [ペットのイラスト]    │      │
│   └──────────────────────┘      │
│      ○○ちゃん が帰ってきたよ      │
│                                 │
│   ──── 今日の出来事 ────          │
│   ✦ 月夜の小屋で...                │
│   工房の棚の隙間に星のかけらを     │
│   みつけた。きらきらしていた。     │
│                                 │
│   おみやげ: ⭐ 星のかけら         │  ← おみやげがある場合のみ表示
│                                 │
│   ┌────────────────────────┐    │
│   │     絵日記をつくる 📖    │    │  ← M6実装まではスタブ
│   └────────────────────────┘    │
│   ┌────────────────────────┐    │
│   │       おうちへ 🏠        │    │  ← Visitを保存してホームへ
│   └────────────────────────┘    │
└─────────────────────────────────┘
```

**DOM構造（主要要素）**

```html
<section id="screen-homecoming" class="screen" hidden>
  <header class="screen__header">
    <h1 class="screen__title">おかえり！</h1>
  </header>
  <main class="screen__body">
    <div id="homecoming-sprite" class="homecoming-sprite"></div>
    <p id="homecoming-pet-name" class="homecoming__pet-name"></p>
    <section class="homecoming-event">
      <h2 class="homecoming-event__title">今日の出来事</h2>
      <p id="homecoming-spot-name" class="homecoming-event__spot"></p>
      <p id="homecoming-event-text" class="homecoming-event__text"></p>
    </section>
    <div id="homecoming-souvenir" class="homecoming-souvenir" hidden>
      <p class="homecoming-souvenir__label">おみやげ</p>
      <p id="homecoming-souvenir-name" class="homecoming-souvenir__name"></p>
    </div>
    <button id="make-card-btn" class="btn btn--secondary">絵日記をつくる 📖</button>
    <button id="go-home-btn" class="btn btn--primary">おうちへ 🏠</button>
  </main>
</section>
```

---

## 2. データモデル

### 2.1 Visit エンティティ

```javascript
/**
 * @typedef {Object} Visit
 * @property {string}  id          - 一意ID（`visit-${Date.now()}`形式）
 * @property {string}  spotId      - 訪問先スポットID
 * @property {string}  departedAt  - 出発日時（ISO 8601）
 * @property {number}  durationMs  - 不在期間（ミリ秒）
 * @property {'ongoing'|'completed'} status - 訪問状態
 * @property {string|null}  eventId    - 選択されたイベントテンプレートID
 * @property {string|null}  souvenirId - 付与されたおみやげID
 * @property {CardData|null} cardData  - 絵日記データ（帰宅時に設定）
 */

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

### 2.2 Spot 定義（data/spots.json）

```javascript
/**
 * @typedef {Object} SpotDef
 * @property {string}          id          - スポットID（例: 'hoshikuzu-kobo'）
 * @property {string}          displayName - 表示名（例: '月夜の小屋'）
 * @property {string}          description - 短い説明文
 * @property {string}          themeColor  - テーマカラー（CSSカスタムプロパティ用 hex）
 * @property {string}          icon        - 絵文字アイコン
 * @property {EventTemplate[]} events      - イベントテンプレートの配列（最低5件）
 */

/**
 * @typedef {Object} EventTemplate
 * @property {string}      id         - テンプレートID（例: 'kobo-001'）
 * @property {string}      text       - イベント本文（{petName} プレースホルダー含む）
 * @property {string|null} souvenirId - 付随おみやげID
 * @property {EventConditions|null} conditions - 選択条件（省略可）
 */

/**
 * @typedef {Object} EventConditions
 * @property {number[]|null} curiosity    - 適合する好奇心値の配列（例: [1,2]）
 * @property {number[]|null} sociability  - 適合する社交性値の配列
 * @property {string[]|null} timeOfDay   - 適合する時間帯（'morning'|'afternoon'|'evening'|'night'）
 */
```

### 2.3 Souvenir

```javascript
/**
 * @typedef {Object} Souvenir
 * @property {string} id          - おみやげID（例: 'kobo-hoshi-kakera'）
 * @property {string} displayName - 表示名
 * @property {string} icon        - 絵文字アイコン（素材ファイルが未実装の間の代替）
 * @property {string} spotId      - 由来するスポットID
 */
```

### 2.4 localStorage の保存形式

```javascript
// 進行中の Visit（1件のみ存在。帰宅時に visits::all へ移動する）
// キー: 'odekakepet::visit::current'
{
  "id": "visit-1730367200000",
  "spotId": "hoshikuzu-kobo",
  "departedAt": "2026-11-01T10:00:00+09:00",
  "durationMs": 300000,
  "status": "ongoing",
  "eventId": null,
  "souvenirId": null,
  "cardData": null
}

// 完了した Visit の履歴（配列）
// キー: 'odekakepet::visits::all'
[
  {
    "id": "visit-1730367200000",
    "spotId": "hoshikuzu-kobo",
    "departedAt": "2026-11-01T10:00:00+09:00",
    "durationMs": 300000,
    "status": "completed",
    "eventId": "kobo-002",
    "souvenirId": "kobo-hoshi-kakera",
    "cardData": { ... }
  }
]
```

---

## 3. モジュール設計

### 3.1 `src/domain/visit.js`（新規）

ドメインロジックの純粋関数群。DOM・localStorage に依存しない。

```javascript
/** 不在期間（ミリ秒）。デモ用に短縮するにはこの値を変更する */
export const VISIT_DURATION_MS = 5 * 60 * 1000;  // 本番: 5分

/**
 * 新規 Visit を作成する
 * @param {string} spotId
 * @returns {Visit}
 */
export function createVisit(spotId) { ... }

/**
 * 帰宅可能かどうかを判定する
 * @param {Visit} visit
 * @param {number} [now] - テスト用に現在時刻を注入できる（省略時は Date.now()）
 * @returns {boolean}
 */
export function isReturnReady(visit, now = Date.now()) { ... }

/**
 * Visit に帰宅データを付加して完了状態にする
 * @param {Visit} visit
 * @param {string} eventId
 * @param {string|null} souvenirId
 * @param {CardData} cardData
 * @returns {Visit}
 */
export function completeVisit(visit, eventId, souvenirId, cardData) { ... }

/**
 * 出発からの経過時間と残り時間をミリ秒で返す
 * @param {Visit} visit
 * @param {number} [now]
 * @returns {{ elapsedMs: number, remainingMs: number }}
 */
export function getVisitTiming(visit, now = Date.now()) { ... }
```

### 3.2 `src/domain/event-generator.js`（新規）

```javascript
/**
 * スポットデータとペット情報からイベントを生成する
 * @param {SpotDef} spot       - spots.json の1スポット分
 * @param {Pet}     pet        - ペットオブジェクト
 * @param {Date}    [departedAt] - 出発日時（省略時は現在時刻）
 * @returns {{ eventId: string, eventText: string, souvenirId: string|null }}
 */
export function generateEvent(spot, pet, departedAt = new Date()) { ... }

/**
 * Date から時間帯文字列を返す
 * @param {Date} date
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
export function getTimeOfDay(date) { ... }
```

### 3.3 `src/store.js`（拡張）

既存の Pet 操作に加え、以下を追加する。

```javascript
// 追加するキー
const KEYS = {
  PET:             'odekakepet::pet::current',
  VISIT_CURRENT:   'odekakepet::visit::current',   // 新規
  VISITS_ALL:      'odekakepet::visits::all',       // 新規
  SCHEMA_VERSION:  'odekakepet::settings::version',
};

// 追加する関数
export function loadCurrentVisit() { ... }   // Visit | null
export function saveCurrentVisit(v) { ... }  // void
export function clearCurrentVisit() { ... }  // void
export function loadVisitsAll() { ... }      // Visit[]
export function appendVisit(v) { ... }       // void（visits::all に追記）
```

### 3.4 `src/router.js`（拡張）

`SCREEN_IDS` に3画面を追加し、スタブを本実装に置き換える。

```javascript
const SCREEN_IDS = [
  'screen-setup',
  'screen-home',
  'screen-odekake',    // 追加
  'screen-waiting',    // 追加
  'screen-homecoming', // 追加
];

export function goOdekake() { showScreen('screen-odekake'); }
export function goWaiting() { showScreen('screen-waiting'); }
export function goHomecoming() { showScreen('screen-homecoming'); }
// goHome / goSetup は既存のまま
```

### 3.5 `src/screens/odekake.js`（新規）

```javascript
/**
 * おでかけ選択画面を初期化する（画面遷移ごとに呼ぶ）
 * @param {SpotDef[]} spots - spots.json から読み込んだスポット定義の配列
 */
export function initOdekakeScreen(spots) { ... }
// 内部: renderSpotList, onSpotSelect, onDepart
```

### 3.6 `src/screens/waiting.js`（新規）

```javascript
/**
 * 待機画面を初期化しタイマーを起動する
 * @param {Visit}     visit  - 進行中の Visit
 * @param {SpotDef[]} spots  - スポット定義（スポット名の表示に使う）
 */
export function initWaitingScreen(visit, spots) { ... }
// 内部: startTimer, stopTimer, checkReturn, updateTimerDisplay
```

### 3.7 `src/screens/homecoming.js`（新規）

```javascript
/**
 * 帰宅画面を表示する
 * @param {Visit}     visit  - 完了済みの Visit（cardData が設定済み）
 * @param {SpotDef[]} spots
 */
export function initHomecomingScreen(visit, spots) { ... }
// 内部: renderEventResult, onMakeCard（スタブ）, onGoHome
```

### 3.8 `src/screens/home.js`（変更）

- `renderOdekakeStatus`: `visiting` 状態のとき「旅の途中を見る」ボタンを表示し、クリックで `goWaiting()` へ遷移する処理を追加する
- `initHomeScreen`: 完了した Visit の件数を「おもいで」数として表示する

### 3.9 `src/main.js`（変更）

`bootstrap` 関数に以下を追加する。

```javascript
// 1. spots.json の読み込み
// 2. 新画面の初期化（initOdekakeScreen, initWaitingScreen, initHomecomingScreen）
// 3. 帰宅チェック: 起動時に進行中の Visit があれば isReturnReady を確認し
//    帰宅可能なら即時帰宅処理 → screen-homecoming へ遷移
// 4. 起動時の画面振り分けに 'visiting' 状態のペット → screen-waiting を追加
```

---

## 4. 状態遷移図

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [起動]                                                     │
│    │                                                        │
│    ├─ hasPet=false ──────────────────▶ screen-setup        │
│    │                                                        │
│    └─ hasPet=true                                          │
│         │                                                   │
│         ├─ state='home' ────────────▶ screen-home          │
│         │                                 │                 │
│         │                           おでかけへボタン         │
│         │                                 │                 │
│         │                                 ▼                 │
│         │                        screen-odekake             │
│         │                     スポット選択 + 出発ボタン       │
│         │                                 │                 │
│         │              createVisit()      │                 │
│         │              pet: home→visiting │                 │
│         │                                 ▼                 │
│         ├─ state='visiting' ──────▶ screen-waiting         │
│         │                       タイマー表示 + 帰宅チェック   │
│         │                                 │                 │
│         │              isReturnReady=true │                 │
│         │              generateEvent()    │                 │
│         │              pet: visiting→returning→home         │
│         │              completeVisit()    │                 │
│         │                                 ▼                 │
│         └──────────────────────▶ screen-homecoming         │
│                                  出来事 + おみやげ表示       │
│                                  「おうちへ」ボタン          │
│                                         │                   │
│                              appendVisit() + goHome()      │
│                                         │                   │
│                                         ▼                   │
│                                  screen-home               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. ファイル別の責務まとめ

| ファイル | 責務 | 新規/変更 |
|---|---|---|
| `src/domain/visit.js` | Visitエンティティの生成・タイミング計算・完了処理（純粋関数） | 新規 |
| `src/domain/event-generator.js` | イベントテンプレート選択・文章生成（純粋関数） | 新規 |
| `src/store.js` | Visit（進行中・履歴）のlocalStorage読み書き | 拡張 |
| `src/router.js` | screen-odekake / waiting / homecoming の遷移関数 | 拡張 |
| `src/screens/odekake.js` | スポット選択UI・出発処理 | 新規 |
| `src/screens/waiting.js` | タイマー表示・帰宅チェック | 新規 |
| `src/screens/homecoming.js` | 帰宅結果表示・絵日記への接続点 | 新規 |
| `src/screens/home.js` | 「旅の途中を見る」ボタン追加・おもいで数表示 | 変更 |
| `src/main.js` | spots.json読み込み・新画面初期化・起動時帰宅チェック | 変更 |
| `data/spots.json` | スポット定義とイベントテンプレート | 新規 |
| `index.html` | 3画面分のHTML追加 | 変更 |
| `styles/screens/odekake.css` | おでかけ選択画面のスタイル | 新規 |
| `styles/screens/waiting.css` | 待機画面のスタイル | 新規 |
| `styles/screens/homecoming.css` | 帰宅画面のスタイル | 新規 |

---

## 6. テスト対象

| テストファイル | テスト内容 |
|---|---|
| `tests/visit.test.js` | `createVisit`: フィールドの初期値確認 |
| | `isReturnReady`: 時刻注入を使った境界値テスト（未満/以上） |
| | `completeVisit`: status が 'completed' になること |
| | `getVisitTiming`: 経過時間・残り時間の計算正確性 |
| `tests/event-generator.test.js` | `getTimeOfDay`: 時刻→時間帯の変換確認 |
| | `generateEvent`: 条件一致するテンプレートが選ばれること |
| | `generateEvent`: 条件なしフォールバックの動作確認 |
| | `generateEvent`: `{petName}` が正しく置換されること |
