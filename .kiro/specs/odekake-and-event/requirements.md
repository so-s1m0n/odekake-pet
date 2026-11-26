# 要件定義 — おでかけとイベント

対象: M3（おでかけ状態遷移）・M4（イベント生成）・M5（帰宅処理と絵日記データ保存）  
作成日: 2026-10-31  
フォーマット: EARS（Easy Approach to Requirements Syntax）

---

## 用語

| 用語 | 定義 |
|---|---|
| Visit（訪問） | ペットが訪問先に滞在している1回分の記録。出発時刻・帰宅時刻・スポットID・発生イベント・おみやげを含む |
| Spot（スポット） | まちの訪問先（月夜の小屋・森の標本室・時計塔キッチン）のいずれか。イベントテンプレートのプールを持つ |
| Event（イベント） | 訪問中に発生した出来事。イベント文（2〜4行の短い物語）とおみやげ付与フラグで構成される |
| Souvenir（おみやげ） | 訪問の結果として得られるアイテム。スポット固有のものが1種ずつ存在する |
| 不在タイマー | 出発から帰宅可能になるまでの待機時間。設定値として分離し、デモ用短縮が可能にする |
| 絵日記データ | 帰宅時に保存する出来事の記録。カード画像生成（M5/M6）の入力となる構造体 |
| おでかけコード | 友達訪問に使う Base64 エンコード済み文字列（M7 実装予定。本スペックでは構造定義のみ） |

---

## M3 — おでかけ状態遷移

### REQ-M3-001 おでかけ開始の前提条件
> When ペットの state が `home` でありかつ進行中の Visit が存在しない、  
> the system shall おでかけ選択画面（screen-odekake）を表示できる状態にする。

### REQ-M3-002 おでかけボタンの制御
> While ペットの state が `visiting` または `returning` である、  
> the system shall おでかけボタンを無効化（disabled）し、重複出発を防ぐ。

### REQ-M3-003 スポット選択
> When ユーザーがおでかけ選択画面でスポットを選択し「おでかけ！」ボタンを押す、  
> the system shall 選択スポットの Visit を作成し、ペットの state を `visiting` に遷移させ、待機画面（screen-waiting）へ遷移する。

### REQ-M3-004 Visit の作成
> When おでかけが開始される、  
> the system shall 以下のフィールドを持つ Visit オブジェクトを生成して localStorageに保存する:
> - `id`: 一意なUUID形式の文字列
> - `spotId`: 選択されたスポットID
> - `departedAt`: 出発日時（ISO 8601）
> - `durationMs`: 不在期間（ミリ秒。設定値 `VISIT_DURATION_MS` から取得）
> - `status`: `'ongoing'`
> - `eventId`: `null`（帰宅時に設定）
> - `souvenirId`: `null`（帰宅時に設定）
> - `cardData`: `null`（カード生成時に設定）

### REQ-M3-005 不在タイマーの設定分離
> The system shall 不在期間を定数 `VISIT_DURATION_MS` として `src/domain/visit.js` 内に定義し、  
> コードの一箇所を変更するだけでデモ用（短縮）と本番用（長時間）を切り替えられるようにする。

### REQ-M3-006 待機中のペット表示
> While ペットの state が `visiting` である、  
> the system shall ホーム画面にて「おでかけ中」バナーとペットの `away` イラストを表示し、  
> 世話アクションボタンをすべて無効化する。

### REQ-M3-007 帰宅可能判定
> When アプリが起動される（またはフォーカスを取り戻す）、  
> the system shall 進行中の Visit について `now >= departedAt + durationMs` を確認し、  
> 条件を満たす場合は帰宅処理を開始する。

### REQ-M3-008 帰宅処理の状態遷移
> When 帰宅可能条件が満たされる、  
> the system shall ペットの state を `visiting` → `returning` へ遷移させ、  
> その直後にイベント生成（M4）を実行し、状態を `returning` → `home` へ遷移させ、  
> Visit の status を `'completed'` に更新して帰宅画面（screen-homecoming）へ遷移する。

### REQ-M3-009 waiting 画面から帰宅ボタン
> When ユーザーが待機画面（screen-waiting）で「帰宅チェック」ボタンを押す、  
> the system shall REQ-M3-007 の帰宅可能判定を即時実行し、  
> 帰宅可能なら帰宅処理を実行し、そうでなければ「まだおでかけ中だよ」を表示する。

---

## M4 — イベント生成

### REQ-M4-001 スポット別イベントテンプレート
> The system shall `data/spots.json` に各スポット（月夜の小屋・森の標本室・時計塔キッチン）ごとに  
> 最低5件のイベントテンプレートを定義する。  
> 各テンプレートは以下のフィールドを持つ:
> - `id`: テンプレートID（スポットIDプレフィクス付き）
> - `text`: イベント本文（`{petName}` プレースホルダーを含む2〜4行の文章）
> - `souvenirId`: 付随するおみやげID（`null` の場合はおみやげなし）
> - `conditions`: 選択条件（性格パラメータや時間帯によるフィルタ。省略時は条件なし）

### REQ-M4-002 イベント選択ロジック
> When イベント生成が実行される、  
> the system shall 対象スポットのテンプレートから、ペットの `personality` および出発時刻の時間帯に基づいて  
> 適合するテンプレートをフィルタリングし、その中からランダムに1件を選択する。  
> 適合するテンプレートが0件の場合は条件なしのテンプレートからランダムに選択する。

### REQ-M4-003 イベント文の生成
> When テンプレートが選択される、  
> the system shall `{petName}` プレースホルダーをペットの名前で置換した最終的なイベント文字列を生成する。

### REQ-M4-004 おみやげ付与
> When 選択されたテンプレートの `souvenirId` が `null` でない、  
> the system shall おみやげを1件生成し Visit に紐付けて localStorageに保存する。

### REQ-M4-005 スポット定義の分離
> The system shall スポットのメタデータ（名称・説明・テーマカラー）とイベントテンプレートを  
> `data/spots.json` に静的データとして定義し、アプリ起動時に fetch で読み込む。

---

## M5 — 帰宅処理と絵日記データ保存

### REQ-M5-001 絵日記データの保存
> When 帰宅処理が完了する、  
> the system shall 以下の情報を含む絵日記データ（`cardData`）を Visit に付加して保存する:
> - `spotId`: 訪問先スポットID
> - `petName`: ペットの名前
> - `petType`: ペットの種類ID
> - `eventText`: 生成されたイベント文
> - `souvenirId`: おみやげID（`null` 可）
> - `returnedAt`: 帰宅日時（ISO 8601）

### REQ-M5-002 帰宅画面の表示
> When 帰宅処理が完了し screen-homecoming が表示される、  
> the system shall ペット名・スポット名・イベント文・おみやげ（ある場合）を帰宅画面に表示する。

### REQ-M5-003 絵日記カード生成へのパス
> The system shall 帰宅画面に「絵日記をつくる」ボタンを配置し、  
> クリック時に `cardData` を引数として絵日記カード生成モジュール（M6で実装）を呼び出せる接続点を設ける。  
> M6が未実装の間はスタブ（コンソールログ出力）で代替する。

### REQ-M5-004 アルバムへの保存
> When ユーザーが帰宅画面で「おうちへ」ボタンを押す、  
> the system shall Visit をアルバムの訪問履歴（`odekakepet::visits::all`）に追記し、  
> ホーム画面へ遷移する。

### REQ-M5-005 おもいで数の更新
> When ホーム画面が再表示される、  
> the system shall アルバムに保存された Visit の件数を「おもいで」数として表示する。

### REQ-M5-006 Visit 履歴の永続化
> The system shall 訪問履歴を `odekakepet::visits::all`（配列JSON）として localStorageに保存し、  
> アプリを再起動しても履歴が失われないようにする。

---

## 非機能要件

### REQ-NF-001 純粋関数の分離
> The system shall イベント生成ロジック（`src/domain/event-generator.js`）と  
> Visit エンティティ操作（`src/domain/visit.js`）を DOM・localStorage に依存しない純粋関数として実装し、  
> `tests/` 配下のテストファイルで単体テスト可能な状態にする。

### REQ-NF-002 状態遷移の一方向性
> The system shall ペットの状態遷移を必ず `home → visiting → returning → home` の順序で行い、  
> `visiting` から直接 `home` へ遷移するコードパスを持たない。

### REQ-NF-003 XSS 対策
> The system shall イベント文・ペット名など外部入力に由来するすべての文字列を  
> `textContent` または `createElement` で DOM に挿入し、`innerHTML` を使用しない。

### REQ-NF-004 デモ対応
> The system shall 不在タイマー値を `VISIT_DURATION_MS` 定数1箇所で管理し、  
> デモ実演では30秒〜3分程度に短縮して体験できることを設計上保証する。
