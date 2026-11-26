/**
 * tests/memory.test.js
 * src/domain/memory.js の単体テスト。
 * 記憶の導出・経験と性格の形成・日記要約・出来事の反復回避を検証する。
 */

import {
  XP_THRESHOLDS,
  emptyExperience,
  normalizeExperience,
  growthSteps,
  effectivePersonality,
  personalityStage,
  experienceFromEvent,
  applyExperience,
  deriveMemory,
  buildMemoryDigest,
} from '../src/domain/memory.js';
import { generateEvent } from '../src/domain/event-generator.js';

// ─── フィクスチャ ────────────────────────────────────────────────────────────

const SPOT = {
  id: 'spot-a',
  displayName: '場所A',
  events: [
    { id: 'a-plain', text: 'ふらっと。', souvenirId: null, conditions: null },
    {
      id: 'a-cur', text: '珍しいもの。', souvenirId: null,
      conditions: { curiosity: [2], sociability: null, timeOfDay: null },
    },
    {
      id: 'a-soc', text: 'みんなと。', souvenirId: 'sv-1',
      conditions: { curiosity: null, sociability: [2], timeOfDay: null },
    },
  ],
  souvenirs: [{ id: 'sv-1', displayName: 'おみやげ1', icon: '⭐', spotId: 'spot-a' }],
};

const SPOTS = [
  SPOT,
  { id: 'spot-b', displayName: '場所B', events: [], souvenirs: [] },
];

function visit(spotId, eventId, souvenirId = null) {
  return {
    id: `visit-${spotId}-${eventId}-${Math.random()}`,
    spotId,
    departedAt: '2026-11-20T10:00:00.000Z',
    durationMs: 60000,
    status: 'completed',
    eventId,
    souvenirId,
    cardData: null,
  };
}

// ─── normalizeExperience / growthSteps ──────────────────────────────────────

describe('normalizeExperience', () => {
  it('undefined は空の経験値になる', () => {
    assert.deepEqual(normalizeExperience(undefined), emptyExperience());
  });

  it('負数や小数は 0 に丸める', () => {
    assert.deepEqual(
      normalizeExperience({ curiosityXp: -3, sociabilityXp: 1.5 }),
      { curiosityXp: 0, sociabilityXp: 0 },
    );
  });

  it('正の整数はそのまま保持する', () => {
    assert.deepEqual(
      normalizeExperience({ curiosityXp: 5, sociabilityXp: 2 }),
      { curiosityXp: 5, sociabilityXp: 2 },
    );
  });
});

describe('growthSteps', () => {
  it('しきい値ごとに段階が上がる', () => {
    assert.equal(growthSteps(0), 0);
    assert.equal(growthSteps(XP_THRESHOLDS[0] - 1), 0);
    assert.equal(growthSteps(XP_THRESHOLDS[0]), 1);
    assert.equal(growthSteps(XP_THRESHOLDS[1]), 2);
    assert.equal(growthSteps(100), 2);
  });
});

// ─── effectivePersonality / personalityStage ────────────────────────────────

describe('effectivePersonality', () => {
  it('経験が無ければ生まれつきの性格のまま', () => {
    const pet = { personality: { curiosity: 0, sociability: 2 } };
    assert.deepEqual(effectivePersonality(pet), { curiosity: 0, sociability: 2 });
  });

  it('経験が貯まると実効性格が上がる（上限2）', () => {
    const pet = {
      personality: { curiosity: 0, sociability: 2 },
      experience: { curiosityXp: XP_THRESHOLDS[1], sociabilityXp: 99 },
    };
    assert.deepEqual(effectivePersonality(pet), { curiosity: 2, sociability: 2 });
  });

  it('personalityStage は次の成長までの残りを返す', () => {
    const pet = {
      personality: { curiosity: 1, sociability: 1 },
      experience: { curiosityXp: XP_THRESHOLDS[0], sociabilityXp: 0 },
    };
    const stage = personalityStage(pet);
    assert.equal(stage.curiosity.effective, 2);
    assert.equal(stage.curiosity.xpToNext, XP_THRESHOLDS[1] - XP_THRESHOLDS[0]);
    assert.equal(stage.sociability.xpToNext, XP_THRESHOLDS[0]);
  });
});

// ─── experienceFromEvent / applyExperience ──────────────────────────────────

describe('experienceFromEvent', () => {
  it('好奇心条件の出来事は好奇心XPを多く与える', () => {
    const gained = experienceFromEvent(SPOT, 'a-cur', null);
    assert.ok(gained.curiosityXp > gained.sociabilityXp);
  });

  it('社交条件の出来事＋おみやげは両方に効く', () => {
    const gained = experienceFromEvent(SPOT, 'a-soc', 'sv-1');
    assert.ok(gained.sociabilityXp >= 2);
    assert.ok(gained.curiosityXp >= 1);
  });

  it('無条件の出来事は両軸に少しずつ与える', () => {
    const gained = experienceFromEvent(SPOT, 'a-plain', null);
    assert.deepEqual(gained, { curiosityXp: 1, sociabilityXp: 1 });
  });

  it('未知の出来事IDでも例外にせず無条件扱いにする', () => {
    const gained = experienceFromEvent(SPOT, 'unknown-id', null);
    assert.deepEqual(gained, { curiosityXp: 1, sociabilityXp: 1 });
  });

  it('applyExperience は元のペットを変更せず加算する', () => {
    const pet = {
      personality: { curiosity: 1, sociability: 1 },
      experience: { curiosityXp: 1, sociabilityXp: 1 },
    };
    const next = applyExperience(pet, { curiosityXp: 2, sociabilityXp: 0 });
    assert.deepEqual(next.experience, { curiosityXp: 3, sociabilityXp: 1 });
    assert.deepEqual(pet.experience, { curiosityXp: 1, sociabilityXp: 1 });
  });
});

// ─── deriveMemory ────────────────────────────────────────────────────────────

describe('deriveMemory', () => {
  it('空の履歴ではすべてゼロ・null', () => {
    const memory = deriveMemory([]);
    assert.equal(memory.totalTrips, 0);
    assert.equal(memory.favoriteSpotId, null);
    assert.equal(memory.lastTrip, null);
  });

  it('行き先ごとの回数とお気に入りを集計する', () => {
    const memory = deriveMemory([
      visit('spot-a', 'a-plain'),
      visit('spot-b', 'b-1'),
      visit('spot-a', 'a-cur', 'sv-1'),
    ]);
    assert.equal(memory.totalTrips, 3);
    assert.equal(memory.tripsBySpot['spot-a'], 2);
    assert.equal(memory.favoriteSpotId, 'spot-a');
    assert.equal(memory.souvenirCount, 1);
    assert.equal(memory.distinctSpots, 2);
    assert.equal(memory.lastEventBySpot['spot-a'], 'a-cur');
    assert.equal(memory.lastTrip.spotId, 'spot-a');
  });

  it('進行中（completed でない）Visit は数えない', () => {
    const ongoing = { ...visit('spot-a', 'a-plain'), status: 'ongoing' };
    const memory = deriveMemory([ongoing]);
    assert.equal(memory.totalTrips, 0);
  });
});

// ─── buildMemoryDigest ───────────────────────────────────────────────────────

describe('buildMemoryDigest', () => {
  it('冒険が無ければ null', () => {
    assert.equal(buildMemoryDigest(deriveMemory([]), SPOTS), null);
  });

  it('回数・お気に入り・おみやげを含む要約になる', () => {
    const memory = deriveMemory([
      visit('spot-a', 'a-plain'),
      visit('spot-b', 'b-1'),
      visit('spot-a', 'a-cur', 'sv-1'),
    ]);
    const digest = buildMemoryDigest(memory, SPOTS);
    assert.includes(digest, '3回');
    assert.includes(digest, '場所A');
    assert.includes(digest, 'おみやげは1つ');
  });
});

// ─── 出来事の反復回避（generateEvent の avoidEventId） ──────────────────────

describe('generateEvent の記憶による反復回避', () => {
  const pet = { name: 'テスト', personality: { curiosity: 1, sociability: 1 } };
  const noon = new Date('2026-11-20T12:00:00');

  it('候補が複数あれば前回と同じ出来事を避ける', () => {
    // 条件なし候補は a-plain のみ。条件付きは性格1では一致しないため、
    // 候補が複数になるよう性格2のペットで検証する
    const curiousPet = { name: 'テスト', personality: { curiosity: 2, sociability: 2 } };
    for (let i = 0; i < 30; i++) {
      const ev = generateEvent(SPOT, curiousPet, noon, '', { avoidEventId: 'a-cur' });
      assert.notOk(ev.eventId === 'a-cur', 'avoidEventId の出来事が選ばれた');
    }
  });

  it('候補が1件しかなければ、その出来事をそのまま使う', () => {
    const singleSpot = {
      id: 'single',
      displayName: '単独',
      events: [{ id: 'only', text: 'これだけ。', souvenirId: null, conditions: null }],
    };
    const ev = generateEvent(singleSpot, pet, noon, '', { avoidEventId: 'only' });
    assert.equal(ev.eventId, 'only');
  });
});
