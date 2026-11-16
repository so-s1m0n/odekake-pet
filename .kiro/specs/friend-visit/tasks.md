# 実装タスク — おともだち訪問

対象スペック: M7（おともだちコードの発行・コードでの訪問・足跡コードの受け取り）  
作成日: 2026-11-16

タスク番号は diary-and-album/tasks.md（TASK-15〜TASK-24）の続番。  
依存関係が少ないものから順に並べてある。  
各タスクには対応する要件ID と設計セクション番号を記載する。

---

## フェーズ1 — ドメインロジック（純粋関数）

### TASK-25 `src/domain/odekake-code.js` のチェックサムとエンコード基盤の実装
- 対応要件: REQ-M7-002、REQ-M7-003、REQ-M7-005
- 対応設計: 設計書 3.1節、4.1節
- 前提タスク: なし（独立して着手可能）
- 実装する export 関数・定数:
  - `CODE_VERSION = 1`
  - `CODE_PREFIX = 'v1:'`
  - `CODE_MAX_LENGTH = 500`
  - `fnv1a32(str) → number`
    - FNV-1a 32bit アルゴリズムで符号なし 32bit 整数を返す
    - 空文字列でもエラーにならないこと
  - `canonicalStringify(obj) → string`
    - オブジェクトのキーを昇順にソートし、`checksum` フィールドを除外して `JSON.stringify` した文字列を返す
  - `shortHash(name) → string`
    - `fnv1a32` の結果を 16進数 8桁の文字列にフォーマットして返す
- 実装する内部ヘルパー（非 export）:
  - `toBase64url(str) → string`: UTF-8 文字列 → Base64URL 変換
  - `fromBase64url(b64) → string|null`: Base64URL → UTF-8 文字列（失敗時 null）
- 検証方法:
  - TASK-32 の単体テストで `fnv1a32` の既知出力値を確認する
  - `canonicalStringify` が `checksum` を除外し、キー順が変化しても同一出力を返すことを確認する

---

### TASK-26 `encodeFriendCode` / `decodeFriendCode` の実装
- 対応要件: REQ-M7-002、REQ-M7-003、REQ-M7-005、REQ-M7-007
- 対応設計: 設計書 3.1節、4.1節、4.2節
- 前提タスク: TASK-25
- 実装する export 関数:
  - `encodeFriendCode(payload) → { code: string, error: string|null }`
    1. `checksum` を除いた payload から `canonicalStringify` で文字列を生成
    2. `fnv1a32` でチェックサムを算出し `payload.checksum` に付加
    3. `JSON.stringify(payload)` → `toBase64url` → `'v1:' + b64` でコードを生成
    4. 文字数が `CODE_MAX_LENGTH` を超えていれば `{ code: '', error: 'コードが長すぎるよ' }` を返す
    5. 成功時は `{ code, error: null }` を返す
  - `decodeFriendCode(code) → { payload: FriendCodePayload|null, error: string|null }`
    - 設計書 4.2節の検証シーケンス（5ステップ）をそのまま実装する
    - エラー文言は日本語の短い一文で統一する
- 検証方法:
  - TASK-32 の単体テスト（往復テスト・エラーケース）でカバーする

---

### TASK-27 `encodeFootprintCode` / `decodeFootprintCode` の実装
- 対応要件: REQ-M7-013、REQ-M7-014、REQ-M7-016
- 対応設計: 設計書 3.1節、4.3節
- 前提タスク: TASK-25
- 実装する export 関数:
  - `encodeFootprintCode(payload) → { code: string, error: string|null }`
    - `encodeFriendCode` と同一のエンコード方式。ペイロードのフィールド構成のみ異なる
    - `eventSummary` が 50 文字を超える場合は 50 文字目を `'…'` に置き換えてから格納する
  - `decodeFootprintCode(code) → { payload: FootprintCodePayload|null, error: string|null }`
    - `decodeFriendCode` と同一の検証シーケンス。必須フィールドのリストのみ異なる
- 検証方法:
  - TASK-32 の単体テスト（往復テスト）でカバーする

---

### TASK-28 `src/domain/event-generator.js` への `hostName` 引数追加
- 対応要件: REQ-M7-009、REQ-M7-011
- 対応設計: 設計書 3.2節
- 前提タスク: なし（TASK-25〜27 と並行して着手可能）
- 変更内容:
  - `generateEvent(spot, pet, departedAt, hostName = '')` のシグネチャに第4引数を追加する
  - ステップ5の `{petName}` 置換の前に `{hostName}` を `hostName` で置換する処理を挿入する
  - `hostName` が空文字の場合は `{hostName}` プレースホルダーがあっても空文字に置換されるだけで、エラーにならないこと
- 検証方法:
  - 既存の `tests/event-generator.test.js` のテストがすべてパスし続けること（デフォルト引数で後方互換性を保つ）
  - `hostName` を渡した場合に `{hostName}` が正しく置換されることを `tests/event-generator.test.js` に1件追加して確認する

---

## フェーズ2 — データと HTML・CSS の追加

### TASK-29 `data/friend-events.json` の作成
- 対応要件: REQ-M7-011
- 対応設計: 設計書 2.5節
- 前提タスク: TASK-28（`{hostName}` プレースホルダーの仕様確認のため）
- 作成内容:
  - `{petName}` と `{hostName}` を含む友達訪問用イベントテンプレートを最低5件定義する
  - `souvenirId` はすべて `null` にする（友達訪問ではおみやげなし）
  - `conditions` は `null`（無条件）と性格条件ありのものを混在させて動的分岐を持たせる
  - テンプレート ID は `friend-001` 〜 `friend-005`（以降は `friend-006` と連番）
- 検証方法:
  - JSON として正しく parse できること（ブラウザコンソールで `fetch('data/friend-events.json').then(r=>r.json()).then(console.log)` を実行して確認）
  - 5件のうち少なくとも1件は `conditions` に性格パラメータを持つこと

---

### TASK-30 `index.html` の追加・変更
- 対応要件: REQ-M7-001、REQ-M7-004、REQ-M7-006、REQ-M7-012、REQ-M7-015、REQ-M7-019
- 対応設計: 設計書 1.2節、1.3節、1.4節、1.5節
- 前提タスク: なし（他フェーズと並行可能）
- 変更内容:
  - `screen-home` に以下を追加:
    - `#footprint-notice`（`hidden`）・`#footprint-notice-list`・`#open-footprints-btn`
    - `#issue-friend-code-btn`
    - `#friend-code-modal`（`hidden`）・`#friend-code-output`・`#copy-friend-code-btn`・`#close-friend-code-modal-btn`
  - `screen-odekake` に以下を追加:
    - `.odekake__divider`
    - `.friend-code-section`・`#friend-code-input`・`#friend-code-error`・`#verify-friend-code-btn`
    - `#friend-code-preview`（`hidden`）・`#friend-code-preview-text`・`#depart-friend-btn`
  - `screen-homecoming` に以下を追加:
    - `#issue-footprint-code-btn`（`hidden`）
    - `#footprint-code-modal`（`hidden`）・`#footprint-code-output`・`#copy-footprint-code-btn`・`#close-footprint-code-modal-btn`
  - `<section id="screen-footprints">` を追加（設計書 1.5節の DOM 構造どおり）
  - `<link rel="stylesheet" href="styles/screens/footprints.css">` を追加
- 検証方法:
  - HTML バリデーターでエラーがないこと
  - 追加した全要素が `id` または `class` で JS から取得できる状態であること

---

### TASK-31 CSS の追加・変更
- 対応設計: 設計書 6節（ファイル一覧）
- 前提タスク: TASK-30
- 追加・変更するファイル:
  - `styles/screens/footprints.css`（新規）:
    - `.footprint-input-section`・`.footprint-list`・`.footprint-list__empty` のレイアウト
    - `.footprint-input-section__error`・`.footprint-input-section__success` の表示スタイル
  - `styles/components.css`（変更）:
    - `.modal`・`.modal__inner`・`.modal__title`・`.modal__lead` の共通モーダルスタイル
    - `.code-textarea`（読み取り専用コードテキストエリア）のスタイル
    - `.friend-code-preview`・`.friend-code-section__error`・`.footprint-notice` のスタイル
- 検証方法:
  - 各画面をブラウザで開いてモーダルの表示/非表示・コードエリアの折り返しが正しいことを目視確認する

---

## フェーズ3 — store とルーターの更新

### TASK-32（前倒し可能）`src/store.js` への足跡関数追加
- 対応要件: REQ-M7-017、REQ-M7-NF-004
- 対応設計: 設計書 3.3節
- 前提タスク: なし（他のタスクと並行して着手可能）
- 変更内容:
  - `KEYS` に `FOOTPRINTS_ALL: 'odekakepet::footprints::all'` を追加する
  - `SCHEMA_VERSION` を `3` に変更する
  - `migrate_v2_to_v3()` を追加する: `footprints::all` が存在しなければ `'[]'` で初期化する
  - `migrate()` の分岐に `storedVersion < 3` → `migrate_v2_to_v3()` を追加する
  - `loadFootprints() → FootprintRecord[]` を追加する
  - `appendFootprint(record) → void` を追加する
- 検証方法:
  - 既存のスキーマ v2 環境（`version=2` が保存済み）でアプリを起動し、`footprints::all` が `[]` に初期化されることをブラウザコンソールで確認する
  - 既存の `loadPet`・`loadCurrentVisit` 等の動作が変化しないことを確認する

---

### TASK-33 `src/router.js` への `screen-footprints` 追加
- 対応要件: REQ-M7-020
- 対応設計: 設計書 3.4節
- 前提タスク: TASK-30
- 変更内容:
  - `SCREEN_IDS` に `'screen-footprints'` を追加する
  - `goFootprints()` を追加する（`showScreen('screen-footprints')` を呼ぶ）
- 検証方法:
  - `goFootprints()` を呼び出したときに `screen-footprints` が表示され、他の画面が非表示になること

---

## フェーズ4 — 画面モジュールの実装

### TASK-34 `src/screens/home.js` への M7 追加処理の実装
- 対応要件: REQ-M7-001、REQ-M7-004、REQ-M7-019、REQ-M7-020
- 対応設計: 設計書 3.5節
- 前提タスク: TASK-26（`encodeFriendCode`）、TASK-30（HTML）、TASK-32（store）、TASK-33（router）
- 実装内容:
  - `initHomeScreen` の引数に `footprints` を追加し、`renderFootprintNotice(footprints)` を呼ぶ
  - `renderFootprintNotice(footprints)`:
    - 0件なら `#footprint-notice` を `hidden`
    - 1件以上なら直近3件を `visitedAt` 降順で取得し、各件を `<li>` で `footprint-notice-list` に追加する（`textContent` で挿入）
  - `#issue-friend-code-btn` のクリックリスナー:
    - ペットの state が `visiting` / `returning` のときは何もしない
    - `encodeFriendCode(...)` でコードを生成し、失敗時はアラート表示
    - 成功時は `#friend-code-output` の `value` にコードをセットし `#friend-code-modal` を表示（`hidden = false`）
  - `#copy-friend-code-btn` のクリックリスナー: クリップボードへのコピーとラベルの一時変更
  - `#close-friend-code-modal-btn` のクリックリスナー: `#friend-code-modal` を `hidden = true`
  - `#open-footprints-btn` のクリックリスナー: `goFootprints()` を呼ぶ
- 検証方法:
  - ペットが `home` 状態のとき「おともだちコードを発行」ボタンを押すとモーダルが開き、コードが表示されること
  - 「コピー」ボタンを押した後にブラウザのアドレスバーに貼り付けて正しいコードが入っていること
  - 足跡レコードが1件以上ある場合に `#footprint-notice` が表示されること

---

### TASK-35 `src/screens/odekake.js` への M7 追加処理の実装
- 対応要件: REQ-M7-006、REQ-M7-007、REQ-M7-008、REQ-M7-009、REQ-M7-010
- 対応設計: 設計書 3.6節
- 前提タスク: TASK-26（`decodeFriendCode`）、TASK-28（`generateEvent` 拡張）、TASK-29（`friend-events.json`）、TASK-30（HTML）
- 実装内容:
  - `initOdekakeScreen(spots, friendEvents)` の引数に `friendEvents` を追加する
  - `#verify-friend-code-btn` のクリックリスナー:
    - `decodeFriendCode(input)` を実行する
    - 失敗時: `#friend-code-error` に `textContent` でエラー文をセット、`hidden = false`
    - 成功時: `#friend-code-error` を `hidden = true`、`#friend-code-preview-text` に「{petName} ちゃんのおうちを訪問します」を `textContent` でセット、`#friend-code-preview` を `hidden = false`
  - `buildSyntheticSpot(payload, friendEvents) → SyntheticSpot`:
    - `id = 'friend-' + shortHash(payload.petName)`
    - `displayName = payload.petName + ' のおうち'`
    - `events = friendEvents`（`{hostName}` を `payload.petName` で事前置換してコピーする）
    - `hostPet = { name: payload.petName, type: payload.petType, personality: { curiosity: payload.curiosity, sociability: payload.sociability } }`
  - `#depart-friend-btn` のクリックリスナー:
    - `buildSyntheticSpot` で合成スポットを生成する
    - `createVisit(syntheticSpot.id)` で Visit を作成し、`isFriendVisit: true` を追加フィールドとして付加する
    - `saveCurrentVisit(visit)` → `savePet(transitionPetState(pet, 'visiting'))` → `goWaiting()` を呼ぶ
    - 合成スポット定義は `sessionStorage`（または `Map` によるインメモリキャッシュ）に保存し、待機画面・帰宅画面から参照できるようにする
- 検証方法:
  - 有効なおともだちコードを貼り付けて「このコードで訪問」を押すと「○○ちゃんのおうちを訪問します」と表示されること
  - 壊れたコードを入力すると日本語のエラー文が表示され出発できないこと
  - 友達訪問で出発すると `screen-waiting` に遷移し、ペットの state が `visiting` になること

---

### TASK-36 `src/screens/homecoming.js` への M7 追加処理の実装
- 対応要件: REQ-M7-012、REQ-M7-013、REQ-M7-014
- 対応設計: 設計書 3.7節
- 前提タスク: TASK-27（`encodeFootprintCode`）、TASK-30（HTML）
- 変更内容:
  - `initHomecomingScreen(visit, spots)` → `initHomecomingScreen(visit, spots, syntheticSpot)` に変更する
  - `visit.isFriendVisit === true` のとき `#issue-footprint-code-btn` を `hidden = false` にする
  - `#issue-footprint-code-btn` のクリックリスナー:
    - `encodeFootprintCode({ v: 1, visitorPetName: ..., visitorPetType: ..., visitedAt: ..., eventSummary: ... })` を呼ぶ
    - 成功時: `#footprint-code-output` の `value` にセットし `#footprint-code-modal` を表示する
    - 失敗時: アラートを表示する
  - `#copy-footprint-code-btn` のクリックリスナー: TASK-34 と同一のコピー処理を実装する
  - `#close-footprint-code-modal-btn` のクリックリスナー: モーダルを閉じる
- 検証方法:
  - 友達訪問で帰宅したとき「足跡コードを発行」ボタンが表示されること
  - まちのスポット訪問の帰宅時はボタンが非表示のままであること
  - 発行した足跡コードを `decodeFootprintCode` に通して全フィールドが復元できること（ブラウザコンソールで手動確認）

---

### TASK-37 `src/screens/footprints.js` の実装
- 対応要件: REQ-M7-015、REQ-M7-016、REQ-M7-017、REQ-M7-018、REQ-M7-020
- 対応設計: 設計書 3.8節
- 前提タスク: TASK-27（`decodeFootprintCode`）、TASK-30（HTML）、TASK-31（CSS）、TASK-32（store）、TASK-33（router）
- 実装内容:
  - `initFootprintsScreen(footprints) → void`:
    - `renderFootprintList(footprints)` を呼ぶ
    - `#record-footprint-btn` のクリックリスナーを登録する（`onRecordFootprint`）
    - `#footprints-back-btn` のクリックリスナーを登録する（`goHome()`）
  - `renderFootprintList(footprints)`:
    - 0件なら `#footprint-list-empty` を `hidden = false`
    - 1件以上なら `visitedAt` 降順でソートし、各件を `<li>` で `#footprint-list` に追加する
    - 各 `<li>` にはペット名・種類・訪問日・要約文を `textContent` で挿入する
  - `onRecordFootprint()`:
    1. `#footprint-code-input` の値を取得する
    2. `decodeFootprintCode(value)` を呼ぶ
    3. 失敗時: `#footprint-input-error` に `textContent` でエラー文をセット、`hidden = false`
    4. 成功時: 重複確認（`visitorPetName` + `visitedAt` が既存レコードにあれば「すでに記録済みだよ」を `#footprint-input-success` に表示して終了）
    5. 重複なし: `appendFootprint(record)` → `#footprint-list` を更新 → `#footprint-input-success` に「記録したよ！」を表示 → テキストエリアをクリア
- 検証方法:
  - 有効な足跡コードを入力して「足跡を記録」を押すとリストに追加されること
  - 同じコードをもう一度入力すると「すでに記録済みだよ」と表示されてリストに重複しないこと
  - ページリロード後も記録が保持されていること（localStorage への永続化確認）

---

### TASK-38 `src/main.js` への M7 初期化処理の追加
- 対応要件: REQ-M7-015、REQ-M7-019
- 対応設計: 設計書 3.9節
- 前提タスク: TASK-32、TASK-33、TASK-37
- 変更内容:
  - `import { initFootprintsScreen } from './screens/footprints.js'` を追加する
  - `import { loadFootprints } from './store.js'` を追加する
  - `friend-events.json` の `fetch` を `spots.json` と並行して読み込む処理を追加する
  - `goFootprints()` ラッパー（または router フック）で `initFootprintsScreen(loadFootprints().sort(...))` を呼ぶ処理を追加する
  - `initHomeScreen` の呼び出しに `loadFootprints()` を引数として追加する
- 検証方法:
  - アプリ起動時に `friend-events.json` が正常に取得できること（Network タブで 200 応答を確認）
  - 足跡レコードが存在する状態でリロードしてもホーム画面の通知エリアが正しく表示されること

---

## フェーズ5 — テスト

### TASK-39 `tests/odekake-code.test.js` の作成
- 対応要件: REQ-M7-NF-005
- 対応設計: 設計書 7節
- 前提タスク: TASK-25、TASK-26、TASK-27
- テスト内容:
  - `fnv1a32`:
    - 空文字列でエラーにならないこと
    - 同じ入力を複数回呼んで同一値が返ること（決定論的であること）
    - 異なる入力で異なる値が返ること（衝突しないこと。具体的な既知ベクタは実装確認後に記録する）
  - `canonicalStringify`:
    - `checksum` フィールドが除外されること
    - キー順序が異なるオブジェクトを渡しても同一の文字列が返ること
  - `encodeFriendCode → decodeFriendCode`（往復テスト）:
    - `petName`・`petType`・`curiosity`・`sociability`・`issuedAt` の全フィールドが往復後も一致すること
    - 生成されたコードが 500 文字以内であること
  - `encodeFootprintCode → decodeFootprintCode`（往復テスト）:
    - `visitorPetName`・`visitorPetType`・`visitedAt`・`eventSummary` の全フィールドが往復後も一致すること
  - `decodeFriendCode` のエラーケース:
    - `v1:` プレフィクスなしのコード → `error` が `null` でないこと
    - Base64URL 部分が壊れたコード（`'v1:!!!'`）→ `error` が `null` でないこと
    - 有効なコードの `checksum` フィールドを `0` に書き換えたコード → `error` が `null` でないこと
    - `petName` フィールドを削除したコード → `error` が `null` でないこと
  - すべてのエラーケースで `payload` が `null` であること
- 検証方法:
  - `tests/test-runner.html` をブラウザで開いて全テストが PASS 表示になること

---

### TASK-40 `tests/event-generator.test.js` への `hostName` テスト追加
- 対応要件: REQ-M7-011
- 対応設計: 設計書 3.2節
- 前提タスク: TASK-28
- 追加するテスト:
  - `{hostName}` を含むテンプレートと `hostName` 引数を渡して `generateEvent` を呼んだとき、返り値の `eventText` に `{hostName}` が残っていないこと
  - `hostName` を省略した既存のテストが引き続きパスすること
- 検証方法:
  - `tests/test-runner.html` をブラウザで開いて既存テストを含む全件が PASS 表示になること

---

## 完了定義

以下をすべて満たした時点でこのスペックの実装を完了とする:

1. ホーム画面の「おともだちコードを発行」ボタンを押すと、モーダルにコードが表示されてクリップボードへコピーできる
2. コピーしたコードをおでかけ選択画面に貼り付けて「このコードで訪問」を押すと「○○ちゃんのおうちを訪問します」と表示され、「出発する」で友達訪問が開始できる
3. 友達訪問の帰宅後に「足跡コードを発行」ボタンが表示され、コードをコピーできる
4. 足跡一覧画面（またはホーム画面）で足跡コードを入力して「足跡を記録」を押すと、来訪履歴が追加されてホーム画面に通知が表示される
5. 同じ足跡コードを重複入力しても「すでに記録済みだよ」と表示されてリストが重複しない
6. 壊れたコード・改ざんされたコード・バージョン不一致コードを入力すると日本語のエラー理由が表示され、訪問・記録のいずれも実行されない
7. アプリをリロードしても足跡履歴が保持されている（localStorage への永続化）
8. `tests/odekake-code.test.js` の全テストが PASS する（往復テスト・エラーケースを含む）
9. `tests/event-generator.test.js` の全テストが PASS し続ける（後方互換性の確認）
10. `innerHTML` を使用するコードが今回追加・変更したすべてのファイルに含まれていない（XSS 対策の確認）
