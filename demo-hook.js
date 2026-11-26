// demo-hook.js — TEMPORARY (#BuildHybridAI demo). Revert after shooting.
// 撮影用ハーネス: ?shot=<name> で種データを localStorage に入れ、
// 実ボタンを自動クリックして各画面を作る。準備ができたら
// document.title を 'SHOT-READY' に変える（撮影側の合図）。
// 手順書: projects/buildhybridai/DEMO_CAPTURE_PROCEDURE.md §3.1
// （現行UIに合わせてボタンIDと帰宅ショットの種を調整済み）
import { savePet, saveCurrentVisit, appendVisit, appendFootprint, saveSettings } from './src/store.js';
import { createPet, transitionPetState } from './src/domain/pet.js';
import { createVisit, completeVisit } from './src/domain/visit.js';
import { encodeFriendCode } from './src/domain/odekake-code.js';

const shot = new URLSearchParams(location.search).get('shot') || 'panel';
const WEIGHTS = { curiosity: [1, 3, 6], sociability: [1, 3, 6] };
const KOBO_TEXT = 'もちが小屋をのぞくと、ルミが星あかりのランプを作っていた。\nしばらく見ていたら「手伝ってくれる？」と声をかけられた。\nふたりで完成させたランプは、夜空みたいな色だった。';
const MORI_TEXT = 'もちは標本室の棚にならんだ小さな箱を一つずつ見ていった。\nどれも森の欠片——葉、種、石、羽——がそっとしまわれていた。\nテオが「これが今日の新入りだよ」と木の実を見せてくれた。';

// 再読み込み・撮り直しでも同じ状態になるよう、種を入れる前に消す
for (const key of [
  'odekakepet::pet::current',
  'odekakepet::visit::current',
  'odekakepet::visits::all',
  'odekakepet::footprints::all',
  'odekakepet::settings::app',
]) localStorage.removeItem(key);

function seedPet(state = 'home') {
  let pet = createPet('mameshiba', 'もち', WEIGHTS);
  pet = { ...pet, affinity: 42, experience: { curiosityXp: 5, sociabilityXp: 9 } };
  if (state !== 'home') pet = transitionPetState(pet, state);
  savePet(pet);
  return pet;
}

function completedVisit(spotId, eventId, souvenirId, daysAgo, text) {
  const base = createVisit(spotId);
  const returned = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return completeVisit(base, eventId, souvenirId, {
    spotId, petName: 'もち', petType: 'mameshiba',
    eventText: text, souvenirId, returnedAt: returned,
  });
}

function seedMemory() {
  appendVisit(completedVisit('hoshikuzu-kobo', 'kobo-002', null, 6, KOBO_TEXT));
  appendVisit(completedVisit('hoshikuzu-kobo', 'kobo-001', 'kobo-hoshi-kakera', 3, KOBO_TEXT));
  appendVisit(completedVisit('mori-hyohonshitsu', 'mori-001', 'mori-ki-no-mi', 2, MORI_TEXT));
  appendVisit(completedVisit('hoshikuzu-kobo', 'kobo-002', null, 1, KOBO_TEXT));
}

function seedFootprints() {
  appendFootprint({
    id: 'footprint-1', visitorPetName: 'ゆき', visitorPetType: 'soraaru-penguin',
    visitedAt: '2026-11-25T14:30:00+09:00',
    eventSummary: 'ゆきちゃんと窓のそばで星の話をした。',
    recordedAt: '2026-11-25T18:00:00+09:00',
  });
  appendFootprint({
    id: 'footprint-2', visitorPetName: 'はな', visitorPetType: 'hoshikuzu-usagi',
    visitedAt: '2026-11-24T10:00:00+09:00',
    eventSummary: 'はなちゃんが小屋のランプ作りを手伝ってくれた。',
    recordedAt: '2026-11-24T19:00:00+09:00',
  });
}

// 帰宅画面は「出発済み・帰宅可能」な進行中Visitを置くと、起動時の
// 帰宅処理（main.js）が出来事を生成して帰宅画面へ連れて行く
function seedReturnableVisit() {
  const visit = createVisit('hoshikuzu-kobo');
  visit.departedAt = new Date(Date.now() - 120_000).toISOString();
  saveCurrentVisit(visit);
}

if (['panel', 'odekake', 'privacy', 'album', 'footprints', 'code-modal', 'friend-preview'].includes(shot)) {
  seedPet('home');
  seedMemory();
}
if (shot === 'panel' || shot === 'footprints') seedFootprints();
if (shot === 'card') {
  // ペットは「おでかけ中（visiting）」で置く。帰宅可能な Visit と組になる
  // 実アプリの状態は visiting であり、起動時帰宅処理は
  // visiting → returning → home の遷移を前提とする（home だと例外で真っ白になる）
  seedPet('visiting');
  seedMemory();
  saveSettings({ shareMemoryWithCloud: true }); // 記憶の文脈つきで生成させる
  seedReturnableVisit();
}
if (shot === 'waiting') {
  seedPet('visiting');
  saveCurrentVisit(createVisit('hoshikuzu-kobo'));
}
if (shot === 'homecoming') {
  seedPet('visiting'); // 理由は card と同じ（起動時帰宅処理の遷移前提）
  seedMemory();
  seedReturnableVisit();
}

function isShown(el) {
  const screen = el.closest('.screen');
  return !screen || !screen.hasAttribute('hidden');
}

function click(id) {
  const el = document.getElementById(id);
  if (el && isShown(el)) { el.click(); return true; }
  return false;
}

// 現行UIのボタンID（旧ハーネスの open-odekake-btn / odekake-status-link は廃止）
const actions = {
  panel: [], privacy: [],
  odekake: ['odekake-btn'],
  'code-modal': ['issue-friend-code-btn'],
  waiting: [], // 起動時に待機画面へ自動で遷移する
  homecoming: [],
  card: ['make-card-btn'],
  album: ['open-album-btn'],
  footprints: ['open-footprints-btn'],
  'friend-preview': ['odekake-btn'],
};

// SHOT-READY を出す前に、目的の画面が見えていることを確認する
const readyScreen = {
  panel: 'screen-home', privacy: 'screen-home',
  odekake: 'screen-odekake', 'code-modal': 'screen-home',
  waiting: 'screen-waiting', homecoming: 'screen-homecoming',
  card: 'screen-homecoming', album: 'screen-album',
  footprints: 'screen-footprints', 'friend-preview': 'screen-odekake',
};

let step = 0;
const timer = setInterval(() => {
  const list = actions[shot] || [];
  if (shot === 'friend-preview' && step === 1) {
    const input = document.getElementById('friend-code-input');
    if (input && isShown(input)) {
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
    const target = document.getElementById(readyScreen[shot] || '');
    if (!target || !target.hasAttribute('hidden')) {
      clearInterval(timer);
      document.title = 'SHOT-READY';
    }
  }
}, 300);
