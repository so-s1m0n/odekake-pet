# ディレクトリ構成と命名規則 — おでかけペット

## ディレクトリツリー

```
odekake-pet/
├── index.html              # エントリポイント（1ファイル。ルーティングはJSで行う）
├── CONCEPT.md              # 企画書（変更しない）
│
├── .kiro/                  # Kiro開発基盤文書（ルートに必須）
│   ├── steering/
│   │   ├── product.md
│   │   ├── tech.md
│   │   └── structure.md    # 本ファイル
│   ├── specs/
│   │   ├── pet-and-home/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md    # 実装タスク分解（実装フェーズで作成）
│   │   ├── odekake-and-event/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md
│   │   └── diary-and-album/
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   └── hooks/              # 自動化フック設定
│
├── src/                    # アプリケーションのJavaScript
│   ├── main.js             # エントリポイント。画面の初期化と状態の読み込み
│   ├── store.js            # 中央状態管理。localStorageの読み書きはここだけ
│   ├── router.js           # 画面遷移の管理
│   │
│   ├── domain/             # ドメインロジック（純粋関数。DOMに依存しない）
│   │   ├── pet.js          # Petエンティティ。状態遷移のロジック
│   │   ├── visit.js        # Visitエンティティ。おでかけの開始・完了処理
│   │   ├── event-generator.js  # イベント文の生成・分岐ロジック
│   │   ├── odekake-code.js # おでかけコードのエンコード・デコード
│   │   └── card-generator.js   # 絵日記カードのCanvas描画ロジック
│   │
│   ├── screens/            # 画面単位のUIモジュール
│   │   ├── home.js         # ホーム画面（ペットの部屋）
│   │   ├── setup.js        # ペット登録画面
│   │   ├── odekake.js      # おでかけ選択・出発画面
│   │   ├── waiting.js      # 不在中の「旅の途中メモ」画面
│   │   ├── homecoming.js   # 帰宅・絵日記生成画面
│   │   └── album.js        # おもいでアルバム画面
│   │
│   └── utils/              # 汎用ユーティリティ
│       ├── date.js         # 日付フォーマット（タイムゾーン考慮）
│       └── dom.js          # DOM操作のヘルパー（createElement系）
│
├── styles/                 # スタイルシート
│   ├── base.css            # リセット・フォント・カスタムプロパティ（変数）
│   ├── layout.css          # 画面共通のレイアウト
│   ├── components.css      # ボタン・カード・バッジなど再利用コンポーネント
│   └── screens/            # 画面固有のスタイル
│       ├── home.css
│       ├── setup.css
│       ├── odekake.css
│       └── album.css
│
├── assets/                 # 静的素材
│   ├── pets/               # ペットのイラスト素材
│   │   ├── hoshikuzu-usagi/
│   │   │   ├── idle.png    # 静止状態
│   │   │   ├── eat.png     # 餌を食べる
│   │   │   ├── stroke.png  # なでられる
│   │   │   └── speak.png   # 声かけへの反応
│   │   ├── soraaru-penguin/
│   │   │   └── ...
│   │   └── mameshiba/
│   │       └── ...
│   │
│   ├── spots/              # 訪問先スポットの背景・素材
│   │   ├── hoshikuzu-kobo/ # 月夜の小屋
│   │   │   ├── bg.png      # 背景イラスト（絵日記カード用）
│   │   │   └── thumb.png   # サムネイル（スポット選択UI用）
│   │   ├── mori-hyohonshitsu/  # 森の標本室
│   │   │   └── ...
│   │   └── tokeidai-kitchen/   # 時計塔キッチン
│   │       └── ...
│   │
│   ├── souvenirs/          # おみやげ素材
│   │   ├── hoshi-no-kakera.png
│   │   └── ...
│   │
│   └── ui/                 # UIアイコン・ロゴ等
│       ├── logo.svg
│       └── icons/
│
├── data/                   # 静的データファイル
│   ├── events.json         # イベント文テンプレートのデータ
│   └── spots.json          # スポット定義（名称・説明・テーマ）
│
└── tests/                  # 単体テスト
    ├── test-runner.html    # ブラウザで開いてテストを実行するHTMLファイル
    ├── pet.test.js
    ├── visit.test.js
    ├── odekake-code.test.js
    └── event-generator.test.js
```

## 命名規則

### ファイル・ディレクトリ名
- **ケバブケース**（小文字・ハイフン区切り）を使う: `pet-state.js`、`event-generator.js`
- 画面モジュールはHTMLのid属性と対応する名前にする（`home.js` → `<section id="screen-home">`）
- テストファイルは対象ファイル名に `.test.js` を付ける: `pet.js` → `pet.test.js`

### JavaScriptの識別子
- 変数・関数: **キャメルケース**（`petState`、`generateEvent`）
- クラス・コンストラクタ: **パスカルケース**（`PetEntity`）
- 定数（変更不可の値）: **アッパースネークケース**（`PET_STATE`、`MAX_CODE_LENGTH`）
- プライベートな関数（モジュール内部のみ）: アンダースコアプレフィクス不要。`export` しないことで表現する

### CSSクラス名
- BEMに近い形式を採用する: `block__element--modifier`
- ブロック名はケバブケース: `.pet-card`、`.home-screen`
- 状態クラスは `is-` プレフィクス: `is-visiting`、`is-active`
- JSから操作するクラスは `js-` プレフィクスで区別: `js-care-button`

### localStorageキー
- フォーマット: `odekakepet::{entity}::{identifier}`
- 例:
  - `odekakepet::pet::current` — 現在のペットのデータ（JSON）
  - `odekakepet::visits::all` — 訪問履歴の配列（JSON）
  - `odekakepet::souvenirs::all` — 獲得おみやげの配列（JSON）
  - `odekakepet::settings::version` — データスキーマのバージョン番号

### 素材ファイル名
- ペット素材: `{ペット種類ID}/{状態}.{拡張子}`
  - 状態: `idle`（静止）、`eat`（餌）、`stroke`（なでる）、`speak`（声かけ）、`away`（おでかけ中）
- スポット素材: `{スポットID}/{用途}.{拡張子}`
  - 用途: `bg`（絵日記カード背景）、`thumb`（選択画面サムネイル）
- おみやげ素材: `{おみやげID}.png`（ケバブケース。例: `hoshi-no-kakera.png`）

### IDの体系
- ペット種類: `hoshikuzu-usagi`、`soraaru-penguin`、`mameshiba`（W0で確定）
- スポット: `hoshikuzu-kobo`、`mori-hyohonshitsu`、`tokeidai-kitchen`（W0で確定）
- おみやげ: スポットIDプレフィクス + 名称（例: `kobo-hoshi-kakera`）

## データスキーマのバージョン管理

`localStorage` のデータスキーマが変わった場合の移行を管理するため:
- `odekakepet::settings::version` に現在のスキーマバージョン（整数）を保存する
- アプリ起動時にバージョンを確認し、古いスキーマの場合はマイグレーション処理を実行する
- マイグレーション関数は `store.js` に `migrate_v{N}_to_v{N+1}` の命名で実装する

## `.kiro` ディレクトリの扱い

- `.kiro/` はリポジトリに含める（提出条件）
- `.kiro/` にアプリのソースコードや素材は置かない
- `~/.kiro/`（Kiroホームディレクトリ）と混同しない。セッション履歴等は `~/.kiro/` に留まる
