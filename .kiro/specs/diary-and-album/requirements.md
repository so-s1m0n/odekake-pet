# 要件定義 — 絵日記とアルバム

対象: M5（絵日記カード生成）・M6（おもいでアルバム）  
作成日: 2026-11-01  
フォーマット: EARS（Easy Approach to Requirements Syntax）

---

## 用語

| 用語 | 定義 |
|---|---|
| CardData | 帰宅時に Visit に付加される絵日記生成用の構造体。spotId・petName・petType・eventText・souvenirId・returnedAt を含む（odekake-and-event/design.md §2.1 で定義） |
| 絵日記カード | CardData をもとに Canvas で描画するStories比率（1080×1920px）の縦型PNG画像 |
| カードキャンバス | 絵日記カードを描画する `<canvas>` 要素。DOM上に1つ置き、描画のたびに再利用する |
| アルバム画面 | `screen-album`。全 Visit の訪問履歴・絵日記カード・おみやげを一覧表示する画面 |
| 訪問履歴 | `odekakepet::visits::all`（配列JSON）に保存された完了済み Visit の並び |
| おみやげ棚 | アルバム画面内のセクション。ペットが持ち帰ったおみやげをスポット別に表示する |

---

## M5 — 絵日記カード生成

### REQ-M6-001 カードキャンバスのサイズ
> The system shall カードキャンバスを幅 1080px・高さ 1920px（9:16）で生成し、  
> Instagram Stories に貼り付けられる比率で描画する。

### REQ-M6-002 カードの必須要素
> When 絵日記カードが生成される、  
> the system shall 以下の要素をすべてカード上に描画する:
> - 訪問先スポットの背景イラスト（`assets/spots/{spotId}/bg.png`）
> - ペットの名前（`CardData.petName`）
> - 出来事の要約文（`CardData.eventText`、最大 100 文字。超過時は末尾を「…」で切る）
> - 帰宅日付（`CardData.returnedAt` を「YYYY年MM月DD日」形式にフォーマット）
> - サイトのロゴ（`assets/ui/logo.svg`）

### REQ-M6-003 背景フォールバック
> When `assets/spots/{spotId}/bg.png` の読み込みに失敗する、  
> the system shall スポットのテーマカラーを単色背景として代替描画し、エラーをスローしない。

### REQ-M6-004 カードの PNG 保存
> When ユーザーが「絵日記を保存」ボタンを押す、  
> the system shall `canvas.toBlob()` を用いて PNG Blob を生成し、  
> `<a download="odekake-{returnedAt|YYYYMMDD}.png">` によって端末への保存を促す。  
> 外部サービスへの自動アップロードおよび自動投稿は行わない。

### REQ-M6-005 カード生成トリガー
> When ユーザーが帰宅画面（screen-homecoming）の「絵日記をつくる」ボタンを押す、  
> the system shall `CardData` を引数として `card-generator.js` の生成関数を呼び出し、  
> 生成完了後に保存ボタンを有効化する。

### REQ-M6-006 カードプレビュー
> When 絵日記カードの描画が完了する、  
> the system shall カードの縮小プレビュー（CSS で最大幅 360px に収める）を  
> 帰宅画面内に表示する。

### REQ-M6-007 アルバムからの再生成
> When ユーザーがアルバム画面で過去 Visit の「もう一度見る」ボタンを押す、  
> the system shall 対象 Visit の `cardData` を引数としてカード生成関数を呼び出し、  
> REQ-M6-006 と同様のプレビューと保存ボタンを表示する。

---

## M6 — おもいでアルバム

### REQ-M6-010 アルバム画面への遷移
> When ユーザーがホーム画面の「おもいでアルバム」ボタンを押す、  
> the system shall アルバム画面（screen-album）へ遷移する。  
> このボタンはペットの state が `home` のときのみ有効とする。

### REQ-M6-011 訪問履歴の一覧表示
> When アルバム画面が表示される、  
> the system shall `odekakepet::visits::all` に保存されたすべての完了 Visit を  
> 帰宅日時の降順（新しい順）で一覧表示する。  
> 各 Visit の表示には スポット名・帰宅日付・おみやげ有無を含める。

### REQ-M6-012 空状態の表示
> When `odekakepet::visits::all` が空（Visit が0件）のとき、  
> the system shall 「まだ旅の記録がないよ。おでかけしてみよう！」などの空状態メッセージを表示し、  
> 一覧の代わりにホームへ誘導するボタンを表示する。

### REQ-M6-013 絵日記カードの再表示
> When ユーザーがアルバム一覧で Visit カードをタップ／クリックする、  
> the system shall 対象 Visit の `cardData` を展開して出来事の詳細を表示する。  
> `cardData` が存在する Visit には「もう一度見る」ボタンを表示し、  
> REQ-M6-007 に従ってカードを再生成できる。

### REQ-M6-014 おみやげ棚の表示
> When アルバム画面が表示される、  
> the system shall `odekakepet::visits::all` から `souvenirId` が null でない Visit を抽出し、  
> おみやげをスポット別にグループ化して「おみやげ棚」セクションに表示する。  
> 各おみやげはアイコンと表示名を含める。

### REQ-M6-015 おみやげゼロ時の表示
> When まだおみやげを1つも獲得していない、  
> the system shall おみやげ棚に「まだおみやげはないよ」というプレースホルダーを表示する。

### REQ-M6-016 ホームへの戻り
> When ユーザーがアルバム画面の「ホームへ」ボタンを押す、  
> the system shall ホーム画面（screen-home）へ遷移する。

---

## 非機能要件

### REQ-M6-NF-001 Canvas 描画の純粋関数化
> The system shall カード描画ロジックを `src/domain/card-generator.js` に集約し、  
> DOM（canvas 要素への参照）は呼び出し元が渡す引数として受け取る設計とする。  
> `CardData` オブジェクトと `HTMLCanvasElement` を引数に取り、副作用はキャンバスへの描画のみとする。

### REQ-M6-NF-002 XSS 対策
> The system shall CardData 由来の文字列（petName・eventText 等）を  
> Canvas の `fillText` または DOM への `textContent` 挿入のみで使用し、  
> `innerHTML` への代入を行わない。

### REQ-M6-NF-003 localStorage 容量対策
> The system shall 絵日記カードの PNG データを localStorage には保存せず、  
> 必要なときに `CardData` から都度再生成する設計とする。

### REQ-M6-NF-004 テスタビリティ
> The system shall `card-generator.js` の描画ロジックのうち  
> テキスト折り返し・日付フォーマット・文字列トランケートは DOM に依存しない純粋関数として切り出し、  
> 単体テストで検証可能な状態にする。
