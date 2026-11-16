/**
 * tests/card-generator.test.js
 * src/domain/card-generator.js の純粋関数（truncateText / formatDateJa）の単体テスト。
 * test-runner.html 上の describe / it / assert を使用する。
 * generateCard・drawWrappedText は Canvas 依存のため対象外（目視確認で代替）。
 */

import { truncateText, formatDateJa } from '../src/domain/card-generator.js';

// ─── truncateText ────────────────────────────────────────────────────────────

describe('truncateText', () => {
  it('100文字以下の文字列はそのまま返す', () => {
    const s = 'あ'.repeat(50);
    assert.equal(truncateText(s), s, '50文字はそのまま');
    assert.equal(truncateText('短い文'), '短い文', '短い文はそのまま');
  });

  it('ちょうど100文字の境界値では切られない', () => {
    const s = 'あ'.repeat(100);
    assert.equal(truncateText(s), s, '100文字ちょうどはそのまま返す');
  });

  it('101文字の文字列は末尾が「…」になって切り詰められる', () => {
    // 実装契約: 結果は合計100文字（99文字＋「…」）。
    // tasks.md の「100文字+『…』」は、最大文字数100に収めるこの形として解釈する。
    const result = truncateText('あ'.repeat(101));
    assert.equal(result.length, 100, '結果は100文字');
    assert.ok(result.endsWith('…'), '末尾は「…」');
    assert.equal(result.slice(0, 99), 'あ'.repeat(99), '先頭99文字は保持される');
  });

  it('空文字列でエラーにならず空文字列を返す', () => {
    assert.equal(truncateText(''), '', '空文字列はそのまま');
  });

  it('maxLen を指定した場合はその長さで切り詰める', () => {
    const result = truncateText('あいうえおかきくけこ', 5);
    assert.equal(result, 'あいうえ…', '5文字指定では4文字＋「…」');
  });
});

// ─── formatDateJa ────────────────────────────────────────────────────────────

describe('formatDateJa', () => {
  it('ISO 8601（+09:00）を「YYYY年M月D日」に変換する', () => {
    assert.equal(
      formatDateJa('2026-11-01T12:00:00+09:00'),
      '2026年11月1日',
      '+09:00 オフセット付きでも正しい日付になる'
    );
  });

  it('月・日が1桁でもゼロパディングされない', () => {
    assert.equal(
      formatDateJa('2026-01-05T12:00:00+09:00'),
      '2026年1月5日',
      '1月5日はゼロ埋めしない'
    );
  });
});
