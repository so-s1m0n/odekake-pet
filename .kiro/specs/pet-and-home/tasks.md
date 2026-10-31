# 実装タスク — ペット登録とホーム画面（M1/M2）

対象スペック: `.kiro/specs/pet-and-home/`  
関連要件: REQ-001 〜 REQ-024

---

## タスク分解

### T-01 静的データファイルの作成

**ファイル**: `data/pets.json`  
**依存**: なし  
**対応要件**: REQ-002, REQ-003

- [ ] ペット種類3種（hoshikuzu-usagi / soraaru-penguin / mameshiba）の定義
- [ ] 各種類の表示名（日本語）
- [ ] 性格パラメータ（curiosity / sociability）の重み配列

---

### T-02 ドメインロジック — Petエンティティ

**ファイル**: `src/domain/pet.js`  
**依存**: なし（純粋関数。DOM・localStorage不依存）  
**対応要件**: REQ-004, REQ-005, REQ-011, REQ-012, REQ-017

- [ ] `PET_STATE` 定数の定義（HOME / VISITING / RETURNING）
- [ ] `PET_TYPES` 配列の定義
- [ ] `createPet(type, name, personalityWeights)` — バリデーション（名前1〜12文字）込みで新規Petを返す
- [ ] `applyCareAction(pet, action)` — なかよし度+1（上限99）した新しいPetを返す
- [ ] `transitionPetState(pet, nextState)` — 正規遷移のみ許可。不正遷移はErrorをthrow

---

### T-03 ストア — localStorageの一元管理

**ファイル**: `src/store.js`  
**依存**: `src/domain/pet.js`（Petの型参照）  
**対応要件**: REQ-017, REQ-018, REQ-019

- [ ] `SCHEMA_VERSION` 定数の定義（現在値: 1）
- [ ] `loadPet()` — `odekakepet::pet::current` を読み込み、Pet | null を返す
- [ ] `savePet(pet)` — `odekakepet::pet::current` にJSONとして保存。schemaVersionを付与する
- [ ] `hasPet()` — boolean を返す
- [ ] `migrate()` — スキーマバージョン不一致時のマイグレーション（v1→v2等。現在はv1固定なのでスタブ）

---

### T-04 ルーター — 画面遷移の管理

**ファイル**: `src/router.js`  
**依存**: なし  
**対応要件**: REQ-001, REQ-005, REQ-015

- [ ] `showScreen(screenId)` — 全screenを`hidden`にし、指定IDのscreenだけ表示する
- [ ] `goSetup()` — `screen-setup` を表示する
- [ ] `goHome()` — `screen-home` を表示する

---

### T-05 ペット登録画面のUI

**ファイル**: `src/screens/setup.js`  
**依存**: `src/domain/pet.js`, `src/store.js`, `src/router.js`, `data/pets.json`  
**対応要件**: REQ-001〜REQ-007

- [ ] `initSetupScreen(petTypes)` — プリセットカード・名前入力・確定ボタンのイベントハンドラを登録する
- [ ] プリセット選択: `is-selected` クラスの切り替えとプレビューSVGの更新
- [ ] 名前入力: 文字数カウンタのリアルタイム更新
- [ ] 確定ボタンの活性/非活性制御（ペット選択済み + 名前1〜12文字で活性化）
- [ ] `confirmSetup()` — `createPet` → `savePet` → `router.goHome()` → `initHomeScreen()`

---

### T-06 ホーム画面のUI

**ファイル**: `src/screens/home.js`  
**依存**: `src/domain/pet.js`, `src/store.js`  
**対応要件**: REQ-008〜REQ-016, REQ-018

- [ ] `initHomeScreen()` — `loadPet()` して画面全体を描画する
- [ ] `renderPet(pet)` — ペット名・なかよし度・SVGイラスト（idle状態）を更新する
- [ ] `renderCareActions(pet)` — `state === 'home'` のときボタン有効化、それ以外はdisabled
- [ ] `onCareAction(action)` — `applyCareAction` → `savePet` → `renderPet`。アニメーション中は連打防止
- [ ] `playCareAnimation(action)` — 対応SVGを2秒表示してidleに戻す
- [ ] おでかけ中表示（`is-away` クラス付与、テキスト変更）
- [ ] 「おでかけへ」ボタン: クリックで `router.goOdekake()` を呼ぶ（M3スタブ）
- [ ] アルバムリンクの表示（M6スタブ）

---

### T-07 アプリのエントリポイント

**ファイル**: `src/main.js`  
**依存**: `src/store.js`, `src/router.js`, `src/screens/setup.js`, `src/screens/home.js`  
**対応要件**: REQ-001, REQ-018, REQ-019

- [ ] `DOMContentLoaded` で `migrate()` を実行
- [ ] `hasPet()` の結果で `goSetup()` / `goHome()` を分岐する
- [ ] 各画面の `init*` 関数を呼び出す

---

### T-08 スタイルシート

**ファイル群**: `styles/base.css`, `styles/layout.css`, `styles/components.css`, `styles/screens/setup.css`, `styles/screens/home.css`  
**依存**: なし  
**対応要件**: REQ-024

- [ ] `base.css`: CSSリセット・カスタムプロパティ（カラー・フォント・スペーシング変数）
- [ ] `layout.css`: `.screen` クラス・スマートフォン縦向き基準のレイアウト（max-width 430px）
- [ ] `components.css`: `.care-btn`・`.preset-card`・`.affinity-bar`・進捗バーなどの共通コンポーネント
- [ ] `screens/setup.css`: プリセットカード一覧・プレビュー・名前入力フォーム固有のスタイル
- [ ] `screens/home.css`: ペットの部屋・なかよし度バー・おでかけボタン固有のスタイル

---

### T-09 HTMLエントリポイント

**ファイル**: `index.html`  
**依存**: 全ファイル  
**対応要件**: REQ-020, REQ-021, REQ-023, REQ-024

- [x] `<link>` でCSSファイルを読み込む（base → layout → components → screen固有）
- [x] `<script type="module" src="src/main.js">` で起動
- [x] `<section id="screen-setup">` と `<section id="screen-home">` を含むDOM構造
- [x] インラインSVGによるペット3種のイラスト（idle / eat / stroke / speak / away 状態）を`<template>`タグで定義

---

### T-10 テスト

**ファイル**: `tests/pet.test.js`, `tests/test-runner.html`  
**依存**: `src/domain/pet.js`  
**対応要件**: REQ-004, REQ-011, REQ-012（テストによる動作保証）

- [ ] `createPet`: 正常系（名前1文字・12文字）
- [ ] `createPet`: 異常系（空文字・13文字でErrorをthrow）
- [ ] `applyCareAction`: なかよし度が0→1に増加すること
- [ ] `applyCareAction`: なかよし度が99のとき99のまま（上限制御）
- [ ] `transitionPetState`: `home → visiting` の正常遷移
- [ ] `transitionPetState`: `home → returning` の不正遷移でErrorをthrow
- [ ] `test-runner.html`: ブラウザで開いてテストを一覧表示するHTMLランナー

---

## 実装順序

```
T-01（pets.json）
  ↓
T-02（domain/pet.js）
  ↓
T-03（store.js）・T-04（router.js）  ← 並行可
  ↓
T-05（setup.js）・T-06（home.js）    ← 並行可
  ↓
T-07（main.js）
  ↓
T-08（CSS群）・T-10（テスト）         ← 並行可
  ↓
T-09（index.html）
```

---

## 完了基準

- [ ] `python3 -m http.server` で配信し、ブラウザで `http://localhost:8000` を開いたとき、ペット登録画面が表示される
- [ ] ペットを登録後、ホーム画面が表示される
- [ ] 世話アクション3種がそれぞれ動作し、なかよし度が増加する
- [ ] ブラウザをリロードしても登録済みペットのホーム画面が表示される（REQ-018）
- [ ] `tests/test-runner.html` を開き、全テストがパスする
