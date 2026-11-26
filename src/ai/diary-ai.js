/**
* src/ai/diary-ai.js
* AI 絵日記モジュール（#BuildHybridAI 向け）。
*
* 帰宅時、旅の事実（ペット名・性格・行き先・出来事・おみやげ）から
* プロンプトを組み、Firebase AI Logic で一人称の日記文を生成する。
*
* 推論は3段フォールバック:
* 1. オンデバイス: Firebase AI Logic の mode: "prefer_on_device"
* （Chrome の Gemini Nano / Prompt API。ネット不要）
* 2. クラウド: 同じ呼び出しが自動で Gemini（Gemini Developer API）へ
* フォールバックする。応答の inferenceSource でどちらが使われたかを
* 判別する（JS SDK v12.5.0 以降）
* 3. テンプレ: Firebase 未設定・生成失敗・タイムアウト時は既存の
* テンプレート文（cardData.eventText）をそのまま使う。
* アプリは AI の状態によらず決して壊れない。
*
* ハイブリッド手順（公式 get-started Step 6）: generateContent() の前に、
* ユーザー操作のタイミングで model.initializeDeviceModel() を呼ぶことが
* 必須とされている。generateWithFirebase 内で1回だけ・失敗しても生成を
* 継続する形で呼ぶ（createDeviceModelInitializer を参照）。
*
* Firebase 実接続は 2026-11-24 に完了（プロジェクト odekake-pet）。
* FIREBASE_CONFIG が未設定（空）の間は isFirebaseConfigured() が false に
* なり、SDK を読み込まず即テンプレに落ちる。設定済みの今も、生成失敗・
* タイムアウト時はテンプレへ落ちるため、アプリの挙動は壊れない。
*
* App Check はデバッグプロバイダで運用する（#BuildHybridAI の審査環境
* 向け。公式ルールでデバッグトークン可）。詳細は APPCHECK_DEBUG_TOKEN
* のコメントと devlog（2026-11-24）を参照。
*
* テスト方針: ネットワーク依存の本体（generateDiaryText の実呼び出し）は
* 対象外とし、プロンプト組み立て・整形・フォールバック判定などの
* 純粋関数を単体テストする。
*/

// ─────────────────────────────────────────────
// Firebase 設定（2026-11-24 に実値を記入）
// ─────────────────────────────────────────────

/**
* Firebase Web アプリの設定値。
* 2026-11-24 に Firebase コンソール（プロジェクト odekake-pet）から
* 取得した firebaseConfig を記入した。
* firebaseConfig は公開情報（API キーはアクセス制御ではなく識別子）。
* 保護は App Check と API 制限で行う前提。
* 空文字の項目が1つでもあれば「未設定」として扱う。
*/
export const FIREBASE_CONFIG = {
apiKey: 'AIzaSyDhknhmHcO20azIhvkrBpBuw4cyrAKXjrw',
authDomain: 'odekake-pet.firebaseapp.com',
projectId: 'odekake-pet',
storageBucket: 'odekake-pet.firebasestorage.app',
messagingSenderId: '344677363426',
appId: '1:344677363426:web:0112b4c95fbbfae17ab8bb',
};

/**
* App Check のデバッグトークン（#BuildHybridAI 審査環境向け）。
*
* 方式の判断（2026-11-24、devlog にも記録）:
* 公式ドキュメントの方式を採用した。initializeAppCheck の初回呼び出し
* より前に self.FIREBASE_APPCHECK_DEBUG_TOKEN へトークン文字列を設定
* すると、SDK がデバッグモードに入り、検証プロバイダを経由せず
* デバッグトークンを App Check トークンへ交換する（ピン留めした
* v12.5.0 の firebase-app-check.js の実装で分岐を確認済み）。
* v12.5.0 に DebugProvider の export はないため、initializeAppCheck の
* provider 引数には CustomProvider（getToken は常に reject）を渡す。
* デバッグモードでは provider は呼ばれない。万一デバッグモードが
* 無効な環境では生成が失敗し、既存の3段フォールバックでテンプレに
* 落ちる。本番プロバイダ（reCAPTCHA）のキーは存在しないので入れない。
*
* このトークンは Firebase コンソール側で登録して初めて有効になる。
* 公開リポジトリに含まれる前提の運用（審査員が公開URLから実行する
* ため）で、漏洩時はコンソールの Manage debug tokens で即削除する。
*/
export const APPCHECK_DEBUG_TOKEN = '7514157f-277f-495f-b6cc-eee45a454c4b';

/**
* App Check のデバッグトークンをグローバルへ設定する。
* SDK の読み込み・初期化より前に呼ぶこと（初期化時に読まれる）。
*
* @param {object} [target] - 設定先（既定は globalThis。ブラウザでは self と同一）
* @returns {string} 設定したトークン
*/
export function installAppCheckDebugToken(target = globalThis) {
target.FIREBASE_APPCHECK_DEBUG_TOKEN = APPCHECK_DEBUG_TOKEN;
return target.FIREBASE_APPCHECK_DEBUG_TOKEN;
}

/** 読み込む Firebase JS SDK のバージョン（inferenceSource は v12.5.0 以降） */
const FIREBASE_SDK_VERSION = '12.5.0';

/** CDN のベース URL */
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

/** クラウド側モデル名（オンデバイス不可時のフォールバック先） */
const CLOUD_MODEL_NAME = 'gemini-2.5-flash';

/** 生成のタイムアウト（ミリ秒）。超えたらテンプレへ落ちる */
const GENERATION_TIMEOUT_MS = 20_000;

// ─────────────────────────────────────────────
// 推論元の定義
// ─────────────────────────────────────────────

/** 日記文の推論元 */
export const INFERENCE_SOURCE = {
ON_DEVICE: 'on_device',
CLOUD: 'cloud',
TEMPLATE: 'template',
};

/** 推論元 → 日記カードのバッジ表示文 */
const BADGE_LABELS = {
[INFERENCE_SOURCE.ON_DEVICE]: '📱 オンデバイスで書いた',
[INFERENCE_SOURCE.CLOUD]: '☁️ クラウドで書いた',
[INFERENCE_SOURCE.TEMPLATE]: '📝 テンプレで書いた',
};

/**
* 推論元に対応するバッジ表示文を返す。
* 未知の値・未設定の場合は null（バッジを描かない）。
*
* @param {string|null|undefined} source - INFERENCE_SOURCE の値
* @returns {string|null}
*/
export function badgeLabelFor(source) {
return BADGE_LABELS[source]?? null;
}

// ─────────────────────────────────────────────
// 純粋関数（テスト対象）
// ─────────────────────────────────────────────

/**
* Firebase 設定が揃っているかを判定する。
* apiKey / projectId / appId のすべてが空でない文字列のときだけ true。
*
* @param {object} [config] - 判定対象（省略時は FIREBASE_CONFIG）
* @returns {boolean}
*/
export function isFirebaseConfigured(config = FIREBASE_CONFIG) {
if (!config) return false;
return ['apiKey', 'projectId', 'appId'].every(
key => typeof config[key] === 'string' && config[key].trim().length > 0,
);
}

/** 性格値（0〜2）→ 日記プロンプト用の言葉 */
const CURIOSITY_WORDS = ['のんびり屋', 'ほどよく好奇心がある', '好奇心いっぱい'];
const SOCIABILITY_WORDS = ['マイペース', 'ほどよく社交的', 'とっても社交的'];

/**
* 性格パラメータを日本語の短い説明に変換する。
* 範囲外・欠損の値は中央値（1）に丸める。
*
* @param {{ curiosity: number, sociability: number}|null|undefined} personality
* @returns {string} 例: '好奇心いっぱいで、とっても社交的'
*/
export function describePersonality(personality) {
const pick = (words, value) => {
const idx = Number.isInteger(value)? Math.min(2, Math.max(0, value)): 1;
return words[idx];
};
const curiosity = pick(CURIOSITY_WORDS, personality?.curiosity);
const sociability = pick(SOCIABILITY_WORDS, personality?.sociability);
return `${curiosity}で、${sociability}`;
}

/**
* @typedef {Object} DiaryFacts
* @property {string} petName - ペット名
* @property {object|null} personality - 性格パラメータ（curiosity / sociability）
* @property {string} spotName - 行き先の表示名
* @property {string} eventText - 実際に起きた出来事（テンプレ文）
* @property {string|null} souvenirName - おみやげの表示名（null は無し）
*/

/**
* 旅の事実から日記生成プロンプトを組み立てる。
*
* @param {DiaryFacts} facts
* @returns {string}
*/
export function buildDiaryPrompt(facts) {
const lines = [
`あなたはペットの「${facts.petName}」です。`,
'今日のおでかけの思い出を、一人称の絵日記として書いてください。',
'',
'',
`- 行き先: ${facts.spotName}`,
`- わたしの性格: ${describePersonality(facts.personality)}`,
`- 起きたこと: ${facts.eventText}`,
];
if (facts.souvenirName) {
lines.push(`- おみやげ: ${facts.souvenirName}`);
}
lines.push(
'',
'',
'- ペットの一人称で、やさしく可愛い口調で書く',
'- 2〜3文で、全体で90文字以内にする',
'- 出来事の内容は変えず、言い回しだけを日記風にする',
'- 本文だけを出力する。タイトル・引用符・箇条書きは付けない',
);
return lines.join('\n');
}

/** 日記文の最大文字数（カード側の切り詰め上限と揃える） */
export const MAX_DIARY_LENGTH = 100;

/**
* AI の生出力を日記文として使える形に整える。
* 前後の引用符・鉤括弧・Markdown 記号・改行を取り除き、
* 最大文字数に切り詰める。使える文字列が残らなければ null を返す
* （null はフォールバックの合図）。
*
* @param {*} raw - AI の生出力
* @returns {string|null}
*/
export function cleanDiaryText(raw) {
if (typeof raw!== 'string') return null;
let text = raw.trim();
// Markdown の太字記号を除去
text = text.replace(/\*\*/g, '');
// 改行・連続空白を除去（日本語文は空白なしで自然につながる）
text = text.replace(/\s+/g, '');
// 前後の引用符・鉤括弧を除去（繰り返し現れる場合も落とす）
text = text.replace(/^[「『"“”'‘’]+/, '').replace(/[」』"“”'‘’]+$/, '');
if (text.length === 0) return null;
if (text.length > MAX_DIARY_LENGTH) {
text = text.slice(0, MAX_DIARY_LENGTH);
}
return text;
}

/**
* Firebase AI Logic の応答が返す inferenceSource の値を
* INFERENCE_SOURCE の値へ正規化する。
* SDK の値は 'ON_DEVICE' / 'IN_CLOUD'。未知の値は null。
*
* @param {*} value - response.inferenceSource の値
* @returns {string|null} INFERENCE_SOURCE の値または null
*/
export function normalizeInferenceSource(value) {
if (typeof value!== 'string') return null;
const v = value.trim().toUpperCase().replace(/-/g, '_');
if (v === 'ON_DEVICE') return INFERENCE_SOURCE.ON_DEVICE;
if (v === 'IN_CLOUD' || v === 'CLOUD') return INFERENCE_SOURCE.CLOUD;
return null;
}

/**
* 優先順位順の候補から、最初に使える日記文を選ぶ（フォールバック判定）。
* 各候補の text は cleanDiaryText で整形され、使えない候補は読み飛ばす。
*
* @param {Array<{ source: string, text: *}>} candidates - 優先順位順
* @returns {{ text: string, source: string}|null} すべて使えなければ null
*/
export function pickDiaryResult(candidates) {
for (const candidate of candidates) {
const text = cleanDiaryText(candidate?.text);
if (text!== null) {
return { text, source: candidate.source};
}
}
return null;
}

// ─────────────────────────────────────────────
// 生成本体（ネットワーク依存）
// ─────────────────────────────────────────────

/** 初期化済みの Firebase モデル（遅延初期化してキャッシュする） */
let cachedModel = null;

/**
* デバイスモデル初期化の「1回だけ実行」を担う関数を作る。
*
* 公式ハイブリッド手順（get-started Step 6）では、generateContent() の
* 前に、ユーザー操作（ボタンクリック）のタイミングで
* model.initializeDeviceModel() を呼ぶことが必須とされている。
* 初期化はモデルごとに1回で十分なため、初回の呼び出し結果（Promise）を
* 保持して使い回す。
*
* 失敗しても例外は投げない: オンデバイスが使えない環境では
* prefer_on_device の呼び出し自体がクラウドへ自動フォールバックする
* ため、初期化の失敗・タイムアウトは警告に留めて生成を継続する。
* メソッドを持たないモデル（旧 SDK 等）では何もしない。
*
* @returns {(model: object) => Promise<void>} 初期化を保証する関数
*/
export function createDeviceModelInitializer() {
let initPromise = null;
return function ensureDeviceModelInitialized(model) {
if (!initPromise) {
initPromise = (async () => {
if (typeof model?.initializeDeviceModel!== 'function') return;
let timer = null;
try {
await Promise.race([
model.initializeDeviceModel(),
new Promise((_, reject) => {
timer = setTimeout(
() => reject(new Error('デバイスモデルの初期化がタイムアウトしました')),
GENERATION_TIMEOUT_MS,
);
}),
]);
} catch (e) {
console.warn('[diary-ai] デバイスモデルの初期化に失敗しました（生成は継続します）:', e);
} finally {
if (timer!== null) clearTimeout(timer);
}
})();
}
return initPromise;
};
}

/** デバイスモデル初期化の実体（アプリ全体で1回だけ試みる） */
const ensureDeviceModelInitialized = createDeviceModelInitializer();

/**
* App Check をデバッグプロバイダで初期化する（ベストエフォート）。
* デバッグトークンのグローバル設定 → firebase-app-check.js の読み込み
* → initializeAppCheck の順。初期化に失敗しても例外は投げない
* （AI 生成自体は継続し、失敗時はテンプレへ落ちる）。
*
* @param {object} app - initializeApp の戻り値
*/
async function initAppCheck(app) {
try {
installAppCheckDebugToken();
const appCheckModule = await import(`${FIREBASE_CDN_BASE}/firebase-app-check.js`);
appCheckModule.initializeAppCheck(app, {
provider: new appCheckModule.CustomProvider({
getToken: () => Promise.reject(
new Error('本番用 App Check プロバイダ（reCAPTCHA）は未設定です'),
),
}),
isTokenAutoRefreshEnabled: true,
});
} catch (e) {
console.warn('[diary-ai] App Check の初期化に失敗しました（生成は継続します）:', e);
}
}

/**
* Firebase AI Logic のモデルを初期化して返す。
* SDK は CDN の ES モジュールを動的 import する（ビルドなし方針を維持）。
* getGenerativeModel はユーザー操作（ボタンクリック）の流れで呼ぶこと
* （inferenceMode の前提条件）。
*
* @returns {Promise<object>} GenerativeModel
*/
async function loadFirebaseModel() {
if (cachedModel) return cachedModel;

const appModule = await import(`${FIREBASE_CDN_BASE}/firebase-app.js`);
const aiModule = await import(`${FIREBASE_CDN_BASE}/firebase-ai.js`);

const app = appModule.initializeApp(FIREBASE_CONFIG);
await initAppCheck(app);
const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend()});

cachedModel = aiModule.getGenerativeModel(ai, {
mode: 'prefer_on_device',
model: CLOUD_MODEL_NAME,
});
return cachedModel;
}

/**
* Firebase AI Logic で1回生成し、生の応答情報を返す。
*
* @param {string} prompt
* @returns {Promise<{ text: string, inferenceSource: *}>}
* @throws 生成失敗・タイムアウト時
*/
async function generateWithFirebase(prompt) {
const model = await loadFirebaseModel();
// 公式ハイブリッド手順 Step 6: 生成の前にデバイスモデルを初期化する
// （1回だけ・失敗しても生成は継続する）
await ensureDeviceModelInitialized(model);
const timeout = new Promise((_, reject) => {
setTimeout(() => reject(new Error('AI生成がタイムアウトしました')), GENERATION_TIMEOUT_MS);
});
const result = await Promise.race([model.generateContent(prompt), timeout]);
return {
text: result.response.text(),
inferenceSource: result.response.inferenceSource,
};
}

/**
* 日記文を生成する公開 API。
* Firebase 未設定・生成失敗時は templateText をそのまま返し、
* 例外は投げない（呼び出し側は常に結果を受け取れる）。
*
* @param {DiaryFacts} facts - 旅の事実
* @param {string} templateText - フォールバック用のテンプレ文
* @returns {Promise<{ text: string, source: string}>}
* source は INFERENCE_SOURCE の値
*/
export async function generateDiaryText(facts, templateText) {
const fallback = { text: templateText, source: INFERENCE_SOURCE.TEMPLATE};

// 未設定なら SDK を読み込まず即テンプレ（公開版と同一動作）
if (!isFirebaseConfigured()) return fallback;

try {
const raw = await generateWithFirebase(buildDiaryPrompt(facts));
// inferenceSource が読めない旧 SDK では、ハイブリッド呼び出しが
// 成功した事実のみ確かなためクラウド扱いにする（ピン留めした
// v12.5.0 では通常どおり値が返る）
const source = normalizeInferenceSource(raw.inferenceSource)
?? INFERENCE_SOURCE.CLOUD;
const picked = pickDiaryResult([{ source, text: raw.text}]);
return picked?? fallback;
} catch (e) {
// 失敗は静かにテンプレへ落とす（アプリを壊さない）
console.warn('[diary-ai] AI生成に失敗したためテンプレ文を使います:', e);
return fallback;
}
}
