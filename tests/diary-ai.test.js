/**
 * tests/diary-ai.test.js
 * src/ai/diary-ai.js の純粋関数の単体テスト。
 * ネットワーク依存の生成本体（generateDiaryText の実呼び出し）は対象外。
 * プロンプト組み立て・整形・フォールバック判定を検証する。
 */

import {
  FIREBASE_CONFIG,
  APPCHECK_DEBUG_TOKEN,
  installAppCheckDebugToken,
  INFERENCE_SOURCE,
  badgeLabelFor,
  isFirebaseConfigured,
  describePersonality,
  buildDiaryPrompt,
  cleanDiaryText,
  normalizeInferenceSource,
  pickDiaryResult,
  createDeviceModelInitializer,
  MAX_DIARY_LENGTH,
} from '../src/ai/diary-ai.js';

// ─── isFirebaseConfigured ────────────────────────────────────────────────────

describe('isFirebaseConfigured', () => {
  it('プレースホルダ（全項目が空）では false', () => {
    assert.equal(
      isFirebaseConfigured({ apiKey: '', authDomain: '', projectId: '', appId: '' }),
      false,
      '空の設定は未設定'
    );
  });

  it('必須3項目が揃えば true（authDomain は任意）', () => {
    assert.equal(
      isFirebaseConfigured({ apiKey: 'key', projectId: 'proj', appId: 'app' }),
      true,
      'apiKey/projectId/appId が揃えば設定済み'
    );
  });

  it('1項目でも欠ければ false', () => {
    assert.equal(
      isFirebaseConfigured({ apiKey: 'key', projectId: '', appId: 'app' }),
      false,
      'projectId が空なら未設定'
    );
    assert.equal(
      isFirebaseConfigured({ apiKey: '   ', projectId: 'proj', appId: 'app' }),
      false,
      '空白だけの apiKey は未設定'
    );
  });

  it('null でも例外にならず false', () => {
    assert.equal(isFirebaseConfigured(null), false, 'null は未設定');
  });

  it('実設定（FIREBASE_CONFIG）は設定済みと判定される', () => {
    // 2026-11-24 に Firebase コンソールの実値を記入した
    assert.equal(isFirebaseConfigured(), true, '既定値（実設定）は設定済み');
    assert.equal(FIREBASE_CONFIG.projectId, 'odekake-pet', 'プロジェクトは odekake-pet');
  });
});

// ─── App Check（デバッグプロバイダ） ─────────────────────────────────────────

describe('App Check デバッグトークン', () => {
  it('デバッグトークンは UUID 形式の文字列', () => {
    assert.equal(typeof APPCHECK_DEBUG_TOKEN, 'string', '文字列である');
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(APPCHECK_DEBUG_TOKEN),
      'UUID 形式である'
    );
  });

  it('installAppCheckDebugToken は対象へトークンを設定して返す', () => {
    const target = {};
    const returned = installAppCheckDebugToken(target);
    assert.equal(target.FIREBASE_APPCHECK_DEBUG_TOKEN, APPCHECK_DEBUG_TOKEN, 'グローバル名で設定される');
    assert.equal(returned, APPCHECK_DEBUG_TOKEN, '設定したトークンが返る');
  });

  it('既定では globalThis へ設定される', () => {
    const previous = globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
    try {
      installAppCheckDebugToken();
      assert.equal(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN, APPCHECK_DEBUG_TOKEN, 'globalThis に設定される');
    } finally {
      if (previous === undefined) delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
      else globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = previous;
    }
  });
});

// ─── describePersonality ─────────────────────────────────────────────────────

describe('describePersonality', () => {
  it('性格値を日本語の説明に変換する', () => {
    assert.equal(
      describePersonality({ curiosity: 2, sociability: 2 }),
      '好奇心いっぱいで、とっても社交的',
      '最大値どうしの組み合わせ'
    );
    assert.equal(
      describePersonality({ curiosity: 0, sociability: 0 }),
      'のんびり屋で、マイペース',
      '最小値どうしの組み合わせ'
    );
  });

  it('範囲外の値は端に丸める', () => {
    assert.equal(
      describePersonality({ curiosity: 9, sociability: -3 }),
      '好奇心いっぱいで、マイペース',
      '範囲外は 0〜2 にクランプ'
    );
  });

  it('欠損した personality でも中央値で説明を返す', () => {
    assert.equal(
      describePersonality(null),
      'ほどよく好奇心があるで、ほどよく社交的',
      'null は中央値あつかい'
    );
    assert.equal(
      describePersonality({}),
      'ほどよく好奇心があるで、ほどよく社交的',
      '空オブジェクトも中央値あつかい'
    );
  });
});

// ─── buildDiaryPrompt ────────────────────────────────────────────────────────

describe('buildDiaryPrompt', () => {
  const facts = {
    petName: 'ほしの',
    personality: { curiosity: 2, sociability: 1 },
    spotName: 'ほしくず公園',
    eventText: 'ほしのが流れ星を追いかけた。',
    souvenirName: 'ほしのかけら',
  };

  it('旅の事実がすべてプロンプトに入る', () => {
    const prompt = buildDiaryPrompt(facts);
    assert.includes(prompt, 'ほしの', 'ペット名が入る');
    assert.includes(prompt, 'ほしくず公園', '行き先が入る');
    assert.includes(prompt, 'ほしのが流れ星を追いかけた。', '出来事が入る');
    assert.includes(prompt, 'ほしのかけら', 'おみやげが入る');
    assert.includes(prompt, '好奇心いっぱい', '性格の説明が入る');
  });

  it('一人称・文字数のルールが入る', () => {
    const prompt = buildDiaryPrompt(facts);
    assert.includes(prompt, '一人称', '一人称の指示がある');
    assert.includes(prompt, '90文字以内', '文字数の上限がある');
  });

  it('おみやげが無い場合はおみやげ行を出さない', () => {
    const prompt = buildDiaryPrompt({ ...facts, souvenirName: null });
    assert.notIncludes(prompt, 'おみやげ:', 'おみやげ行が出ない');
    assert.includes(prompt, 'ほしくず公園', '他の事実は入る');
  });
});

// ─── cleanDiaryText ──────────────────────────────────────────────────────────

describe('cleanDiaryText', () => {
  it('通常の文はそのまま返す', () => {
    assert.equal(
      cleanDiaryText('今日は流れ星を追いかけたよ。たのしかった！'),
      '今日は流れ星を追いかけたよ。たのしかった！',
      '整形不要な文はそのまま'
    );
  });

  it('改行と空白を取り除く', () => {
    assert.equal(
      cleanDiaryText('今日は 公園に\n行ったよ。\nたのしかった。'),
      '今日は公園に行ったよ。たのしかった。',
      '改行・空白は除去される'
    );
  });

  it('前後の引用符・鉤括弧・太字記号を取り除く', () => {
    assert.equal(
      cleanDiaryText('「今日はたのしかった。」'),
      '今日はたのしかった。',
      '鉤括弧が外れる'
    );
    assert.equal(
      cleanDiaryText('"**今日はたのしかった。**"'),
      '今日はたのしかった。',
      '引用符と ** が外れる'
    );
  });

  it('空・空白だけ・非文字列は null（フォールバックの合図）', () => {
    assert.equal(cleanDiaryText(''), null, '空文字列は null');
    assert.equal(cleanDiaryText('  \n '), null, '空白だけは null');
    assert.equal(cleanDiaryText('「」'), null, '記号だけは null');
    assert.equal(cleanDiaryText(null), null, 'null は null');
    assert.equal(cleanDiaryText(undefined), null, 'undefined は null');
    assert.equal(cleanDiaryText(42), null, '数値は null');
  });

  it('最大文字数を超えたら切り詰める', () => {
    const result = cleanDiaryText('あ'.repeat(MAX_DIARY_LENGTH + 50));
    assert.equal(result.length, MAX_DIARY_LENGTH, '上限に切り詰められる');
  });
});

// ─── normalizeInferenceSource ────────────────────────────────────────────────

describe('normalizeInferenceSource', () => {
  it('SDK の値を INFERENCE_SOURCE に変換する', () => {
    assert.equal(normalizeInferenceSource('ON_DEVICE'), INFERENCE_SOURCE.ON_DEVICE, 'ON_DEVICE');
    assert.equal(normalizeInferenceSource('IN_CLOUD'), INFERENCE_SOURCE.CLOUD, 'IN_CLOUD');
  });

  it('表記ゆれ（小文字・ハイフン）を吸収する', () => {
    assert.equal(normalizeInferenceSource('on-device'), INFERENCE_SOURCE.ON_DEVICE, 'on-device');
    assert.equal(normalizeInferenceSource('cloud'), INFERENCE_SOURCE.CLOUD, 'cloud');
  });

  it('未知の値・非文字列は null', () => {
    assert.equal(normalizeInferenceSource('SOMEWHERE'), null, '未知の値は null');
    assert.equal(normalizeInferenceSource(undefined), null, 'undefined は null');
    assert.equal(normalizeInferenceSource(null), null, 'null は null');
  });
});

// ─── pickDiaryResult ─────────────────────────────────────────────────────────

describe('pickDiaryResult', () => {
  it('最初の使える候補を整形して返す', () => {
    const result = pickDiaryResult([
      { source: INFERENCE_SOURCE.ON_DEVICE, text: '「オンデバイスで書いた文。」' },
      { source: INFERENCE_SOURCE.CLOUD, text: 'クラウドの文' },
    ]);
    assert.equal(result.source, INFERENCE_SOURCE.ON_DEVICE, '優先順位どおり先頭が選ばれる');
    assert.equal(result.text, 'オンデバイスで書いた文。', '整形済みの文が返る');
  });

  it('使えない候補は読み飛ばして次の候補を使う', () => {
    const result = pickDiaryResult([
      { source: INFERENCE_SOURCE.ON_DEVICE, text: '' },
      { source: INFERENCE_SOURCE.CLOUD, text: null },
      { source: INFERENCE_SOURCE.TEMPLATE, text: 'テンプレの文' },
    ]);
    assert.equal(result.source, INFERENCE_SOURCE.TEMPLATE, '最後の候補まで落ちる');
    assert.equal(result.text, 'テンプレの文', 'テンプレ文が返る');
  });

  it('すべて使えなければ null', () => {
    assert.equal(pickDiaryResult([]), null, '空配列は null');
    assert.equal(
      pickDiaryResult([{ source: INFERENCE_SOURCE.CLOUD, text: '  ' }]),
      null,
      '空白だけの候補は使えない'
    );
  });
});

// ─── badgeLabelFor ───────────────────────────────────────────────────────────

describe('badgeLabelFor', () => {
  it('推論元ごとにバッジ文を返す', () => {
    assert.includes(badgeLabelFor(INFERENCE_SOURCE.ON_DEVICE), 'オンデバイス', 'オンデバイスのバッジ');
    assert.includes(badgeLabelFor(INFERENCE_SOURCE.CLOUD), 'クラウド', 'クラウドのバッジ');
    assert.includes(badgeLabelFor(INFERENCE_SOURCE.TEMPLATE), 'テンプレ', 'テンプレのバッジ');
  });

  it('未知の値・未設定は null（バッジを描かない）', () => {
    assert.equal(badgeLabelFor(undefined), null, 'undefined は null');
    assert.equal(badgeLabelFor(null), null, 'null は null');
    assert.equal(badgeLabelFor('unknown'), null, '未知の値は null');
  });
});

// ─── createDeviceModelInitializer ────────────────────────────────────────────

describe('createDeviceModelInitializer', () => {
  it('initializeDeviceModel は複数回呼んでも1回だけ実行される', () => {
    const ensure = createDeviceModelInitializer();
    let calls = 0;
    const fakeModel = {
      initializeDeviceModel: () => {
        calls++;
        return Promise.resolve();
      },
    };
    ensure(fakeModel);
    ensure(fakeModel);
    assert.equal(calls, 1, '初期化は1回だけ');
  });

  it('initializeDeviceModel を持たないモデルでも例外にならない', () => {
    const ensure = createDeviceModelInitializer();
    ensure({});
    ensure(null);
    ensure(undefined);
  });

  it('ファクトリが違えば初期化も別々に走る', () => {
    let calls = 0;
    const fakeModel = {
      initializeDeviceModel: () => {
        calls++;
        return Promise.resolve();
      },
    };
    createDeviceModelInitializer()(fakeModel);
    createDeviceModelInitializer()(fakeModel);
    assert.equal(calls, 2, '独立した初期化はそれぞれ1回ずつ');
  });
});
