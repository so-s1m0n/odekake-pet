/**
 * tests/visit-property.test.js
 * 性質テスト（Property-based testing）: 「訪問は必ず帰宅に至る」。
 * 乱数はシード固定の PRNG で生成し、失敗したときに再現できるようにする。
 * test-runner.html / run-node.mjs 上の describe / it / assert を使用する。
 */

import {
  VISIT_STATUS,
  createVisit,
  isReturnReady,
  completeVisit,
  getVisitTiming,
} from '../src/domain/visit.js';
import { PET_STATE, PET_TYPES, createPet, transitionPetState } from '../src/domain/pet.js';

// ─── シード固定 PRNG（mulberry32） ──────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261116);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const ITERATIONS = 300;
const SPOT_IDS = ['hoshikuzu-kobo', 'umi-no-hiroba', 'mori-no-komichi', 'sora-no-oka', 'yoru-no-machi'];

/** ランダムな Visit（ongoing）を組み立てる */
function randomVisit() {
  const base = createVisit(pick(SPOT_IDS));
  const departedMs = randInt(1_600_000_000_000, 1_800_000_000_000); // 2020年〜2027年あたり
  const durationMs = pick([0, 1, 1_000, 60_000, 3_600_000, randInt(0, 7 * 24 * 3_600_000)]);
  return { ...base, departedAt: new Date(departedMs).toISOString(), durationMs };
}

const departedMsOf = (visit) => new Date(visit.departedAt).getTime();

// ─── 性質1: 帰宅可能性 ──────────────────────────────────────────────────────

describe('性質: 訪問は必ず帰宅に至る', () => {
  it('帰宅時刻を過ぎれば必ず帰宅可能になり、完了状態へ遷移できる', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const visit = randomVisit();
      const excess = randInt(0, 30 * 24 * 3_600_000); // 帰宅時刻から最大30日後
      const now = departedMsOf(visit) + visit.durationMs + excess;

      assert.ok(isReturnReady(visit, now), `反例: 反復${i} で帰宅可能にならない`);

      const cardData = {
        spotId: visit.spotId, petName: 'テスト', petType: 'mameshiba',
        eventText: 'できごと', souvenirId: null, returnedAt: new Date(now).toISOString(),
      };
      const done = completeVisit(visit, 'evt-x', null, cardData);
      assert.equal(done.status, VISIT_STATUS.COMPLETED, '完了状態になる');
      assert.equal(done.eventId, 'evt-x', 'eventId が設定される');
      assert.equal(done.cardData, cardData, 'cardData が設定される');
      assert.equal(visit.status, VISIT_STATUS.ONGOING, '元の Visit は変更されない');
    }
  });

  it('帰宅時刻の境界が正確である（-1ms は不可、ちょうどは可）', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const visit = randomVisit();
      const t0 = departedMsOf(visit);
      assert.ok(isReturnReady(visit, t0 + visit.durationMs), `反例: 反復${i} ちょうどの時刻で false`);
      if (visit.durationMs >= 1) {
        assert.notOk(isReturnReady(visit, t0 + visit.durationMs - 1), `反例: 反復${i} -1ms で true`);
      }
    }
  });

  it('帰宅可能性は単調である（一度 true になったら戻らない）', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const visit = randomVisit();
      const t0 = departedMsOf(visit);
      const a = randInt(-3_600_000, visit.durationMs + 3_600_000);
      const b = a + randInt(0, 3_600_000);
      if (isReturnReady(visit, t0 + a)) {
        assert.ok(isReturnReady(visit, t0 + b), `反例: 反復${i} で true から false に戻った`);
      }
    }
  });

  it('getVisitTiming の不変条件（remainingMs は負にならず、帰宅後は 0）', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const visit = randomVisit();
      const t0 = departedMsOf(visit);
      const now = t0 + randInt(-60_000, visit.durationMs + 60_000);
      const { elapsedMs, remainingMs } = getVisitTiming(visit, now);
      assert.ok(remainingMs >= 0, 'remainingMs は負にならない');
      assert.equal(elapsedMs, now - t0, 'elapsedMs は経過時間と一致');
      assert.equal(remainingMs, Math.max(0, visit.durationMs - elapsedMs), 'remainingMs の定義と一致');
      if (now >= t0 + visit.durationMs) {
        assert.equal(remainingMs, 0, '帰宅時刻後は remainingMs = 0');
      }
    }
  });
});

// ─── 性質2: ペット状態機械の全経路性 ────────────────────────────────────────

describe('性質: ペット状態は行き止まりなく必ず home に戻る', () => {
  it('home → visiting → returning → home の往復が常に成立する', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      let pet = createPet(pick(PET_TYPES), 'テスト', { curiosity: [0.34, 0.33, 0.33], sociability: [0.34, 0.33, 0.33] });
      assert.equal(pet.state, PET_STATE.HOME, '初期状態は home');
      pet = transitionPetState(pet, PET_STATE.VISITING);
      pet = transitionPetState(pet, PET_STATE.RETURNING);
      pet = transitionPetState(pet, PET_STATE.HOME);
      assert.equal(pet.state, PET_STATE.HOME, '往復の終わりは home');
    }
  });

  it('どの状態からも、許可された遷移だけで最大3手で home に戻れる', () => {
    const NEXT = {
      [PET_STATE.HOME]: PET_STATE.VISITING,
      [PET_STATE.VISITING]: PET_STATE.RETURNING,
      [PET_STATE.RETURNING]: PET_STATE.HOME,
    };
    for (const start of Object.values(PET_STATE)) {
      let pet = { ...createPet(PET_TYPES[0], 'テスト', { curiosity: [0.34, 0.33, 0.33], sociability: [0.34, 0.33, 0.33] }), state: start };
      let steps = 0;
      while (pet.state !== PET_STATE.HOME && steps < 3) {
        pet = transitionPetState(pet, NEXT[pet.state]);
        steps++;
      }
      assert.equal(pet.state, PET_STATE.HOME, `${start} から home に戻れる`);
      assert.ok(steps <= 3, '3手以内で戻れる');
    }
  });

  it('許可されていない遷移はすべて例外になる', () => {
    const LEGAL = new Set(['home>visiting', 'visiting>returning', 'returning>home']);
    for (const from of Object.values(PET_STATE)) {
      for (const to of Object.values(PET_STATE)) {
        if (LEGAL.has(`${from}>${to}`)) continue;
        const pet = { ...createPet(PET_TYPES[0], 'テスト', { curiosity: [0.34, 0.33, 0.33], sociability: [0.34, 0.33, 0.33] }), state: from };
        let threw = false;
        try { transitionPetState(pet, to); } catch { threw = true; }
        assert.ok(threw, `${from} → ${to} は例外になるはず`);
      }
    }
  });
});
