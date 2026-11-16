/**
 * tests/odekake-code.test.js
 * src/domain/odekake-code.js の単体テスト＋性質テスト（M7・TASK-39）。
 * 性質: 「おでかけコードの往復でデータが欠けない」（エンコード→デコードで全フィールド一致）。
 * test-runner.html / run-node.mjs 上の describe / it / assert を使用する。
 */

import {
  CODE_PREFIX,
  CODE_MAX_LENGTH,
  fnv1a32,
  canonicalStringify,
  shortHash,
  encodeFriendCode,
  decodeFriendCode,
  encodeFootprintCode,
  decodeFootprintCode,
} from '../src/domain/odekake-code.js';

// ─── テスト用ヘルパー ────────────────────────────────────────────────────────

/** コード文字列の JSON 部分を取り出す（改ざんテスト用） */
function codeToJson(code) {
  const b64 = code.slice(CODE_PREFIX.length).replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** JSON オブジェクトをコード文字列に戻す（改ざんテスト用） */
function jsonToCode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return CODE_PREFIX + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

// ─── fnv1a32 ─────────────────────────────────────────────────────────────────

describe('fnv1a32', () => {
  it('空文字列でエラーにならず既知の値を返す', () => {
    assert.equal(fnv1a32(''), 2166136261, '空文字列は FNV オフセット基底値');
  });

  it('既知ベクタ: "a" は 3826002220', () => {
    assert.equal(fnv1a32('a'), 3826002220, 'FNV-1a 32bit の既知出力');
  });

  it('決定的である（同じ入力は常に同じ値）', () => {
    assert.equal(fnv1a32('おでかけ'), fnv1a32('おでかけ'), '同一入力は同一出力');
  });

  it('異なる入力では異なる値になる', () => {
    assert.notOk(fnv1a32('ゆき') === fnv1a32('もち'), '異なる名前は異なるハッシュ');
    assert.notOk(fnv1a32('abc') === fnv1a32('abd'), '末尾1文字の違いでも異なる');
  });
});

// ─── canonicalStringify ──────────────────────────────────────────────────────

describe('canonicalStringify', () => {
  it('checksum フィールドが除外される', () => {
    const s = canonicalStringify({ a: 1, checksum: 999 });
    assert.notIncludes(s, 'checksum', 'checksum は含まれない');
  });

  it('キー順序が違っても同一の文字列になる', () => {
    const s1 = canonicalStringify({ b: 2, a: 1, c: 3 });
    const s2 = canonicalStringify({ c: 3, a: 1, b: 2 });
    assert.equal(s1, s2, 'キー順に依存しない');
  });
});

// ─── おともだちコードの往復 ─────────────────────────────────────────────────

const FRIEND_SAMPLE = {
  v: 1, petName: 'ゆき', petType: 'soraaru-penguin',
  curiosity: 2, sociability: 0, issuedAt: '2026-11-16T10:00:00+09:00',
};

describe('おともだちコードの往復', () => {
  it('全フィールドが往復後も一致する', () => {
    const { code, error } = encodeFriendCode(FRIEND_SAMPLE);
    assert.equal(error, null, 'エンコード成功');
    const decoded = decodeFriendCode(code);
    assert.equal(decoded.error, null, 'デコード成功');
    for (const key of Object.keys(FRIEND_SAMPLE)) {
      assert.equal(decoded.payload[key], FRIEND_SAMPLE[key], `${key} が一致`);
    }
    assert.ok(typeof decoded.payload.checksum === 'number', 'checksum が付いている');
  });

  it('生成コードは 500 文字以内でプレフィクスを持つ', () => {
    const { code } = encodeFriendCode(FRIEND_SAMPLE);
    assert.ok(code.length <= CODE_MAX_LENGTH, '最大長以内');
    assert.ok(code.startsWith(CODE_PREFIX), 'v1: で始まる');
  });

  it('前後の空白や改行が混入しても読み取れる', () => {
    const { code } = encodeFriendCode(FRIEND_SAMPLE);
    const decoded = decodeFriendCode(`  ${code}\n`);
    assert.equal(decoded.error, null, '空白混入でもデコードできる');
  });
});

// ─── 足跡コードの往復 ───────────────────────────────────────────────────────

const FOOTPRINT_SAMPLE = {
  v: 1, visitorPetName: 'もち', visitorPetType: 'mameshiba',
  visitedAt: '2026-11-16T12:00:00+09:00', eventSummary: 'ふたりで星を眺めた。',
};

describe('足跡コードの往復', () => {
  it('全フィールドが往復後も一致する', () => {
    const { code, error } = encodeFootprintCode(FOOTPRINT_SAMPLE);
    assert.equal(error, null, 'エンコード成功');
    const decoded = decodeFootprintCode(code);
    assert.equal(decoded.error, null, 'デコード成功');
    for (const key of Object.keys(FOOTPRINT_SAMPLE)) {
      assert.equal(decoded.payload[key], FOOTPRINT_SAMPLE[key], `${key} が一致`);
    }
  });

  it('eventSummary が50文字を超えると切り詰められる', () => {
    const long = { ...FOOTPRINT_SAMPLE, eventSummary: 'あ'.repeat(60) };
    const { code } = encodeFootprintCode(long);
    const decoded = decodeFootprintCode(code);
    assert.equal(decoded.payload.eventSummary.length, 50, '50文字に切り詰め');
    assert.ok(decoded.payload.eventSummary.endsWith('…'), '末尾は「…」');
  });
});

// ─── デコードのエラーケース ─────────────────────────────────────────────────

describe('decodeFriendCode のエラーケース', () => {
  it('プレフィクスなしはエラーで payload は null', () => {
    const r = decodeFriendCode('hello');
    assert.notOk(r.error === null, 'error が返る');
    assert.equal(r.payload, null, 'payload は null');
  });

  it('Base64 部分が壊れているとエラーで payload は null', () => {
    const r = decodeFriendCode('v1:!!!');
    assert.notOk(r.error === null, 'error が返る');
    assert.equal(r.payload, null, 'payload は null');
  });

  it('checksum を書き換えるとエラーで payload は null', () => {
    const { code } = encodeFriendCode(FRIEND_SAMPLE);
    const obj = codeToJson(code);
    obj.checksum = 0;
    const r = decodeFriendCode(jsonToCode(obj));
    assert.notOk(r.error === null, 'error が返る');
    assert.equal(r.payload, null, 'payload は null');
  });

  it('必須フィールドが欠けるとエラーで payload は null', () => {
    const { code } = encodeFriendCode(FRIEND_SAMPLE);
    const obj = codeToJson(code);
    delete obj.petName;
    const r = decodeFriendCode(jsonToCode(obj));
    assert.notOk(r.error === null, 'error が返る');
    assert.equal(r.payload, null, 'payload は null');
  });

  it('おともだちコードを足跡コードとして読むとエラーになる', () => {
    const { code } = encodeFriendCode(FRIEND_SAMPLE);
    const r = decodeFootprintCode(code);
    assert.notOk(r.error === null, '必須フィールドが違うのでエラー');
    assert.equal(r.payload, null, 'payload は null');
  });
});

// ─── shortHash ───────────────────────────────────────────────────────────────

describe('shortHash', () => {
  it('16進数8桁の文字列を返す', () => {
    const h = shortHash('ゆき');
    assert.equal(h.length, 8, '8桁');
    assert.ok(/^[0-9a-f]{8}$/.test(h), '16進数小文字');
  });
});

// ─── 性質テスト: 往復でデータが欠けない ─────────────────────────────────────

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
const NAME_CHARS = 'あいうえおかきくけこさしすせそたちつてとゆきもちはなそら0123456789';
const randomName = () => {
  const len = randInt(1, 12);
  let s = '';
  for (let i = 0; i < len; i++) s += NAME_CHARS[Math.floor(rand() * NAME_CHARS.length)];
  return s;
};
const randomIso = () => new Date(randInt(1_600_000_000_000, 1_800_000_000_000)).toISOString();

describe('性質: コードの往復でデータが欠けない', () => {
  it('ランダムなおともだちコード200件がすべて往復一致する', () => {
    const TYPES = ['hoshikuzu-usagi', 'soraaru-penguin', 'mameshiba'];
    for (let i = 0; i < 200; i++) {
      const payload = {
        v: 1,
        petName: randomName(),
        petType: pick(TYPES),
        curiosity: randInt(0, 2),
        sociability: randInt(0, 2),
        issuedAt: randomIso(),
      };
      const { code, error } = encodeFriendCode(payload);
      assert.equal(error, null, `反例: 反復${i} でエンコード失敗`);
      const decoded = decodeFriendCode(code);
      assert.equal(decoded.error, null, `反例: 反復${i} でデコード失敗`);
      for (const key of Object.keys(payload)) {
        assert.equal(decoded.payload[key], payload[key], `反例: 反復${i} の ${key} が不一致`);
      }
    }
  });

  it('ランダムな足跡コード200件がすべて往復一致する（要約の切り詰め込み）', () => {
    const TYPES = ['hoshikuzu-usagi', 'soraaru-penguin', 'mameshiba'];
    for (let i = 0; i < 200; i++) {
      const rawSummary = 'あ'.repeat(randInt(0, 80));
      const payload = {
        v: 1,
        visitorPetName: randomName(),
        visitorPetType: pick(TYPES),
        visitedAt: randomIso(),
        eventSummary: rawSummary,
      };
      const { code, error } = encodeFootprintCode(payload);
      assert.equal(error, null, `反例: 反復${i} でエンコード失敗`);
      const decoded = decodeFootprintCode(code);
      assert.equal(decoded.error, null, `反例: 反復${i} でデコード失敗`);
      const expectedSummary = rawSummary.length > 50
        ? rawSummary.slice(0, 49) + '…'
        : rawSummary;
      assert.equal(decoded.payload.eventSummary, expectedSummary, `反例: 反復${i} の要約が不一致`);
      assert.equal(decoded.payload.visitorPetName, payload.visitorPetName, '名前が一致');
      assert.equal(decoded.payload.visitedAt, payload.visitedAt, '日時が一致');
    }
  });
});
