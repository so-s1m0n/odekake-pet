# デモ動画の台本と撮影手順（M8）

作成: 2026-11-16。尺は2分20秒前後（上限3分）。ナレーションは英語（審査員向け）。
冒頭15秒に「課題」と「完成した絵日記カード」を置く（contest_winning_playbook.md の方針）。

## 撮影方法（確定事項）

- この VM の Chromium はブラウザ基盤経由でしか起動できない（"Hatch WebGL domain policy" エラーで直接起動不可を実測）。したがって画面キャプチャは、アプリを公開ホスティング（GitHub Pages）へ出した後に実ブラウザで行う。
- キャプチャ用ハーネス（demo-hook.js）は作成・検証済みの設計を下に残す。公開後に同じ手順で撮る。
  - `index.html` の main.js の直前に `<script type="module" src="demo-hook.js"></script>` を一時的に差し込む（撮影後に外す）。
  - フックは `?shot=<name>` を読み、localStorage に種データを入れ、ブート後に実ボタンをクリックして各画面を作る。
  - ショット一覧: setup / home（足跡通知つき）/ odekake / waiting / homecoming / card（カード生成後）/ album / code-modal / friend-preview（検証成功表示）/ footprints / footprint-issued（足跡コードモーダル）。
  - 種データ: ペット「もち」（まめしば、なかよし度42）、星屑工房の完了訪問＋おみやげ、足跡2件（ゆき🐧・はな🐰）。

## 台本（ナレーションと画面）

| 時間 | 画面 | ナレーション（英語） |
| --- | --- | --- |
| 0:00–0:12 | 絵日記カードの実物 → タイトル | "Twenty years ago, a tiny pet lived on your blog. It wandered off while you were away — and you never knew what it did until it came home. This is that pet, resurrected." |
| 0:12–0:35 | setup → home、世話 | "Meet your pet. Feed it, play with it, and it grows attached to you. Its personality — how curious, how social — quietly shapes every trip it takes." |
| 0:35–1:05 | odekake → waiting → homecoming | "Send it out, and it leaves on a real timer. Absence is the game. When it returns, it brings back a story — and sometimes a souvenir." |
| 1:05–1:25 | card → album | "Every trip becomes a picture diary: a designed card you can save and post anywhere. Your album keeps the souvenirs, the stories, and every card." |
| 1:25–2:00 | code-modal → friend-preview → footprint-issued → footprints | "And pets can visit each other. Hand a friend this code — their pet travels to your pet's home. A footprint code travels back as proof. No server. No accounts. Just two copy-pasted strings, protected by a checksum." |
| 2:00–2:20 | .kiro/specs とテスト全パス → 締め | "Built spec-first with Kiro: every feature began as a written spec, guarded by agent hooks and eighty-one tests — including property tests proving a code round-trip never loses data. Odekake Pet. The blog pet, back from the dead." |

## 組み立て

- キャプチャ（480×960 @2x）を ffmpeg で連結し、TTS ナレーションを載せる。BGM は著作権フリーの自作/生成のみ（ルールで第三者の著作権音楽は不可）。
- YouTube に公開設定でアップロード（"Not for Kids" にしない）。アップロード自体は提出一式の承認に含める。

## 付録: demo-hook.js（撮影用ハーネス、検証済み）

```javascript
/**
 * demo-hook.js — TEMPORARY demo-capture harness (not part of the app).
 * Usage: index.html?shot=<name> with this module loaded BEFORE src/main.js.
 * Seeds localStorage, then performs the shot's UI actions after bootstrap.
 */
import { savePet, saveCurrentVisit, appendVisit, appendFootprint } from './src/store.js';
import { createPet, transitionPetState } from './src/domain/pet.js';
import { createVisit, completeVisit } from './src/domain/visit.js';
import { encodeFriendCode } from './src/domain/odekake-code.js';
import { saveSyntheticSpot } from './src/domain/synthetic-spot.js';

const shot = new URLSearchParams(location.search).get('shot') || 'setup';

const WEIGHTS = { curiosity: [1, 3, 6], sociability: [1, 3, 6] };
const EVENT_TEXT = 'もちは工房の棚の隙間に、ちいさな星のかけらをみつけた。\nきらきらと光るそれを、そっと手に取るとあたたかかった。\nルミが「それはきみにあげる」とにっこりした。';

function seedPet(state = 'home') {
  let pet = createPet('mameshiba', 'もち', WEIGHTS);
  pet = { ...pet, affinity: 42 };
  if (state !== 'home') pet = transitionPetState(pet, state);
  savePet(pet);
  return pet;
}

function completedVisit(spotId, souvenirId, daysAgo) {
  const base = createVisit(spotId);
  const returned = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return completeVisit(base, 'kobo-001', souvenirId, {
    spotId, petName: 'もち', petType: 'mameshiba',
    eventText: EVENT_TEXT, souvenirId, returnedAt: returned,
  });
}

function seedFootprints() {
  appendFootprint({
    id: 'footprint-1', visitorPetName: 'ゆき', visitorPetType: 'soraaru-penguin',
    visitedAt: '2026-11-15T14:30:00+09:00',
    eventSummary: 'ゆきちゃんと窓のそばで星の話をした。',
    recordedAt: '2026-11-15T18:00:00+09:00',
  });
  appendFootprint({
    id: 'footprint-2', visitorPetName: 'はな', visitorPetType: 'hoshikuzu-usagi',
    visitedAt: '2026-11-14T10:00:00+09:00',
    eventSummary: 'はなちゃんが工房のランプ作りを手伝ってくれた。',
    recordedAt: '2026-11-14T19:00:00+09:00',
  });
}

if (shot === 'home' || shot === 'odekake' || shot === 'code-modal' || shot === 'friend-preview') {
  seedPet('home');
  if (shot === 'home') seedFootprints();
}
if (shot === 'waiting') {
  seedPet('visiting');
  saveCurrentVisit(createVisit('hoshikuzu-kobo'));
}
if (shot === 'homecoming' || shot === 'card') {
  seedPet('home');
  saveCurrentVisit(completedVisit('hoshikuzu-kobo', 'kobo-hoshi-kakera', 0));
}
if (shot === 'album') {
  seedPet('home');
  appendVisit(completedVisit('hoshikuzu-kobo', 'kobo-hoshi-kakera', 1));
  appendVisit(completedVisit('hoshi-matsuri-hiroba', null, 3));
}
if (shot === 'footprints') {
  seedPet('home');
  seedFootprints();
}
if (shot === 'footprint-issued') {
  seedPet('home');
  saveSyntheticSpot({
    id: 'friend-demo', displayName: 'ゆき のおうち', themeColor: '#b8d4e8', icon: '🏠',
    events: [], hostPet: { name: 'ゆき', type: 'soraaru-penguin', personality: { curiosity: 2, sociability: 1 } },
  });
  const v = { ...createVisit('friend-demo'), isFriendVisit: true };
  saveCurrentVisit(completeVisit(v, 'friend-001', null, {
    spotId: 'friend-demo', petName: 'もち', petType: 'mameshiba',
    eventText: 'もちが ゆき のおうちに着くと、ゆき がドアの前で待っていてくれた。\n「よく来たね」と言われて、もち はなんだか誇らしい気持ちになった。',
    souvenirId: null, returnedAt: new Date().toISOString(),
  }));
}

function click(id) {
  const el = document.getElementById(id);
  if (el) { el.click(); return true; }
  return false;
}

const actions = {
  home: [], setup: [],
  odekake: ['open-odekake-btn'],
  'code-modal': ['issue-friend-code-btn'],
  waiting: ['odekake-status-link'],
  homecoming: [],
  card: ['make-card-btn'],
  album: ['open-album-btn'],
  footprints: ['open-footprints-btn'],
  'footprint-issued': ['issue-footprint-code-btn'],
  'friend-preview': ['open-odekake-btn'],
};

let step = 0;
const timer = setInterval(() => {
  const list = actions[shot] || [];
  if (shot === 'friend-preview' && step === 1) {
    const input = document.getElementById('friend-code-input');
    if (input) {
      const { code } = encodeFriendCode({
        v: 1, petName: 'ゆき', petType: 'soraaru-penguin',
        curiosity: 2, sociability: 1, issuedAt: new Date().toISOString(),
      });
      input.value = code;
      click('verify-friend-code-btn');
      step++;
    }
    return;
  }
  if (step < list.length) {
    if (click(list[step])) step++;
  } else {
    clearInterval(timer);
    document.title = 'SHOT-READY';
  }
}, 300);
```
