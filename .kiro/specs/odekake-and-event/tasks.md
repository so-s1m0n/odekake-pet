# 実装タスク — おでかけとイベント

対象スペック: M3（おでかけ状態遷移）・M4（イベント生成）・M5（帰宅処理）  
作成日: 2026-10-31

タスクは依存関係が少ないものから順に並べてある。  
各タスクには対応する要件ID と設計セクション番号を記載する。

---

## フェーズ1 — 静的データ

### TASK-01 `data/spots.json` の作成
- 対応要件: REQ-M4-001、REQ-M4-005
- 対応設計: 設計書 2.2節
- 内容:
  - スポット3件（月夜の小屋・森の標本室・時計塔キッチン）を定義する
  - 各スポットにイベントテンプレート5〜7件を記述する（`{petName}` プレースホルダー必須）
  - おみやげ定義（id・displayName・icon・spotId）を各スポット1種記述する
  - `conditions` フィールドを最低2件に付与して分岐が動作することを確認できるようにする

---

## フェーズ2 — ドメインロジック（純粋関数）

### TASK-02 `src/domain/visit.js` の実装
- 対応要件: REQ-M3-004、REQ-M3-005、REQ-M3-007、REQ-M3-008、REQ-NF-001
- 対応設計: 設計書 3.1節
- 実装する関数:
  - `VISIT_DURATION_MS` 定数（デモ用: 60秒、コメントで本番値を明記）
  - `createVisit(spotId) → Visit`
  - `isReturnReady(visit, now?) → boolean`
  - `completeVisit(visit, eventId, souvenirId, cardData) → Visit`
  - `getVisitTiming(visit, now?) → { elapsedMs, remainingMs }`
- 制約: DOM・localStorage に依存しない純粋関数のみ

### TASK-03 `src/domain/event-generator.js` の実装
- 対応要件: REQ-M4-002、REQ-M4-003、REQ-NF-001
- 対応設計: 設計書 3.2節
- 実装する関数:
  - `getTimeOfDay(date) → 'morning'|'afternoon'|'evening'|'night'`
  - `generateEvent(spot, pet, departedAt?) → { eventId, eventText, souvenirId }`
    - conditions によるフィルタリング（curiosity・sociability・timeOfDay）
    - フィルタ後0件なら条件なしテンプレートにフォールバック
    - フォールバックも0件なら先頭テンプレートを使う（防御的実装）
    - `{petName}` の置換
- 制約: DOM・localStorage に依存しない純粋関数のみ

---

## フェーズ3 — ストアとルーター拡張

### TASK-04 `src/store.js` の拡張
- 対応要件: REQ-M3-004、REQ-M5-006
- 対応設計: 設計書 3.3節
- 追加する定数:
  - `KEYS.VISIT_CURRENT`、`KEYS.VISITS_ALL`
- 追加する関数:
  - `loadCurrentVisit() → Visit | null`
  - `saveCurrentVisit(visit) → void`
  - `clearCurrentVisit() → void`
  - `loadVisitsAll() → Visit[]`
  - `appendVisit(visit) → void`
- SCHEMA_VERSION を 2 に上げてマイグレーション関数（`migrate_v1_to_v2`）を追加する
  - v1→v2: 新キーが存在しなければ空配列を初期化するだけの軽微な移行

### TASK-05 `src/router.js` の拡張
- 対応要件: REQ-M3-003、REQ-M3-009、REQ-M5-004
- 対応設計: 設計書 3.4節
- `SCREEN_IDS` に `'screen-odekake'`・`'screen-waiting'`・`'screen-homecoming'` を追加
- `goOdekake()` スタブを本実装（`showScreen('screen-odekake')`）に置き換える
- `goWaiting()`・`goHomecoming()` を追加する

---

## フェーズ4 — HTML と CSS

### TASK-06 `index.html` への画面追加
- 対応設計: 設計書 1.2〜1.4節
- 追加する `<section>`:
  - `screen-odekake`（スポット選択画面）
  - `screen-waiting`（待機画面）
  - `screen-homecoming`（帰宅画面）
- `<link rel="stylesheet">` を3画面分追加する

### TASK-07 CSS の追加
- 追加するファイル:
  - `styles/screens/odekake.css`（スポットカードの選択スタイル）
  - `styles/screens/waiting.css`（タイマー表示）
  - `styles/screens/homecoming.css`（イベント文・おみやげ表示）

---

## フェーズ5 — 画面モジュール

### TASK-08 `src/screens/odekake.js` の実装
- 対応要件: REQ-M3-001〜REQ-M3-003
- 対応設計: 設計書 1.2節、3.5節
- 実装する関数:
  - `initOdekakeScreen(spots)`
  - 内部: `renderSpotList(spots)`, `onSpotSelect(spotId)`, `onDepart()`
  - `onDepart` の中で:
    1. `createVisit(selectedSpotId)` を呼ぶ
    2. `saveCurrentVisit(visit)` を呼ぶ
    3. `transitionPetState(pet, 'visiting')` → `savePet(updatedPet)` を呼ぶ
    4. `goWaiting()` を呼ぶ

### TASK-09 `src/screens/waiting.js` の実装
- 対応要件: REQ-M3-006〜REQ-M3-009
- 対応設計: 設計書 1.3節、3.6節
- 実装する関数:
  - `initWaitingScreen(visit, spots)`
  - `stopWaitingTimer()`（外部から呼び出し可能にする。帰宅画面遷移時に停止）
  - 内部: `startTimer()`, `updateTimerDisplay()`, `checkReturn()`, `executeReturn(visit, spots)`
  - `executeReturn` の中で:
    1. `transitionPetState(pet, 'returning')` → `transitionPetState(pet, 'home')` の順に実行
    2. `generateEvent(spot, pet, departedAt)` を呼ぶ
    3. `completeVisit(visit, ...)` を呼ぶ
    4. `saveCurrentVisit(completedVisit)` を呼ぶ
    5. `savePet(updatedPet)` を呼ぶ
    6. `goHomecoming()` を呼ぶ（待機中タイマーを停止してから）

### TASK-10 `src/screens/homecoming.js` の実装
- 対応要件: REQ-M5-001〜REQ-M5-004
- 対応設計: 設計書 1.4節、3.7節
- 実装する関数:
  - `initHomecomingScreen(visit, spots)`
  - 内部: `renderEventResult(visit, spots)`, `onMakeCard()`（スタブ）, `onGoHome()`
  - `onGoHome` の中で:
    1. `appendVisit(completedVisit)` を呼ぶ
    2. `clearCurrentVisit()` を呼ぶ
    3. `goHome()` を呼ぶ

---

## フェーズ6 — 既存ファイルの更新

### TASK-11 `src/screens/home.js` の更新
- 対応要件: REQ-M3-006、REQ-M5-005
- 対応設計: 設計書 3.8節
- 変更内容:
  - `renderOdekakeStatus`: `visiting` 状態のとき「旅の途中を見る」ボタンを表示し、`goWaiting()` へ遷移
  - `initHomeScreen`: `loadVisitsAll().length` をおもいで数として表示
  - `index.html` の `#pet-name-display` と `#away-message` の二重定義確認（既存コードで使用中）

### TASK-12 `src/main.js` の更新
- 対応要件: REQ-M3-007
- 対応設計: 設計書 3.9節
- 変更内容:
  - `spots.json` の fetch と `spotsData` 変数への保存
  - `initOdekakeScreen(spots)` / `initWaitingScreen` / `initHomecomingScreen` の初期化呼び出し
  - 起動時帰宅チェック: `loadCurrentVisit()` が存在し `isReturnReady` なら帰宅処理を実行
  - 起動時画面振り分けに `pet.state === 'visiting'` → `goWaiting()` を追加

---

## テスト（フェーズ7）

### TASK-13 `tests/visit.test.js` の作成
- `createVisit`: id・spotId・status・eventId・souvenirId・cardData の初期値を確認
- `isReturnReady`: now を注入して境界値テスト（durationMs ちょうど・未満・超過）
- `completeVisit`: status が `'completed'` になり cardData が設定されること
- `getVisitTiming`: elapsedMs と remainingMs の合計が durationMs に等しいこと

### TASK-14 `tests/event-generator.test.js` の作成
- `getTimeOfDay`: 6時・12時・18時・23時でそれぞれ正しい時間帯文字列を返すこと
- `generateEvent`: curiosity=2 の条件テンプレートが curiosity=2 のペットに選ばれること
- `generateEvent`: 条件不一致時にフォールバックが動作すること
- `generateEvent`: 結果の `eventText` に `{petName}` が含まれないこと（置換済みであること）

---

## 完了定義

以下をすべて満たした時点でこのスペックの実装を完了とする:

1. `data/spots.json` にスポット3件・各5件以上のイベントテンプレートが定義されている
2. おでかけ → 待機 → 帰宅 のコアループがブラウザで途切れなく動作する
3. `VISIT_DURATION_MS` を変更することで待機時間を調整できる
4. 帰宅時に Visit の `cardData` が正しく設定されて localStorage に保存される
5. `tests/visit.test.js` と `tests/event-generator.test.js` のすべてのテストがパスする
6. XSS 対策: イベント文・ペット名は textContent で挿入されている
