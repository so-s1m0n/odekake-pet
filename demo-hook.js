/**
 * demo-hook.js — TEMPORARY demo-capture harness v2 (not part of the app).
 * Usage: index.html?shot=<name> with this module loaded BEFORE src/main.js.
 * Clears localStorage, seeds demo data, then performs the shot's UI actions.
 * v2 fixes (from the 2026-11-19 first shoot):
 *  - real button id is 'odekake-btn' (not 'open-odekake-btn')
 *  - homecoming/card/footprint-issued: seed an IN-PROGRESS visit whose
 *    departedAt is in the past; main.js completes it on startup itself
 *  - clicks are gated on visibility (never click inside a hidden screen)
 *  - localStorage.clear() first, so shots never contaminate each other
 */
import { savePet, saveCurrentVisit, appendVisit, appendFootprint } from './src/store.js';
import { createPet, transitionPetState } from './src/domain/pet.js';
import { createVisit, completeVisit } from './src/domain/visit.js';
import { encodeFriendCode } from './src/domain/odekake-code.js';
import { saveSyntheticSpot } from './src/domain/synthetic-spot.js';

localStorage.clear();

const shot = new URLSearchParams(location.search).get('shot') || 'setup';

const WEIGHTS = { curiosity: [1, 3, 6], sociability: [1, 3, 6] };
const EVENT_TEXT = 'もちは工房の棚の隙間に、ちいさな星のかけらをみつけた。\nきらきらと光るそれを、そっと手に取るとあたたかかった。\nルミが「それはきみにあげる」とにっこりした。';
const PAST = () => new Date(Date.now() - 120_000).toISOString();

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
  // In-progress visit that is already return-ready: main.js runs the
  // homecoming flow on startup and lands on the homecoming screen.
  seedPet('visiting');
  const v = createVisit('hoshikuzu-kobo');
  v.departedAt = PAST();
  saveCurrentVisit(v);
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
  seedPet('visiting');
  saveSyntheticSpot({
    id: 'friend-demo', displayName: 'ゆき のおうち', themeColor: '#b8d4e8', icon: '🏠',
    events: [{
      id: 'friend-001', souvenirId: null, conditions: null,
      text: '{petName}が {hostName} のおうちに着くと、{hostName} がドアの前で待っていてくれた。\n「よく来たね」と言われて、{petName} はなんだか誇らしい気持ちになった。\nふたりはさっそく、お部屋のまんなかで遊びはじめた。',
    }],
    hostPet: { name: 'ゆき', type: 'soraaru-penguin', personality: { curiosity: 2, sociability: 1 } },
  });
  const v = { ...createVisit('friend-demo'), isFriendVisit: true };
  v.departedAt = PAST();
  saveCurrentVisit(v);
}

function click(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (el.closest('[hidden]')) return false; // screen not shown yet / button hidden
  el.click();
  return true;
}

const actions = {
  home: [], setup: [], waiting: [], homecoming: [],
  odekake: ['odekake-btn'],
  'code-modal': ['issue-friend-code-btn'],
  card: ['make-card-btn'],
  album: ['open-album-btn'],
  footprints: ['open-footprints-btn'],
  'footprint-issued': ['issue-footprint-code-btn'],
  'friend-preview': ['odekake-btn'],
};

let step = 0;
const timer = setInterval(() => {
  const list = actions[shot] || [];
  if (shot === 'friend-preview' && step === 1) {
    const input = document.getElementById('friend-code-input');
    if (input && !input.closest('[hidden]')) {
      const { code } = encodeFriendCode({
        v: 1, petName: 'ゆき', petType: 'soraaru-penguin',
        curiosity: 2, sociability: 1, issuedAt: new Date().toISOString(),
      });
      input.value = code;
      if (click('verify-friend-code-btn')) step++;
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
