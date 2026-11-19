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
