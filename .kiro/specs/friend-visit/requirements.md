# 要件定義 — おともだち訪問

対象: M7（おともだちコードの発行・コードでの訪問・足跡コードの受け取り）  
作成日: 2026-11-16  
フォーマット: EARS（Easy Approach to Requirements Syntax）

---

## 用語

| 用語 | 定義 |
|---|---|
| おともだちコード | 自分のペット情報を Base64URL エンコードした文字列。友達に渡すことで友達のペットが自分の部屋を訪問できる |
| FriendCode | おともだちコードの JSON ペイロードを表すオブジェクト型 |
| 合成スポット | おともだちコードのデコード結果から組み立てる仮想スポット定義。ホストはコード発行者のペット |
| 足跡コード | 友達訪問が完了した後に発行できる、訪問記録を Base64URL エンコードした文字列 |
| FootprintCode | 足跡コードの JSON ペイロードを表すオブジェクト型 |
| 足跡レコード | 足跡コードをデコードして自分の localStorage に保存した来訪履歴の1件 |
| チェックサム | FNV-1a（32bit）アルゴリズムで算出した整数。コードの破損・改ざん検出に使用する |
| コードバージョン | コードフォーマットの互換性を管理する整数。現行は `1` |

---

## おともだちコードの発行（コード生成側）

### REQ-M7-001 おともだちコードの発行トリガー
> When ペットの state が `home` である、  
> the system shall ホーム画面またはおでかけ選択画面に「おともだちコードを発行」ボタンを表示する。

### REQ-M7-002 FriendCode ペイロードの構成
> When おともだちコードが発行される、  
> the system shall 以下のフィールドを含む FriendCode JSON を生成する:
> - `v`: コードバージョン（整数。現行 `1`）
> - `petName`: ペットの名前（文字列）
> - `petType`: ペットの種類ID（文字列）
> - `curiosity`: 好奇心パラメータ値（整数 0〜2）
> - `sociability`: 社交性パラメータ値（整数 0〜2）
> - `issuedAt`: 発行日時（ISO 8601 文字列）
> - `checksum`: FNV-1a 32bit チェックサム（整数。上記6フィールドをキー昇順で JSON.stringify した文字列に対して算出）

### REQ-M7-003 エンコード形式
> When FriendCode JSON が生成される、  
> the system shall JSON 文字列を UTF-8 でエンコードしたバイト列を Base64URL（`+` → `-`、`/` → `_`、パディング `=` なし）に変換し、  
> `v1:` プレフィクスを先頭に付けた文字列をおともだちコードとして発行する。

### REQ-M7-004 コードのコピー表示
> When おともだちコードが発行される、  
> the system shall コード文字列をコピー可能なテキスト（`<textarea readonly>` または `<input readonly>`）として表示し、  
> 「コピー」ボタンを配置する。「コピー」ボタンを押すと `navigator.clipboard.writeText` でクリップボードにコピーし、  
> ボタンラベルを「コピーしました！」に一時変更する（2秒後に元に戻す）。

### REQ-M7-005 コードの文字数制限
> The system shall 発行するおともだちコードを 500 文字以内に収める。  
> ペイロード生成時に文字数を確認し、超過する場合はコード発行を中止してエラーメッセージを表示する。

---

## コードでの訪問（コード使用側）

### REQ-M7-006 コード入力フィールド
> When ペットの state が `home` である、  
> the system shall おでかけ選択画面にコード入力エリア（テキストエリアまたはテキストフィールド）と  
> 「このコードで訪問」ボタンを配置する。

### REQ-M7-007 コードのデコードと検証
> When ユーザーが「このコードで訪問」ボタンを押す、  
> the system shall 入力値に対して以下の検証を順に実行し、最初に失敗した箇所のエラー理由を表示して出発を中止する:
> 1. `v1:` プレフィクスが存在すること（バージョン不一致エラー）
> 2. Base64URL デコードが成功すること（形式エラー）
> 3. デコード結果が有効な JSON であること（形式エラー）
> 4. `v`・`petName`・`petType`・`curiosity`・`sociability`・`issuedAt`・`checksum` フィールドが存在すること（フィールド不足エラー）
> 5. チェックサムが一致すること（改ざん/破損エラー）

### REQ-M7-008 デコード後のプレビュー
> When コードの検証が成功する、  
> the system shall 訪問相手のペット名と種類を「○○ちゃんのおうちを訪問します」としてユーザーに確認表示し、  
> 「出発する」ボタンで訪問を確定できるようにする。

### REQ-M7-009 合成スポット定義の生成
> When ユーザーが友達のコードでの訪問を確定する、  
> the system shall デコードした FriendCode からインメモリの合成スポット定義を組み立てる:
> - `id`: `friend-{petName のハッシュ短縮値}`（localStorage に保存しない一時値）
> - `displayName`: `{hostPetName} のおうち`
> - `events`: 友達訪問用の汎用イベントテンプレート群（`data/friend-events.json` から読み込む）
> - `hostPet`: デコードした FriendCode の `petName`・`petType`・`personality` を含むオブジェクト
> - この合成スポット定義を `generateEvent` に渡して既存のイベント生成フローを使う

### REQ-M7-010 Visit の作成と状態遷移
> When 合成スポット定義が生成される、  
> the system shall 既存の `createVisit` を使って Visit を作成し、  
> `spotId` に合成スポットの `id` を設定し、  
> ペットの状態を `home → visiting → returning → home` の既定の遷移に従って処理する。  
> 訪問フロー（waiting 画面・帰宅処理）は既存のまちのスポット訪問と同一のフローを使う。

### REQ-M7-011 友達訪問イベントテンプレート
> The system shall `data/friend-events.json` に友達訪問専用の汎用イベントテンプレートを最低5件定義する。  
> 各テンプレートは `{petName}`（訪問者）と `{hostName}`（ホストペット）の2種のプレースホルダーを持ち、  
> `generateEvent` を呼び出す前にホスト名を合成スポット定義に埋め込む形で処理する。

---

## 足跡コードの発行と受け取り

### REQ-M7-012 足跡コードの発行トリガー
> When 友達のおともだちコードで訪問した Visit が `completed` になり帰宅画面が表示される、  
> the system shall 帰宅画面に「足跡コードを発行」ボタンを表示する。  
> まちのスポット訪問の場合はこのボタンを表示しない。

### REQ-M7-013 FootprintCode ペイロードの構成
> When 足跡コードが発行される、  
> the system shall 以下のフィールドを含む FootprintCode JSON を生成する:
> - `v`: コードバージョン（整数。現行 `1`）
> - `visitorPetName`: 訪問者ペットの名前（文字列）
> - `visitorPetType`: 訪問者ペットの種類ID（文字列）
> - `visitedAt`: 帰宅日時（ISO 8601 文字列）
> - `eventSummary`: イベント文の先頭 50 文字（文字列。50文字を超える場合は「…」で切る）
> - `checksum`: FNV-1a 32bit チェックサム（整数。上記5フィールドをキー昇順で JSON.stringify した文字列に対して算出）

### REQ-M7-014 足跡コードのエンコード形式
> When FootprintCode JSON が生成される、  
> the system shall REQ-M7-003 と同一のエンコード方式（Base64URL・`v1:` プレフィクス）を使用する。

### REQ-M7-015 足跡コードの入力フィールド
> The system shall ホーム画面またはアルバム画面に「足跡コードを入力」エリアを配置し、  
> ペットの state に関わらず（`home` 状態でなくても）足跡コードを入力・保存できるようにする。

### REQ-M7-016 足跡コードのデコードと検証
> When ユーザーが足跡コードを入力して「足跡を記録」ボタンを押す、  
> the system shall REQ-M7-007 と同等の検証シーケンス（プレフィクス・Base64URL・JSON・フィールド・チェックサム）を実行し、  
> 失敗した場合はエラー理由を表示して保存を中止する。

### REQ-M7-017 足跡レコードの保存
> When 足跡コードの検証が成功する、  
> the system shall 以下のフィールドを持つ足跡レコードを `odekakepet::footprints::all` に追記して保存する:
> - `id`: 一意ID（`footprint-${Date.now()}` 形式）
> - `visitorPetName`: 訪問者ペットの名前
> - `visitorPetType`: 訪問者ペットの種類ID
> - `visitedAt`: 訪問日時（ISO 8601）
> - `eventSummary`: イベント要約文
> - `recordedAt`: 記録日時（ISO 8601）

### REQ-M7-018 重複足跡の検出
> When 足跡コードを保存しようとする、  
> the system shall `visitorPetName` と `visitedAt` の組み合わせが既存の足跡レコードに存在する場合は  
> 「すでに記録済みだよ」と表示し、重複保存を行わない。

### REQ-M7-019 来訪履歴の表示
> When ホーム画面が表示される、  
> the system shall 足跡レコードが1件以上存在する場合、直近3件を「○○ちゃんが遊びに来たよ」として表示する。

### REQ-M7-020 来訪履歴の全件表示
> The system shall ホーム画面またはアルバム画面に「あしあとを見る」リンクを配置し、  
> クリックすると足跡レコードの全件を `visitedAt` 降順で一覧表示する。

---

## 非機能要件

### REQ-M7-NF-001 サーバーレス制約
> The system shall おともだちコードおよび足跡コードの発行・検証・保存をすべてブラウザ内 JavaScript で完結させ、  
> 外部サーバーへの通信を一切行わない。

### REQ-M7-NF-002 状態遷移の非破壊
> The system shall コードでの訪問においても既存の状態遷移マップ（`home → visiting → returning → home`）を変更せず、  
> `visiting` から直接 `home` に遷移するコードパスを追加しない。

### REQ-M7-NF-003 XSS 対策
> The system shall コードのデコード結果（`petName` 等のユーザー入力由来の文字列）を  
> `textContent` または `createElement` で DOM に挿入し、`innerHTML` を使用しない。

### REQ-M7-NF-004 localStorage への追加キーの制限
> The system shall M7 で新たに追加する localStorage キーを `odekakepet::footprints::all` のみとし、  
> 既存のキー（`pet::current`・`visit::current`・`visits::all`）の構造を変更しない。

### REQ-M7-NF-005 コードの往復テスト
> The system shall `src/domain/odekake-code.js` のエンコード→デコードで全フィールドが一致すること、  
> および足跡コードについても同様であることを、`tests/odekake-code.test.js` の単体テストで保証する。
