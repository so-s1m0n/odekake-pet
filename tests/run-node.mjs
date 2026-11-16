/**
 * tests/run-node.mjs
 * test-runner.html と同じ describe / it / assert を node 上で提供する簡易ランナー。
 * .kiro/hooks の「保存時にテスト実行」フックから呼ばれる。
 * 使い方: TZ=Asia/Tokyo node tests/run-node.mjs
 */

let pass = 0;
let fail = 0;

globalThis.describe = (name, fn) => {
  console.log(`▶ ${name}`);
  fn();
};

globalThis.it = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
  }
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

console.log(`== ${pass} pass / ${fail} fail ==`);
process.exit(fail ? 1 : 0);
