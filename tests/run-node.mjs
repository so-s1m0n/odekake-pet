/**
 * tests/run-node.mjs
 * test-runner.html と同じ describe / it / assert を node 上で提供する簡易ランナー。
 * .kiro/hooks の「保存時にテスト実行」フックから呼ばれる。
 * 使い方: TZ=Asia/Tokyo node tests/run-node.mjs
 */

let pass = 0;
let fail = 0;

// 非同期テスト（async な it）も扱えるよう、実行は Promise チェーンで
// 直列化する。describe / it は登録順にキューへ積み、最後に await する。
let chain = Promise.resolve();

globalThis.describe = (name, fn) => {
  chain = chain.then(() => {
    console.log(`▶ ${name}`);
    fn();
  });
};

globalThis.it = (name, fn) => {
  chain = chain.then(async () => {
    try {
      await fn();
      pass++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
    }
  });
};

globalThis.assert = {
  equal(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(`${msg ?? 'assert.equal'} 期待値: ${JSON.stringify(expected)} 実際値: ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${msg ?? 'assert.deepEqual'} 期待値: ${JSON.stringify(expected)} 実際値: ${JSON.stringify(actual)}`);
    }
  },
  ok(value, msg) {
    if (!value) throw new Error(`${msg ?? 'assert.ok'}: 値が falsy です`);
  },
  notOk(value, msg) {
    if (value) throw new Error(`${msg ?? 'assert.notOk'}: 値が truthy です`);
  },
  includes(str, substr, msg) {
    if (!String(str).includes(substr)) throw new Error(`${msg ?? 'assert.includes'}: "${substr}" が含まれていません`);
  },
  notIncludes(str, substr, msg) {
    if (String(str).includes(substr)) throw new Error(`${msg ?? 'assert.notIncludes'}: "${substr}" が含まれています`);
  },
};

await import('./visit.test.js');
await import('./event-generator.test.js');
await import('./card-generator.test.js');
await import('./visit-property.test.js');
await import('./odekake-code.test.js');
await import('./diary-ai.test.js');

// describe の実行中に it がチェーンへ追加されるため、スナップショットを
// 1回 await するだけでは取りこぼす。チェーンが伸びなくなるまで待つ。
let previousChain;
do {
  previousChain = chain;
  await previousChain;
} while (chain !== previousChain);

console.log(`== ${pass} pass / ${fail} fail ==`);
process.exit(fail ? 1 : 0);
