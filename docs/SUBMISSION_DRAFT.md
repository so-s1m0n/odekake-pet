# Devpost 提出ドラフト — Odekake Pet（M8）

作成: 2026-11-16。提出時に Devpost フォームへ転記する。公開リポジトリ化と提出は総一郎さんの承認後。

## 基本情報

- **Project name**: Odekake Pet
- **Tagline（ギャラリー1行）**: A blog pet, resurrected: it wanders off while you're away — and can visit your friends' pets by copy-pasted code.
- **Category**: Resurrection
- **Bonus**: Best Demo（自動対象）。Blog Bonus / Social Blitz は任意（提出時に判断）。

## Description（提出文）

### Summary (for Judges)

Odekake Pet revives the 2000s blog pet as a serverless web app. Your pet takes real-time trips while you're away and returns with a picture-diary card you can post anywhere. Pets visit each other through short text codes — no server, no accounts. Built spec-first with Kiro: every feature lives in `.kiro/specs/` as requirements → design → tasks, guarded by agent hooks and 81 tests including property-based round-trip tests.

### The problem

Blog pets and desktop mascots were a small, beloved genre of the early social web: a creature that lived on your page and made *absence* part of the companionship. The genre died with Flash and blog sidebars. Modern virtual pets are mostly real-time tap games — the quiet charm of "it's out somewhere, doing something, and I'll find out when it's back" is gone.

### What it does

- **Care** for one of three pets; its personality (curiosity / sociability) shapes its adventures.
- **Send it on trips.** It departs on a real timer and returns with an event story and, sometimes, a souvenir.
- **Get a picture diary.** Each trip becomes a designed 1080×1920 PNG card, made to be saved and posted anywhere.
- **Keep the memories.** An album holds the souvenir shelf, the full trip log, and every diary card.
- **Visit friends.** Issue an Odekake Code for your pet. A friend pastes it, and *their* pet travels to *your* pet's home. Afterwards a Footprint Code travels back and lands in the host's footprint list — the blog-era "your pet visited my page" loop, rebuilt as two copy-pasted strings with checksums.

### How it works

Vanilla JS modules, zero build, zero backend. A strict pet/visit state machine (`home → visiting → returning → home`, illegal transitions throw), personality- and time-aware event generation, Canvas-rendered diary cards, and `localStorage` persistence with schema migrations (v1→v2→v3). Friend codes are JSON payloads encoded as Base64URL with an FNV-1a checksum; tampered codes are rejected with a friendly reason.

## Kiro write-up（提出文）

### Specs drove everything

Development followed Kiro's spec workflow end to end. Each milestone — pet core, trips & events, diary & album, friend visits — began as a spec in `.kiro/specs/` with numbered EARS-style requirements, a design document, and a task list small enough to verify one by one.

One spec sentence became the project's north star. The friend-visit requirements state that *"a code round-trip must not lose any data."* That single line is now a property-based test: 400 randomized code round-trips (friend codes and footprint codes) must reproduce every field exactly, on every test run.

### Hooks as guardrails

Two agent hooks in `.kiro/hooks/` run throughout development:

- `run-tests-on-save` — every source edit triggers a syntax check plus the full test suite, so a broken state machine or codec fails within seconds, not at submission time.
- `secret-check-before-commit` — before committing, a script verifies that `.kiro/` contains only shareable material (specs/hooks/steering), that no credential-like files slipped in, and that no secret patterns appear in tracked files.

### What Kiro changed

Working CLI-first with tight spec → task → test loops let a single developer ship a complete loop (care → trip → diary → album → friend visits) with migration-safe storage and a tested codec, instead of a demo that only works on the happy path.

## 提出チェックリスト（公式ルール準拠）

- [ ] 公開 GitHub リポジトリ（ルートに `/.kiro`、`.gitignore` に入れない）※承認後
- [ ] LICENSE がリポジトリ上部で検出可能（MIT、作成済み）
- [ ] 動作するアプリ URL（GitHub Pages を想定）※承認後
- [ ] デモ動画: 3分未満、YouTube 公開 ※未作成
- [ ] 説明文（本ドラフト）と Kiro write-up（本ドラフト）
- [ ] カテゴリ = Resurrection を明示
- [ ] 4,000クレジット申請（任意、締切 2026-12-01 12:00 PT）— 開発がほぼ完了しているため申請しない判断もあり。提出一式と一緒に判断する
