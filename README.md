# Odekake Pet — おでかけペット

A tiny pet that lives in your browser, wanders off while you're away, and comes home with a picture diary.

**Kiroween 2026 — Resurrection category.**

## Summary (for Judges)

- **What:** A serverless web app that revives the 2000s "blog pet" — a small companion that lived on your blog sidebar. Your pet leaves on little trips while you are away, and when it returns it brings back a shareable picture-diary card (a vertical PNG, ready to post anywhere).
- **The twist:** Pets can visit *each other's* homes. You hand a friend a short text code; their pet can travel to your pet's home, and a "footprint code" travels back as proof of the visit. No server, no accounts, no sign-up — the whole exchange is two copy-pasted strings.
- **How it was built:** Spec-driven with Kiro. Every feature started as a spec in [`.kiro/specs/`](.kiro/specs/) (requirements → design → tasks), was implemented task by task, and is guarded by agent hooks and a test suite that includes property-based tests.
- **Try it:** Open `index.html` via any static file server (see "Running locally"). Everything runs client-side; data lives in `localStorage`.

## Why a blog pet?

Blog pets and desktop mascots were a beloved genre of the early social web — a small creature that lived on *your* page, reacted to *your* care, and made absence feel like part of the fun. The genre died with the platforms that hosted it (Flash, blog sidebars, portal widgets).

Odekake Pet resurrects the genre's core idea — **asynchronous companionship** — with modern web tech:

- Absence is the content. The pet's trips happen on a real timer; what it did is revealed only when it comes home.
- The souvenir is a picture diary: a generated card (1080×1920 PNG) you can save and post to any social platform. Sharing happens outside the app, so the app needs no backend at all.
- Friend visits recreate the "my pet visited your page" loop of the blog era, rebuilt as checksummed text codes that work over any chat app.

## Features

- **Care loop** — feed, play, and watch your pet's affinity grow; the pet's personality (curiosity / sociability) shapes its adventures.
- **Trips (Odekake)** — pick a destination; the pet departs, time passes, and it returns with an event story and sometimes a souvenir.
- **Picture diary cards** — every trip can be turned into a designed, shareable PNG card.
- **Memory album** — souvenirs on a shelf, a log of every trip, and re-viewable diary cards.
- **Friend visits** — issue an "Odekake Code" for your pet; a friend pastes it to send *their* pet to your pet's home. After the visit, a "Footprint Code" travels back and is recorded in the host's footprint list ("Yuki-chan came to play 🐧").
- **Zero backend** — vanilla JS modules, `localStorage` persistence with schema migrations, and a strict state machine (`home → visiting → returning → home`).

## How it works

| Area | Implementation |
| --- | --- |
| State machine | `src/domain/pet.js`, `src/domain/visit.js` — transitions are explicit; illegal transitions throw. |
| Event generation | `src/domain/event-generator.js` — templates filtered by personality and time of day, with graceful fallbacks. |
| Friend codes | `src/domain/odekake-code.js` — JSON payload → Base64URL + FNV-1a checksum; tampered or truncated codes are rejected with a friendly reason. |
| Diary cards | `src/domain/card-generator.js` — Canvas rendering at 1080×1920. |
| Storage | `src/store.js` — the only module that touches `localStorage`; schema versioning with migrations (v1→v2→v3). |

## Built with Kiro

This project was developed spec-first with Kiro CLI:

- **Specs:** [`.kiro/specs/`](.kiro/specs/) contains requirements (EARS-style, numbered `REQ-*`), design documents, and task lists for every milestone (pet core, trips & events, diary & album, friend visits). One sentence from the friend-visit spec — *"a code round-trip must not lose any data"* — became a property-based test that runs 400 randomized round-trips on every test pass.
- **Hooks:** [`.kiro/hooks/`](.kiro/hooks/) — `run-tests-on-save` runs the full suite whenever a source file is edited; `secret-check-before-commit` scans staged files for credential-like content before any commit.
- **Tests:** 81 checks — unit tests, state-machine invariants, and two property-based test suites (visit timing/transitions, code round-trips).

## Running locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No build step, no dependencies.

## Testing

```bash
TZ=Asia/Tokyo node tests/run-node.mjs   # headless
# or open tests/test-runner.html in a browser
```

## License

MIT — see [LICENSE](LICENSE).
