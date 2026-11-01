# 実装タスク — 絵日記とアルバム

対象スペック: M5（絵日記カード生成）・M6（おもいでアルバム）  
作成日: 2026-11-01

タスク番号は odekake-and-event/tasks.md（TASK-01〜TASK-14）の続番。  
依存関係が少ないものから順に並べてある。  
各タスクには対応する要件ID と設計セクション番号を記載する。

---

## フェーズ1 — ドメインロジック（純粋関数）

### TASK-15 `src/domain/card-generator.js` の内部ヘルパー実装
- 対応要件: REQ-M6-NF-001、REQ-M6-NF-002、REQ-M6-NF-004
- 対応設計: 設計書 3.1節
- 前提タスク: なし（独立して着手可能）
- 実装する内部関数（export しない）:
  - `truncateText(text, maxLen = 100) → string`
    - 100文字以下はそのまま返す
    - 超過した場合は 100 文字目を「…」に置き換えて返す
  - `formatDateJa(isoString) → string`
    - ISO 8601 文字列を `Date` に変換し「YYYY年MM月DD日」形式で返す
    - `Intl.DateTimeFormat` を使い、タイムゾーン依存を避ける
  - `drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) → number`
    - `ctx.measureText` でトークンを区切り、折り返しながら `fillText` する
    - 返り値は描画した最後の行の y 座標

---

### TASK-16 `src/domain/card-generator.js` のメイン関数実装
- 対応要件: REQ-M6-001、REQ-M6-002、REQ-M6-003、REQ-M6-004、REQ-M6-NF-001
- 対応設計: 設計書 3.1節（描画シーケンス）
- 前提タスク: TASK-15
- 実装する export 関数:
  - `generateCard(cardData, canvas, spot) → Promise<void>`
    1. `canvas.getContext('2d')` 取得・`clearRect` でリセット
    2. `loadImage('assets/spots/{spotId}/bg.png')` を試み、  
       成功時: `drawImage` で全面に描画  
       失敗時: `spot.themeColor` で `fillRect`（REQ-M6-003）
    3. 下部に半透明オーバーレイ（`CARD_LAYOUT.OVERLAY_*` を使用）を描画
    4. テキスト色を白（`#FFFFFF`）に設定し各フィールドを描画:
       - ペット名: `fillText`
       - 出来事テキスト: `truncateText` → `drawWrappedText`
       - 日付: `formatDateJa(returnedAt)` → `fillText`
    5. `loadImage('assets/ui/logo.svg')` でロゴを右下に描画（失敗時スキップ）
  - `downloadCardAsPng(canvas, returnedAt) → void`
    - `canvas.toBlob()` で PNG Blob を生成
    - `URL.createObjectURL(blob)` → `<a download="odekake-YYYYMMDD.png">` で保存を促す
    - `URL.revokeObjectURL()` でメモリを解放する
- 内部ヘルパー:
  - `loadImage(url) → Promise<ImageBitmap|null>`（失敗時 null を返す）

---

## フェーズ2 — HTML と CSS の追加

### TASK-17 `index.html` への追加
- 対応要件: REQ-M6-006、REQ-M6-010
- 対応設計: 設計書 1.2節、1.3節、3.7節
- 前提タスク: なし（独立して着手可能）
- 変更内容:
  - `screen-homecoming` の `<main>` 内に以下を追加:
    - `<div id="card-preview-area" hidden>`（`<canvas id="diary-card-canvas" width="1080" height="1920">`を内包）
    - `<button id="save-card-btn" disabled>`
  - `<section id="screen-album">` を追加（設計書 1.3節の DOM 構造どおり）
  - `<link rel="stylesheet" href="styles/screens/album.css">` を追加

### TASK-18 CSS の追加・変更
- 対応設計: 設計書 5節（ファイル一覧）
- 前提タスク: TASK-17
- 追加・変更するファイル:
  - `styles/screens/album.css`（新規）:
    - `.souvenir-shelf`・`.souvenir-list`・`.souvenir-group`・`.souvenir-card` のレイアウト
    - `.visit-log`・`.visit-list`・`.visit-card` のスタイル
    - `.album-card-preview` のオーバーレイ表示スタイル
    - `.visit-list__empty`・`.souvenir-shelf__empty` の空状態スタイル
  - `styles/screens/homecoming.css`（変更）:
    - `.card-preview-area` の縮小プレビュースタイル（`max-width: 360px; width: 100%;`）

---

## フェーズ3 — 画面モジュール

### TASK-19 `src/screens/homecoming.js` の `onMakeCard` 本実装
- 対応要件: REQ-M6-005、REQ-M6-006
- 対応設計: 設計書 3.3節
- 前提タスク: TASK-16、TASK-17
- 変更内容:
  - `import { generateCard, downloadCardAsPng } from '../domain/card-generator.js'` を追加
  - `onMakeCard(cardData, spot)` スタブを以下に差し替える:
    1. `generateCard(cardData, canvas, spot)` を await で呼ぶ
    2. `#card-preview-area` を表示（`hidden = false`）
    3. `#save-card-btn` を有効化（`disabled = false`、`aria-disabled = 'false'`）
  - `#save-card-btn` のクリックリスナーで `downloadCardAsPng(canvas, cardData.returnedAt)` を呼ぶ
  - `initHomecomingScreen` が `spot` オブジェクトを受け取れるよう引数を拡張する

### TASK-20 `src/screens/album.js` の実装
- 対応要件: REQ-M6-010〜REQ-M6-016
- 対応設計: 設計書 1.3節、3.2節
- 前提タスク: TASK-16、TASK-17、TASK-18
- 実装する export 関数:
  - `initAlbumScreen(visits, spots) → void`
    - `renderSouvenirShelf(visits, spots)` を呼ぶ
    - `renderVisitList(visits, spots)` を呼ぶ
    - `#album-back-btn` に `goHome()` のリスナーを登録
- 内部関数:
  - `renderSouvenirShelf(visits, spots)`:
    - `souvenirId !== null` の visits を `spotId` でグループ化
    - グループごとに `.souvenir-group` を生成し `#souvenir-list` に挿入
    - ゼロ件: `.souvenir-shelf__empty` メッセージを挿入
  - `renderVisitList(visits, spots)`:
    - `returnedAt` 降順にソート
    - 各 Visit に対し `.visit-card` を生成して `#visit-list` に挿入
    - `cardData` が存在する Visit のみ「もう一度見る」ボタンを追加し `onViewCard` を登録
    - ゼロ件: `.visit-list__empty` とホーム誘導ボタンを挿入
  - `onViewCard(cardData, spot)`:
    - `#album-card-preview` を表示
    - `generateCard(cardData, albumCanvas, spot)` を await で呼ぶ
    - 完了後 `#album-save-card-btn` を有効化
  - `#album-save-card-btn` のリスナーで `downloadCardAsPng(albumCanvas, cardData.returnedAt)`
  - `#album-close-card-btn` のリスナーで `#album-card-preview` を非表示

---

## フェーズ4 — ルーターとホーム画面の更新

### TASK-21 `src/router.js` への `screen-album` 追加
- 対応要件: REQ-M6-010
- 対応設計: 設計書 3.4節
- 前提タスク: TASK-17
- 変更内容:
  - `SCREEN_IDS` に `'screen-album'` を追加
  - `goAlbum()` を追加（`showScreen('screen-album')` を呼ぶ）

### TASK-22 `src/screens/home.js` への「おもいでアルバム」ボタン追加
- 対応要件: REQ-M6-010
- 対応設計: 設計書 3.5節
- 前提タスク: TASK-21
- 変更内容:
  - `initHomeScreen` 内で `#open-album-btn`（index.html に定義済みを前提）に `goAlbum()` のリスナーを追加
  - ペットが `visiting` 状態の場合はボタンを `disabled` にする
  - `index.html` の `screen-home` に `<button id="open-album-btn">おもいでアルバム</button>` がなければ追加する

### TASK-23 `src/main.js` への `initAlbumScreen` 追加
- 対応要件: REQ-M6-010、REQ-M6-011
- 対応設計: 設計書 3.6節
- 前提タスク: TASK-20、TASK-21
- 変更内容:
  - `import { initAlbumScreen } from './screens/album.js'` を追加
  - `goAlbum()` が呼ばれる前に `initAlbumScreen(loadVisitsAll(), spotsData)` を実行する処理を追加する
  - 具体的には `router.js` の `showScreen` フック、または `goAlbum()` ラッパーで visits/spots を渡す

---

## フェーズ5 — テスト

### TASK-24 `tests/card-generator.test.js` の作成
- 対応要件: REQ-M6-NF-004
- 対応設計: 設計書 6節
- 前提タスク: TASK-15
- テスト対象（すべて `card-generator.js` から `export` された純粋関数に限定する）:
  - `truncateText`:
    - 100文字以下の文字列はそのまま返すこと
    - 101文字の文字列は100文字+「…」に切られること
    - 空文字列でエラーにならないこと
    - ちょうど100文字の境界値で切られないこと
  - `formatDateJa`:
    - `'2026-11-01T12:00:00+09:00'` → `'2026年11月1日'` になること
    - 月・日が1桁の場合でもゼロパディングされないこと（Intl に委ねる）
- 注意: `generateCard`・`drawWrappedText` は DOM Canvas に依存するため単体テスト対象外とし、  
  スナップショット目視確認（`tests/test-runner.html` 上で実行）で代替する

---

## 完了定義

以下をすべて満たした時点でこのスペックの実装を完了とする:

1. 帰宅画面で「絵日記をつくる」ボタンを押すと 1080×1920px の絵日記カードが Canvas に描画され、プレビューが表示される
2. 「絵日記を保存」ボタンを押すと PNG ファイルが端末にダウンロードされる（外部への自動送信は行わない）
3. アルバム画面で全 Visit の訪問履歴が帰宅日時の降順で一覧表示される
4. アルバム画面で「もう一度見る」を押すと、過去の CardData から絵日記カードが再生成される
5. アルバム画面のおみやげ棚に、獲得済みおみやげがスポット別に表示される
6. `tests/card-generator.test.js` の `truncateText`・`formatDateJa` テストがすべてパスする
7. `innerHTML` を使用するコードが `src/domain/card-generator.js` と `src/screens/album.js` に含まれていない（XSS 対策の確認）
8. localStorage に PNG データが保存されていない（ストレージ容量対策の確認）
