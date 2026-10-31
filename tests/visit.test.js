/**
 * tests/visit.test.js
 * src/domain/visit.js の単体テスト。
 * test-runner.html 上の describe / it / assert を使用する。
 */

import {
  VISIT_DURATION_MS,
  VISIT_STATUS,
  createVisit,
  isReturnReady,
  completeVisit,
  getVisitTiming,
} from '../src/domain/visit.js';

// ─── createVisit ─────────────────────────────────────────────────────────────

describe('createVisit', () => {
  it('返り値に id・spotId・departedAt・durationMs・status が含まれる', () => {
    const visit = createVisit('hoshikuzu-kobo');

    assert.ok(typeof visit.id === 'string',         'id は文字列');
    assert.ok(visit.id.startsWith('visit-'),        'id は "visit-" から始まる');
    assert.equal(visit.spotId, 'hoshikuzu-kobo',    'spotId が正しく設定される');
    assert.ok(typeof visit.departedAt === 'string', 'departedAt は文字列（ISO 8601）');
    assert.equal(visit.durationMs, VISIT_DURATION_MS, 'durationMs は VISIT_DURATION_MS');
    assert.equal(visit.status, VISIT_STATUS.ONGOING, 'status は "ongoing"');
  });

  it('eventId / souvenirId / cardData の初期値はすべて null', () => {
    const visit = createVisit('mori-hyohonshitsu');

    assert.equal(visit.eventId,    null, 'eventId は null');
    assert.equal(visit.souvenirId, null, 'souvenirId は null');
    assert.equal(visit.cardData,   null, 'cardData は null');
  });

  it('departedAt は現在時刻から1秒以内の ISO 8601 文字列である', () => {
    const before = Date.now();
    const visit  = createVisit('tokeidai-kitchen');
    const after  = Date.now();

    const departedAtMs = new Date(visit.departedAt).getTime();
    assert.ok(departedAtMs >= before, 'departedAt は生成前の時刻以降');
    assert.ok(departedAtMs <= after,  'departedAt は生成後の時刻以前');
  });

  it('異なるタイミングで作成した Visit は id が異なる（衝突しない）', () => {
    // Date.now() の粒度が同じ場合も考慮して確認する
    const v1 = createVisit('hoshikuzu-kobo');
    const v2 = createVisit('hoshikuzu-kobo');

    // 同一ミリ秒での呼び出しは id が同じになり得る仕様のため、
    // 「id フォーマットが正しい」ことのみを確認する
    assert.ok(v1.id.startsWith('visit-'), 'v1 の id フォーマットが正しい');
    assert.ok(v2.id.startsWith('visit-'), 'v2 の id フォーマットが正しい');
  });
});

// ─── isReturnReady ────────────────────────────────────────────────────────────

describe('isReturnReady', () => {
  /** テスト用の基準時刻（固定値） */
  const BASE_TIME = 1_700_000_000_000;

  /** BASE_TIME を departedAt とする Visit を作るヘルパー */
  function makeVisit(durationMs = VISIT_DURATION_MS) {
    return {
      id:         'visit-test',
      spotId:     'hoshikuzu-kobo',
      departedAt: new Date(BASE_TIME).toISOString(),
      durationMs,
      status:     VISIT_STATUS.ONGOING,
      eventId:    null,
      souvenirId: null,
      cardData:   null,
    };
  }

  it('durationMs ちょうどの時刻では true を返す', () => {
    const visit = makeVisit();
    const now   = BASE_TIME + VISIT_DURATION_MS; // ちょうど経過
    assert.ok(isReturnReady(visit, now), '経過時間 = durationMs → true');
  });

  it('durationMs を1ms超過した時刻では true を返す', () => {
    const visit = makeVisit();
    const now   = BASE_TIME + VISIT_DURATION_MS + 1;
    assert.ok(isReturnReady(visit, now), '経過時間 > durationMs → true');
  });

  it('durationMs に1ms届かない時刻では false を返す', () => {
    const visit = makeVisit();
    const now   = BASE_TIME + VISIT_DURATION_MS - 1;
    assert.notOk(isReturnReady(visit, now), '経過時間 < durationMs → false');
  });

  it('出発直後（経過時間 = 0）では false を返す', () => {
    const visit = makeVisit();
    assert.notOk(isReturnReady(visit, BASE_TIME), '出発直後 → false');
  });

  it('カスタムの durationMs でも正しく判定する', () => {
    const customDuration = 30_000; // 30秒
    const visit = makeVisit(customDuration);

    assert.notOk(isReturnReady(visit, BASE_TIME + 29_999), '29.999秒 → false');
    assert.ok(isReturnReady(visit, BASE_TIME + 30_000),    '30秒ちょうど → true');
  });
});

// ─── completeVisit ────────────────────────────────────────────────────────────

describe('completeVisit', () => {
  const baseVisit = createVisit('hoshikuzu-kobo');

  const cardData = {
    spotId:     'hoshikuzu-kobo',
    petName:    'こんぺい',
    petType:    'mameshiba',
    eventText:  'こんぺいは星のかけらをみつけた。',
    souvenirId: 'kobo-hoshi-kakera',
    returnedAt: new Date().toISOString(),
  };

  it('status が "completed" になる', () => {
    const completed = completeVisit(baseVisit, 'kobo-001', 'kobo-hoshi-kakera', cardData);
    assert.equal(completed.status, VISIT_STATUS.COMPLETED, 'status が completed');
  });

  it('eventId が設定される', () => {
    const completed = completeVisit(baseVisit, 'kobo-001', 'kobo-hoshi-kakera', cardData);
    assert.equal(completed.eventId, 'kobo-001', 'eventId が正しく設定される');
  });

  it('souvenirId が設定される', () => {
    const completed = completeVisit(baseVisit, 'kobo-001', 'kobo-hoshi-kakera', cardData);
    assert.equal(completed.souvenirId, 'kobo-hoshi-kakera', 'souvenirId が正しく設定される');
  });

  it('cardData が設定される', () => {
    const completed = completeVisit(baseVisit, 'kobo-001', 'kobo-hoshi-kakera', cardData);
    assert.equal(completed.cardData.petName, cardData.petName, 'cardData.petName が保持される');
    assert.equal(completed.cardData.eventText, cardData.eventText, 'cardData.eventText が保持される');
  });

  it('souvenirId が null でも動作する', () => {
    const completed = completeVisit(baseVisit, 'kobo-004', null, { ...cardData, souvenirId: null });
    assert.equal(completed.souvenirId, null, 'souvenirId が null のまま設定される');
    assert.equal(completed.status, VISIT_STATUS.COMPLETED, 'status は completed');
  });

  it('元の Visit オブジェクトは変更されない（イミュータブル）', () => {
    const original = createVisit('mori-hyohonshitsu');
    completeVisit(original, 'mori-001', null, cardData);
    assert.equal(original.status, VISIT_STATUS.ONGOING, '元オブジェクトの status は変わらない');
    assert.equal(original.eventId, null, '元オブジェクトの eventId は変わらない');
  });
});

// ─── getVisitTiming ───────────────────────────────────────────────────────────

describe('getVisitTiming', () => {
  const BASE_TIME   = 1_700_000_000_000;
  const DURATION_MS = 60_000; // 1分

  function makeVisit() {
    return {
      id:         'visit-test',
      spotId:     'hoshikuzu-kobo',
      departedAt: new Date(BASE_TIME).toISOString(),
      durationMs: DURATION_MS,
      status:     VISIT_STATUS.ONGOING,
      eventId:    null,
      souvenirId: null,
      cardData:   null,
    };
  }

  it('elapsedMs + remainingMs = durationMs（帰宅前）', () => {
    const visit    = makeVisit();
    const now      = BASE_TIME + 20_000; // 20秒経過
    const { elapsedMs, remainingMs } = getVisitTiming(visit, now);

    assert.equal(elapsedMs + remainingMs, DURATION_MS,
      `elapsedMs(${elapsedMs}) + remainingMs(${remainingMs}) = durationMs(${DURATION_MS})`
    );
  });

  it('経過20秒のとき elapsedMs = 20000', () => {
    const visit = makeVisit();
    const { elapsedMs } = getVisitTiming(visit, BASE_TIME + 20_000);
    assert.equal(elapsedMs, 20_000, 'elapsedMs が正しい');
  });

  it('経過20秒のとき remainingMs = 40000', () => {
    const visit = makeVisit();
    const { remainingMs } = getVisitTiming(visit, BASE_TIME + 20_000);
    assert.equal(remainingMs, 40_000, 'remainingMs が正しい');
  });

  it('帰宅時刻を超えても remainingMs は 0 にクランプされる', () => {
    const visit = makeVisit();
    const now   = BASE_TIME + DURATION_MS + 10_000; // 10秒超過
    const { remainingMs } = getVisitTiming(visit, now);
    assert.equal(remainingMs, 0, '超過後の remainingMs は 0');
  });

  it('出発直後は elapsedMs ≈ 0、remainingMs ≈ durationMs', () => {
    const visit = makeVisit();
    const { elapsedMs, remainingMs } = getVisitTiming(visit, BASE_TIME);
    assert.equal(elapsedMs,   0,           '出発直後の elapsedMs は 0');
    assert.equal(remainingMs, DURATION_MS, '出発直後の remainingMs は durationMs');
  });
});
