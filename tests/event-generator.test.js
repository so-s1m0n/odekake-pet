/**
 * tests/event-generator.test.js
 * src/domain/event-generator.js の単体テスト。
 * test-runner.html 上の describe / it / assert を使用する。
 */

import {
  TIME_OF_DAY,
  getTimeOfDay,
  generateEvent,
} from '../src/domain/event-generator.js';

// ─── テスト用のフィクスチャ ───────────────────────────────────────────────────

/**
 * テスト用のスポット定義（spots.json を模倣した最小構成）。
 * 条件付きテンプレートと条件なしテンプレートを混在させる。
 */
const TEST_SPOT = {
  id: 'test-spot',
  displayName: 'テストスポット',
  events: [
    {
      // 条件なし（フォールバック専用）
      id: 'test-001',
      text: '{petName}はふらっと立ち寄った。',
      souvenirId: null,
      conditions: null,
    },
    {
      // 条件なし（フォールバック専用）
      id: 'test-002',
      text: '{petName}はお茶を一杯飲んだ。',
      souvenirId: 'test-souvenir',
      conditions: null,
    },
    {
      // curiosity=2 専用
      id: 'test-003',
      text: '{petName}は珍しいものを発見した。',
      souvenirId: null,
      conditions: {
        curiosity:   [2],
        sociability: null,
        timeOfDay:   null,
      },
    },
    {
      // sociability=0 専用
      id: 'test-004',
      text: '{petName}は一人で静かに過ごした。',
      souvenirId: null,
      conditions: {
        curiosity:   null,
        sociability: [0],
        timeOfDay:   null,
      },
    },
    {
      // 夜のみ
      id: 'test-005',
      text: '{petName}は夜空をながめた。',
      souvenirId: null,
      conditions: {
        curiosity:   null,
        sociability: null,
        timeOfDay:   ['night'],
      },
    },
    {
      // curiosity=2 かつ 朝のみ（複合条件）
      id: 'test-006',
      text: '{petName}は朝の探索をした。',
      souvenirId: null,
      conditions: {
        curiosity:   [2],
        sociability: null,
        timeOfDay:   ['morning'],
      },
    },
  ],
};

/** 汎用のテスト用ペット */
const PET_CURIOUS   = { name: 'まめ', personality: { curiosity: 2, sociability: 1 } };
const PET_SHY       = { name: 'こんぺい', personality: { curiosity: 0, sociability: 0 } };
const PET_NORMAL    = { name: 'そら', personality: { curiosity: 1, sociability: 1 } };

/** 時刻ヘルパー: 指定した時間の Date を返す */
function makeDate(hour) {
  const d = new Date(2026, 0, 1, hour, 0, 0);
  return d;
}

// ─── getTimeOfDay ─────────────────────────────────────────────────────────────

describe('getTimeOfDay', () => {
  it('5時 → "morning"', () => {
    assert.equal(getTimeOfDay(makeDate(5)), TIME_OF_DAY.MORNING, '5時は朝');
  });

  it('6時 → "morning"', () => {
    assert.equal(getTimeOfDay(makeDate(6)), TIME_OF_DAY.MORNING, '6時は朝');
  });

  it('11時 → "morning"', () => {
    assert.equal(getTimeOfDay(makeDate(11)), TIME_OF_DAY.MORNING, '11時は朝');
  });

  it('12時 → "afternoon"', () => {
    assert.equal(getTimeOfDay(makeDate(12)), TIME_OF_DAY.AFTERNOON, '12時は昼');
  });

  it('16時 → "afternoon"', () => {
    assert.equal(getTimeOfDay(makeDate(16)), TIME_OF_DAY.AFTERNOON, '16時は昼');
  });

  it('17時 → "evening"', () => {
    assert.equal(getTimeOfDay(makeDate(17)), TIME_OF_DAY.EVENING, '17時は夕方');
  });

  it('20時 → "evening"', () => {
    assert.equal(getTimeOfDay(makeDate(20)), TIME_OF_DAY.EVENING, '20時は夕方');
  });

  it('21時 → "night"', () => {
    assert.equal(getTimeOfDay(makeDate(21)), TIME_OF_DAY.NIGHT, '21時は夜');
  });

  it('23時 → "night"', () => {
    assert.equal(getTimeOfDay(makeDate(23)), TIME_OF_DAY.NIGHT, '23時は夜');
  });

  it('0時 → "night"', () => {
    assert.equal(getTimeOfDay(makeDate(0)), TIME_OF_DAY.NIGHT, '0時は夜');
  });

  it('4時 → "night"', () => {
    assert.equal(getTimeOfDay(makeDate(4)), TIME_OF_DAY.NIGHT, '4時は夜（深夜）');
  });
});

// ─── generateEvent ────────────────────────────────────────────────────────────

describe('generateEvent — 基本動作', () => {
  it('eventId・eventText・souvenirId を返す', () => {
    const result = generateEvent(TEST_SPOT, PET_NORMAL, makeDate(12));

    assert.ok(typeof result.eventId   === 'string', 'eventId は文字列');
    assert.ok(typeof result.eventText === 'string', 'eventText は文字列');
    assert.ok('souvenirId' in result,               'souvenirId フィールドが存在する');
  });

  it('eventText に {petName} プレースホルダーが残っていない（置換済み）', () => {
    const result = generateEvent(TEST_SPOT, PET_NORMAL, makeDate(12));
    assert.notIncludes(result.eventText, '{petName}', '{petName} は置換される');
  });

  it('eventText にペット名が含まれる', () => {
    const result = generateEvent(TEST_SPOT, PET_NORMAL, makeDate(12));
    assert.includes(result.eventText, PET_NORMAL.name, 'ペット名が文中に含まれる');
  });

  it('ペット名が異なれば eventText も異なる', () => {
    const r1 = generateEvent(TEST_SPOT, PET_CURIOUS, makeDate(12));
    const r2 = generateEvent(TEST_SPOT, PET_SHY,     makeDate(12));

    // 同じテンプレートが選ばれた場合のみ名前だけが変わることを確認する
    // （異なるテンプレートが選ばれる可能性もあるため、名前の含有のみ確認）
    assert.includes(r1.eventText, PET_CURIOUS.name, 'r1 に好奇心ペットの名前');
    assert.includes(r2.eventText, PET_SHY.name,     'r2 に引っ込み思案ペットの名前');
  });
});

describe('generateEvent — 条件フィルタリング', () => {
  it('curiosity=2 のペットには curiosity=[2] のテンプレートが選ばれる', () => {
    // test-003（curiosity=2）または test-006（curiosity=2 かつ morning）が候補になる
    // 昼（12時）では test-006 の timeOfDay 条件が不一致なので test-003 のみが候補
    const result = generateEvent(TEST_SPOT, PET_CURIOUS, makeDate(12));

    assert.equal(result.eventId, 'test-003', 'curiosity=2 + 昼 → test-003 が選ばれる');
  });

  it('sociability=0 のペットには sociability=[0] のテンプレートが選ばれる（夜以外）', () => {
    // 昼にsociability=0 のペット → test-004 が候補
    // PET_SHY は curiosity=0 なので test-003 は選ばれない
    const result = generateEvent(TEST_SPOT, PET_SHY, makeDate(12));

    assert.equal(result.eventId, 'test-004', 'sociability=0 + 昼 → test-004 が選ばれる');
  });

  it('timeOfDay=night のテンプレートは夜のみ選ばれる', () => {
    // PET_NORMAL（curiosity=1, sociability=1）＋夜
    // test-003（curiosity=2）は不一致、test-004（sociability=0）は不一致
    // test-005（night）が唯一の条件一致 → test-005
    const result = generateEvent(TEST_SPOT, PET_NORMAL, makeDate(22));

    assert.equal(result.eventId, 'test-005', '夜 + PET_NORMAL → test-005 が選ばれる');
  });

  it('複合条件: curiosity=2 かつ朝のとき → test-006 が選ばれる', () => {
    // curiosity=2 のペット + 朝（6時）
    // test-003（curiosity=2, timeOfDay=null）と test-006（curiosity=2, morning）の両方が一致
    // 両方が候補になり、どちらかランダムに選ばれる → どちらも正解
    const result = generateEvent(TEST_SPOT, PET_CURIOUS, makeDate(6));
    const validIds = ['test-003', 'test-006'];

    assert.ok(
      validIds.includes(result.eventId),
      `curiosity=2 + 朝 → ${validIds.join(' か ')} が選ばれる（実際: ${result.eventId}）`
    );
  });
});

describe('generateEvent — フォールバック', () => {
  it('条件一致なしのとき conditions=null テンプレートが選ばれる', () => {
    // PET_NORMAL（curiosity=1, sociability=1）+ 昼
    // test-003（curiosity=2）: curiosity不一致
    // test-004（sociability=0）: sociability不一致
    // test-005（night）: timeOfDay不一致
    // test-006（curiosity=2 + morning）: curiosity不一致
    // → 条件一致なし → フォールバック: test-001 か test-002
    const result = generateEvent(TEST_SPOT, PET_NORMAL, makeDate(12));
    const fallbackIds = ['test-001', 'test-002'];

    assert.ok(
      fallbackIds.includes(result.eventId),
      `条件一致なし → フォールバック（${fallbackIds.join(' か ')}）が選ばれる（実際: ${result.eventId}）`
    );
  });

  it('フォールバックでも {petName} は置換される', () => {
    const result = generateEvent(TEST_SPOT, PET_NORMAL, makeDate(12));
    assert.notIncludes(result.eventText, '{petName}', 'フォールバックでも {petName} は置換される');
    assert.includes(result.eventText, PET_NORMAL.name, 'フォールバックでもペット名が含まれる');
  });

  it('テンプレートが1件のみのスポットでも動作する（防御的実装）', () => {
    const singleEventSpot = {
      id: 'single-spot',
      displayName: 'ひとつだけスポット',
      events: [
        {
          id: 'single-001',
          text: '{petName}はここに来た。',
          souvenirId: null,
          conditions: null,
        },
      ],
    };
    const result = generateEvent(singleEventSpot, PET_NORMAL, makeDate(12));
    assert.equal(result.eventId, 'single-001', '唯一のテンプレートが選ばれる');
  });

  it('全テンプレートが conditions≠null かつ条件不一致のときは先頭テンプレートにフォールバックする', () => {
    // conditions=null のテンプレートなし、かつ全条件不一致 → 先頭（all-cond-001）を使う
    const allCondSpot = {
      id: 'all-cond-spot',
      displayName: '全条件スポット',
      events: [
        {
          id: 'all-cond-001',
          text: '{petName}は好奇心旺盛な夜を過ごした。',
          souvenirId: null,
          conditions: { curiosity: [2], sociability: null, timeOfDay: ['night'] },
        },
        {
          id: 'all-cond-002',
          text: '{petName}は朝に活動した。',
          souvenirId: null,
          conditions: { curiosity: [2], sociability: null, timeOfDay: ['morning'] },
        },
      ],
    };
    // PET_SHY（curiosity=0）+ 昼 → どちらの条件にも合致しない → 先頭
    const result = generateEvent(allCondSpot, PET_SHY, makeDate(12));
    assert.equal(result.eventId, 'all-cond-001', '全条件不一致のとき先頭テンプレートにフォールバック');
  });
});

describe('generateEvent — おみやげ付与', () => {
  it('souvenirId が null のテンプレートでは souvenirId: null が返る', () => {
    // test-001 は souvenirId: null
    // PET_NORMAL + 昼 → フォールバックで test-001 か test-002 のどちらか
    // 複数回実行して両パターンを確認するより、単一テンプレートのスポットで確認する
    const noSouvenirSpot = {
      id: 'no-souvenir-spot',
      displayName: 'おみやげなしスポット',
      events: [
        {
          id: 'no-sv-001',
          text: '{petName}はおみやげなしで帰った。',
          souvenirId: null,
          conditions: null,
        },
      ],
    };
    const result = generateEvent(noSouvenirSpot, PET_NORMAL, makeDate(12));
    assert.equal(result.souvenirId, null, 'souvenirId が null のテンプレート → null');
  });

  it('souvenirId がある場合、正しく返る', () => {
    const souvenirSpot = {
      id: 'souvenir-spot',
      displayName: 'おみやげありスポット',
      events: [
        {
          id: 'sv-001',
          text: '{petName}はおみやげをもらった。',
          souvenirId: 'great-souvenir',
          conditions: null,
        },
      ],
    };
    const result = generateEvent(souvenirSpot, PET_NORMAL, makeDate(12));
    assert.equal(result.souvenirId, 'great-souvenir', 'souvenirId が正しく返る');
  });
});

// spots.json をトップレベル await で読み込む（ES Modules のトップレベル await を利用）
let spotsData;
try {
  spotsData = await fetch('../data/spots.json').then(r => r.json());
} catch {
  spotsData = null;
}

describe('generateEvent — 実データ（spots.jsonから）', () => {
  // spots.json からフィクスチャを読み込んで検証する（トップレベルで取得済み）

  if (!spotsData) {
    it('（スキップ: spots.json を取得できませんでした）', () => {});
    return;
  }

  const hoshikuzuSpot = spotsData.spots.find(s => s.id === 'hoshikuzu-kobo');

  it('月夜の小屋: 条件なしテンプレートが存在する（フォールバックが機能する）', () => {
    const noCondEvents = hoshikuzuSpot.events.filter(e => e.conditions === null);
    assert.ok(noCondEvents.length >= 1, '条件なしテンプレートが1件以上ある');
  });

  it('月夜の小屋: どんなペット・時間帯でも generateEvent がクラッシュしない', () => {
    const pets = [
      { name: 'A', personality: { curiosity: 0, sociability: 0 } },
      { name: 'B', personality: { curiosity: 1, sociability: 1 } },
      { name: 'C', personality: { curiosity: 2, sociability: 2 } },
    ];
    const hours = [6, 12, 18, 23];

    for (const pet of pets) {
      for (const hour of hours) {
        let threw = false;
        try {
          const result = generateEvent(hoshikuzuSpot, pet, makeDate(hour));
          if (!result.eventId || !result.eventText) threw = true;
        } catch {
          threw = true;
        }
        assert.ok(!threw, `pet.curiosity=${pet.personality.curiosity}, hour=${hour} でクラッシュしない`);
      }
    }
  });

  it('全スポット: {petName} が置換済みであること', () => {
    for (const spot of spotsData.spots) {
      const result = generateEvent(spot, PET_NORMAL, makeDate(12));
      assert.notIncludes(
        result.eventText,
        '{petName}',
        `${spot.displayName}: {petName} が置換されている`
      );
    }
  });
});

// ─── M7: hostName 引数（TASK-40） ────────────────────────────────────────────

describe('generateEvent — hostName（M7）', () => {
  const friendSpot = {
    id: 'friend-test', displayName: 'ゆき のおうち', themeColor: '#b8d4e8', icon: '🏠',
    souvenirs: [],
    events: [
      { id: 'friend-t1', text: '{petName} は {hostName} のおうちで遊んだ。', souvenirId: null, conditions: null },
    ],
  };

  it('hostName を渡すと {hostName} が置換され、残らない', () => {
    const result = generateEvent(friendSpot, PET_NORMAL, makeDate(12), 'ゆき');
    assert.notIncludes(result.eventText, '{hostName}', '{hostName} が残っていない');
    assert.includes(result.eventText, 'ゆき', 'ホスト名が入っている');
    assert.notIncludes(result.eventText, '{petName}', '{petName} も置換済み');
  });

  it('hostName を省略すると {hostName} は空文字に置換される（後方互換）', () => {
    const result = generateEvent(friendSpot, PET_NORMAL, makeDate(12));
    assert.notIncludes(result.eventText, '{hostName}', 'プレースホルダーが残らない');
  });
});
