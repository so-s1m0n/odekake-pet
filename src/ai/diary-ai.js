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
*
* 診断（2026-11-26）: 生成は失敗を握りつぶしてテンプレへ落とす設計の
* ため、失敗理由が外から読めなかった。切り分け用に、直近の失敗理由を
* summarizeAiError で要約して保持し、getLastAiError() と
* window.__odekakeLastAiError の両方から読めるようにした。切り分け中は
* 帰宅画面にも小さく表示していたが、生成成功の実機確認が取れたため
* 提出用に表示は外した（2026-11-26）。保持の仕組みだけが残る。
*
* 再試行（2026-11-26）: モデル到達まで通ったあと、残る失敗はモデル側の
* 一時的な高負荷（500 "high demand"）だったため、クラウド生成の試行
* 単位に一時エラーだけの再試行を入れた（attemptWithRetry /
* isTransientAiError を参照）。404・権限系などの恒常エラーは
* 再試行しない。
*
* タイムアウト構造（2026-11-26 見直し）: 従来は試行ごとの20秒に加えて
* 全体の上限が無く、遅い応答（500 が返るまで約18秒）×再試行＋最後の
* 試行のタイムアウトが積み重なって全体が約60秒まで膨らんだ。
* 見直し後は、試行ごとに効く PER_ATTEMPT_TIMEOUT_MS（25秒）と、
* 生成全体の締め切り OVERALL_GENERATION_TIMEOUT_MS（90秒）の2段構え。
* 試行のタイムアウト自体も再試行の対象とし、総時間は締め切りで
* 抑える（attemptTimeoutMs / createGenerationTimeoutError を参照）。
*
* 記憶と許可（2026-11-26 追加）: 日記プロンプトには、端末内で組み立てた
* 「おもいで」の要約（facts.memoryDigest。domain/memory.js が冒険履歴
* から導出する）を含められる。おもいでは個人的な文脈なので、端末の
* 外へ出すかどうかは利用者の許可（options.shareMemoryWithCloud、
* 既定は false）で決まる:
*  - 許可なし: まず端末内のみ（mode: 'on_device'）で、おもいで入りの
*    プロンプトで生成を試みる。端末内で書ければ、おもいでは端末の
*    外に出ない。端末内で書けない場合は、おもいを除いたプロンプトで
*    通常のハイブリッド生成（prefer_on_device）に進む。
*  - 許可あり: おもいで入りのプロンプトで通常のハイブリッド生成。
* 試行計画は純粋関数 planDiaryAttempts が決める（テスト対象）。
* 性格の形成や記憶の集計そのものは端末内の決定的な処理であり、
* AI にもクラウドにも送られない。
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

/**
 * クラウド側モデル名（オンデバイス不可時のフォールバック先）。
 *
 * 注意: ハイブリッド（mode 指定）では、getGenerativeModel のトップレベル
 * model はクラウド推論に使われない。クラウド側モデルは inCloudParams で
 * 指定するのが公式仕様（Firebase AI Logic「Configuration options for
 * hybrid experiences」の "Override the default fallback model"）。
 * 未指定だと SDK（v12.5.0）の既定値 gemini-2.0-flash-lite が使われる。
 * 同モデルは提供終了しており、2026-11-26 の実機確認で 404 になった
 * （診断表示で判明）。このため inCloudParams へ明示指定する。
 *
 * gemini-2.5-flash は公式モデル一覧では「2026-12-01 から
 * gemini-3.5-flash-lite へ自動ルーティング、置き換え先は同モデル」と
 * されていたが、2026-11-26 の実機確認では 404
 * （"This model models/gemini-2.5-flash is no longer available to…"、
 * 新規プロジェクトでは利用不可とみられる）になった。
 * 次に指定した gemini-3.8-flash は有効でリクエストは届いたが、
 * 高負荷の 500（high demand）と応答の遅さが続いた（2026-11-26 実機）。
 * 日記は100文字程度の生成なので lite で十分と判断し、
 * gemini-3.5-flash-lite へ差し替える。公式モデル一覧
 * （firebase.google.com/docs/ai-logic/models、2026-11-26 再確認）で
 * Gemini Developer API・Agent Platform の両欄とも Shutdown date なし、
 * Release stage: Stable（2026-07-21 リリース）、Blaze 課金必須の
 * 脚注（脚注1）なし。3.1-flash-lite／2.5-flash／2.5-flash-lite／
 * 2.0 系の「Replacement」先にも指定されている現行の標準 lite。
 */
const CLOUD_MODEL_NAME = 'gemini-3.5-flash-lite';

/**
 * 1試行あたりの生成タイムアウト（ミリ秒）。
 * 再試行の各試行ごとに新しく計り直す（attemptTimeoutMs で全体の
 * 残り時間に丸める）。試行がこの時間を超えたら、その試行は
 * タイムアウトとして打ち切る（再試行の対象。generateWithFirebase
 * の shouldRetry を参照）。
 */
export const PER_ATTEMPT_TIMEOUT_MS = 25_000;

/**
 * 生成全体の上限（ミリ秒）。generateWithFirebase の開始時点から数え、
 * デバイスモデル初期化の待ち・全試行・再試行の待ち時間をすべて
 * 含めてこの時間を超えない（締め切り方式。attemptTimeoutMs を参照）。
 * 最悪ケースの内訳: 試行 25秒×3回＋再試行の待ち 2秒＋5秒＝82秒 ≤ 90秒。
 */
export const OVERALL_GENERATION_TIMEOUT_MS = 90_000;

/**
 * デバイスモデル初期化のタイムアウト（ミリ秒）。
 * 初期化は失敗しても生成を継続する一方通行の処理なので、
 * 生成側のタイムアウトとは分けて持つ（値は従来どおり20秒）。
 */
const DEVICE_INIT_TIMEOUT_MS = 20_000;

/**
* 一時エラー再試行の待ち時間（ミリ秒）。
* 初回失敗のあと2秒、2回目の失敗のあと5秒待って再試行する。
* 試行は初回＋再試行2回＝最大3回（MAX_GENERATION_ATTEMPTS）。
*/
export const RETRY_DELAYS_MS = [2000, 5000];

/** 生成の最大試行回数（初回を含む） */
export const MAX_GENERATION_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

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
* @property {string|null} [memoryDigest] - おもいでの要約（端末内で組み立て。
*   buildMemoryDigest の戻り値。無ければ記憶セクションを入れない）
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
if (typeof facts.memoryDigest === 'string' && facts.memoryDigest.length > 0) {
lines.push(`- わたしのおもいで: ${facts.memoryDigest}`);
}
lines.push(
'',
'',
'- ペットの一人称で、やさしく可愛い口調で書く',
'- 2〜3文で、全体で90文字以内にする',
'- 出来事の内容は変えず、言い回しだけを日記風にする',
);
if (typeof facts.memoryDigest === 'string' && facts.memoryDigest.length > 0) {
lines.push('- おもいでに触れるときは、さりげなく一言だけにする');
}
lines.push(
'- 本文だけを出力する。タイトル・引用符・箇条書きは付けない',
);
return lines.join('\n');
}

/**
* 日記生成の試行計画を決める（純粋関数）。
*
* おもいで（memoryDigest）がある場合、その扱いは許可で変わる:
*  - 許可なし（shareMemoryWithCloud !== true）: 先に端末内のみ
*    （on_device）でおもいで入りの生成を試み、ダメならおもいを
*    除いて通常のハイブリッド（prefer_on_device）で生成する。
*    おもいでは構造的に端末の外へ出ない。
*  - 許可あり: おもいで入りのまま通常のハイブリッドで生成する。
* おもいでが無い場合は、通常のハイブリッド1回だけ。
*
* @param {DiaryFacts} facts
* @param {object} [options]
* @param {boolean} [options.shareMemoryWithCloud]
* @returns {Array<{ mode: string, includeMemory: boolean }>}
*/
export function planDiaryAttempts(facts, options = {}) {
const hasMemory = typeof facts?.memoryDigest === 'string'
&& facts.memoryDigest.length > 0;
if (!hasMemory) {
return [{ mode: 'prefer_on_device', includeMemory: false }];
}
if (options?.shareMemoryWithCloud === true) {
return [{ mode: 'prefer_on_device', includeMemory: true }];
}
return [
{ mode: 'on_device', includeMemory: true },
{ mode: 'prefer_on_device', includeMemory: false },
];
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

/** 失敗理由の message を表示用に切り詰める上限 */
const MAX_ERROR_MESSAGE_LENGTH = 1000;

/**
* AI 生成の失敗理由を、画面表示・検証用に要約する。
* Firebase のエラーは name（'FirebaseError' 等）・message・code
* （'ai/...' 等）を持つことがある。取れる範囲だけを拾い、
* message は表示用に切り詰める。エラーでない値でも例外にしない。
*
* @param {*} error - 捕まえた値
* @returns {{ name: string, message: string, code: string|null,
* status: string|number|null, at: string }}
*/
export function summarizeAiError(error) {
const pick = value => (typeof value === 'string' && value.length > 0? value: null);
const name = pick(error?.name)?? 'UnknownError';
let message = pick(error?.message)?? (typeof error === 'string'? error: '');
if (message.length > MAX_ERROR_MESSAGE_LENGTH) {
message = `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`;
}
const rawStatus = error?.status;
const status = typeof rawStatus === 'number'
|| (typeof rawStatus === 'string' && rawStatus.length > 0)
? rawStatus
: null;
return {
name,
message,
code: pick(error?.code),
status,
at: new Date().toISOString(),
};
}

/**
* エラーが「一時的で再試行する価値がある」ものかを判定する。
*
* 対象は次のものだけ:
* - HTTP 500 / 503（status プロパティ、または Firebase の fetch-error の
*   ように message 本文へ "[500]" の形で埋まっているもの）
* - メッセージに high demand / try again later / overloaded を含むもの
*   （モデル側の一時的な高負荷。2026-11-26 の実機エラーがこの形）
* - ネットワーク系の fetch 失敗（HTTP ステータスを持たないもの）
*
* 404（モデル不存在）・403（権限系）などの恒常エラーは false。
* 本文に HTTP ステータスが明記されている場合はそちらを優先し、
* 4xx/5xx（500・503 を除く）は文言に関わらず再試行しない。
* エラーでない値・文字列などでも例外にしない。
*
* @param {*} error - 捕まえた値
* @returns {boolean}
*/
export function isTransientAiError(error) {
if (!error || typeof error!== 'object') return false;
const message = typeof error.message === 'string'? error.message: '';

// 明示的な HTTP ステータス（プロパティ）があれば最優先で見る
const rawStatus = error.status?? error.statusCode;
const status = typeof rawStatus === 'string' && /^\d+$/.test(rawStatus)
? Number(rawStatus)
: rawStatus;
if (status === 500 || status === 503) return true;
if (typeof status === 'number' && status >= 400) return false;

// Firebase の fetch-error は HTTP ステータスが本文の "[500]" に入る
const bracket = message.match(/\[(\d{3})\]/);
if (bracket) {
const code = Number(bracket[1]);
if (code === 500 || code === 503) return true;
if (code >= 400) return false;
}

// モデル側の一時的な高負荷を表す文言
if (/high demand/i.test(message)) return true;
if (/try again later/i.test(message)) return true;
if (/overloaded/i.test(message)) return true;

// ネットワーク系の fetch 失敗（HTTP ステータスが無いもの）
if (error.name === 'TypeError' && /fetch|network/i.test(message)) return true;
if (/failed to fetch|network\s?error/i.test(message)) return true;
return false;
}

/** 再試行の待ち時間の実体（テストでは差し替え可能にする） */
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
* 一時エラーだけ再試行しながら処理を実行する。
* 再試行の上限は delays の長さ（既定では初回＋2回＝最大3回）。
* 恒常エラーは即座に投げ直し、上限を超えたら最後のエラーを投げる。
*
* @template T
* @param {(attempt: number) => Promise<T>} attemptFn - 試行本体（引数は0始まりの試行番号）
* @param {object} [options]
* @param {number[]} [options.delays] - 再試行ごとの待ち時間（ミリ秒）
* @param {(ms: number) => Promise<void>} [options.sleep] - 待ち時間の実装（テスト用）
* @param {(error: *) => boolean} [options.shouldRetry] - 再試行可否の判定（テスト用）
* @returns {Promise<T>}
*/
export async function attemptWithRetry(attemptFn, options = {}) {
const delays = options.delays?? RETRY_DELAYS_MS;
const sleep = options.sleep?? defaultSleep;
const shouldRetry = options.shouldRetry?? isTransientAiError;
let lastError = null;
for (let attempt = 0; attempt <= delays.length; attempt++) {
try {
return await attemptFn(attempt);
} catch (e) {
lastError = e;
if (attempt >= delays.length || !shouldRetry(e)) throw e;
console.warn(
`[diary-ai] 一時的なエラーのため再試行します（${attempt + 2}/${delays.length + 1}回目）:`,
e,
);
await sleep(delays[attempt]);
}
}
throw lastError;
}

/**
* 生成タイムアウトのエラーを作る。
* message は従来どおり「AI生成がタイムアウトしました」（診断表示で
* そのまま読める文言を維持する）。再試行判定で識別できるよう、
* name に 'GenerationTimeoutError' を付ける。
*
* @returns {Error}
*/
export function createGenerationTimeoutError() {
const error = new Error('AI生成がタイムアウトしました');
error.name = 'GenerationTimeoutError';
return error;
}

/**
* エラーが生成タイムアウト（createGenerationTimeoutError 由来）かを判定する。
* エラーでない値でも例外にしない。
*
* @param {*} error - 捕まえた値
* @returns {boolean}
*/
export function isGenerationTimeoutError(error) {
return !!error && error.name === 'GenerationTimeoutError';
}

/**
* その試行に使えるタイムアウト時間（ミリ秒）を決める。
* 1試行の上限（PER_ATTEMPT_TIMEOUT_MS）と全体の残り時間の小さい方。
* 残り時間が無い・負の場合は 0（その試行は即タイムアウトになる）。
*
* @param {number} remainingMs - 生成全体の締め切りまでの残り時間
* @returns {number}
*/
export function attemptTimeoutMs(remainingMs) {
if (typeof remainingMs!== 'number' || Number.isNaN(remainingMs)) {
return PER_ATTEMPT_TIMEOUT_MS;
}
return Math.max(0, Math.min(PER_ATTEMPT_TIMEOUT_MS, remainingMs));
}

// ─────────────────────────────────────────────
// 失敗理由の保持（診断用）
// ─────────────────────────────────────────────

/** 直近の AI 生成の失敗理由（要約済み）。失敗が無ければ null */
let lastAiError = null;

/**
* 直近の失敗理由を返す（診断表示・ブラウザ検証用）。
*
* @returns {object|null} summarizeAiError の戻り値、または null
*/
export function getLastAiError() {
return lastAiError;
}

/**
* 失敗理由を保持する。あわせて window.__odekakeLastAiError にも
* 同じ内容を置き、ブラウザ検証でコンソールから読み取れるようにする。
*
* @param {*} error - 捕まえたエラー（要約前の生の値でよい）
* @returns {object} 保持した要約
*/
export function recordAiError(error) {
lastAiError = summarizeAiError(error);
globalThis.__odekakeLastAiError = lastAiError;
return lastAiError;
}

/** 保持中の失敗理由を消す（生成の試行開始時と画面初期化時に呼ぶ） */
export function clearAiError() {
lastAiError = null;
globalThis.__odekakeLastAiError = null;
}

// ─────────────────────────────────────────────
// 生成本体（ネットワーク依存）
// ─────────────────────────────────────────────

/** 初期化済みの Firebase モデル（推論モードごとに遅延初期化してキャッシュする） */
const cachedModels = new Map();

/** 初期化済みの AI ハンドル（アプリ初期化は全体で1回だけ） */
let cachedAi = null;

/**
* Firebase アプリと AI ハンドルを初期化して返す（1回だけ）。
* initializeApp は同じ名前で2回呼ぶと例外になるため、モデルが
* モード別に増えてもアプリ初期化はここに集約する。
*
* @returns {Promise<{ aiModule: object, ai: object }>}
*/
async function loadFirebaseAi() {
if (cachedAi) return cachedAi;

const appModule = await import(`${FIREBASE_CDN_BASE}/firebase-app.js`);
const aiModule = await import(`${FIREBASE_CDN_BASE}/firebase-ai.js`);

const app = appModule.initializeApp(FIREBASE_CONFIG);
await initAppCheck(app);
const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend()});

cachedAi = { aiModule, ai };
return cachedAi;
}

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
DEVICE_INIT_TIMEOUT_MS,
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
* @param {string} [mode] - 推論モード。'prefer_on_device'（既定:
*   端末内優先・クラウドへ自動フォールバック）または 'on_device'
*   （端末内のみ。おもいでを端末の外へ出さない生成に使う）
* @returns {Promise<object>} GenerativeModel
*/
async function loadFirebaseModel(mode = 'prefer_on_device') {
if (cachedModels.has(mode)) return cachedModels.get(mode);

const { aiModule, ai } = await loadFirebaseAi();

const model = mode === 'on_device'
? aiModule.getGenerativeModel(ai, {
// 端末内のみ。端末モデルが無い環境では生成自体が失敗し、
// 呼び出し側が次の試行（おもいなしのハイブリッド）へ進む
mode: 'on_device',
})
: aiModule.getGenerativeModel(ai, {
// オンデバイス指定（prefer_on_device）は従来どおり
mode: 'prefer_on_device',
model: CLOUD_MODEL_NAME,
// ハイブリッドではクラウド側モデルは inCloudParams で指定する
// （トップレベル model はクラウド推論に使われない。未指定だと SDK の
// 既定モデル gemini-2.0-flash-lite になり、提供終了で 404 になる。
// CLOUD_MODEL_NAME のコメントと devlog 2026-11-26 を参照）
inCloudParams: { model: CLOUD_MODEL_NAME },
});
cachedModels.set(mode, model);
return model;
}

/**
* Firebase AI Logic で1回生成し、生の応答情報を返す。
*
* @param {string} prompt
* @param {string} [mode] - 推論モード（loadFirebaseModel と同じ）
* @returns {Promise<{ text: string, inferenceSource: *}>}
* @throws 生成失敗・タイムアウト時
*/
async function generateWithFirebase(prompt, mode = 'prefer_on_device') {
const model = await loadFirebaseModel(mode);
// 生成全体の締め切り。デバイスモデル初期化の待ちもここから数える
const deadline = Date.now() + OVERALL_GENERATION_TIMEOUT_MS;
// 公式ハイブリッド手順 Step 6: 生成の前にデバイスモデルを初期化する
// （1回だけ・失敗しても生成は継続する）
await ensureDeviceModelInitialized(model);
// 再試行は生成の試行単位で入れる。各試行の中では従来どおり
// prefer_on_device のハイブリッド（オンデバイス→クラウド）が走るため、
// 試行順の意味は壊れない。一時エラー（モデル高負荷など）と試行単位の
// タイムアウトだけを最大3回まで再試行し、恒常エラーは即テンプレへ落ちる。
// タイムアウトは試行ごとに計り直し、全体の締め切り（90秒）で丸めるため、
// 遅い応答と再試行が積み重なっても総時間は上限を超えない
return attemptWithRetry(async () => {
const timeoutMs = attemptTimeoutMs(deadline - Date.now());
let timer = null;
const timeout = new Promise((_, reject) => {
timer = setTimeout(() => reject(createGenerationTimeoutError()), timeoutMs);
});
try {
const result = await Promise.race([model.generateContent(prompt), timeout]);
return {
text: result.response.text(),
inferenceSource: result.response.inferenceSource,
};
} finally {
if (timer!== null) clearTimeout(timer);
}
}, {
shouldRetry: e => isTransientAiError(e) || isGenerationTimeoutError(e),
});
}

/**
* 日記文を生成する公開 API。
* Firebase 未設定・生成失敗時は templateText をそのまま返し、
* 例外は投げない（呼び出し側は常に結果を受け取れる）。
*
* おもいで（facts.memoryDigest）の扱いは planDiaryAttempts の計画に
* 従う: 許可が無ければ、おもいで入り生成は端末内のみで試み、
* 失敗したらおもいを除いて通常のハイブリッド生成に進む。
* 全試行が失敗したらテンプレへ落ち、最後の失敗理由を保持する。
*
* @param {DiaryFacts} facts - 旅の事実
* @param {string} templateText - フォールバック用のテンプレ文
* @param {object} [options]
* @param {boolean} [options.shareMemoryWithCloud] - おもいをクラウド
*   生成にも使ってよいか（既定 false）
* @returns {Promise<{ text: string, source: string}>}
* source は INFERENCE_SOURCE の値
*/
export async function generateDiaryText(facts, templateText, options = {}) {
const fallback = { text: templateText, source: INFERENCE_SOURCE.TEMPLATE};

// 前回の失敗理由が残らないよう、試行のたびに消してから始める
clearAiError();

// 未設定なら SDK を読み込まず即テンプレ（公開版と同一動作）
if (!isFirebaseConfigured()) {
recordAiError({
name: 'NotConfiguredError',
message: 'Firebase が未設定のため AI 生成を試行できませんでした',
});
return fallback;
}

const attempts = planDiaryAttempts(facts, options);
let lastError = null;

for (const attempt of attempts) {
const attemptFacts = attempt.includeMemory
? facts
: { ...facts, memoryDigest: null };
try {
const raw = await generateWithFirebase(
buildDiaryPrompt(attemptFacts),
attempt.mode,
);
// inferenceSource が読めない旧 SDK では、ハイブリッド呼び出しが
// 成功した事実のみ確かなためクラウド扱いにする（ピン留めした
// v12.5.0 では通常どおり値が返る）。端末内のみの試行が成功した
// 場合は、構造的に端末内で書かれている
const source = attempt.mode === 'on_device'
? INFERENCE_SOURCE.ON_DEVICE
: (normalizeInferenceSource(raw.inferenceSource)
?? INFERENCE_SOURCE.CLOUD);
const picked = pickDiaryResult([{ source, text: raw.text}]);
if (picked) return picked;
// 生成は返ったが出力が日記文として使えなかった（次の試行へ）
lastError = {
name: 'EmptyResultError',
message: 'AI の出力が日記文として使えませんでした',
};
} catch (e) {
// この試行は失敗。次の試行があればそちらへ進む
lastError = e;
console.warn(
`[diary-ai] 生成試行が失敗しました（mode=${attempt.mode}）:`,
e,
);
}
}

// 全試行が失敗 → 静かにテンプレへ落とす（アプリを壊さない）。
// 理由は診断用に保持する（getLastAiError / __odekakeLastAiError）
if (lastError) recordAiError(lastError);
return fallback;
}
