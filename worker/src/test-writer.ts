// The test writer agent (plan: pulse §5; issue #4; rules: ADR 0006, docs/agents/test-writer.md;
// words: docs/glossary.md).
// A test ping → read its issue from the tracker live → the model writes one test → code checks it
// and sends it to the reply address. At most two tries.
// Nothing here touches the network by itself: `fetch` and the model call come in as `deps`.

import { readIssue, type TrackerIssue } from './tracker.js';

/** The reply's JSON body `{ path, test, red }` may be at most this many bytes in UTF-8. */
export const MAX_TEST_BYTES = 20_000;

/** What the model returns and, once checked, what goes to the reply address. */
export interface TestAnswer {
  path: string;
  test: string;
  red: string;
}

/** A test that already exists in this repo, bundled as text (src/texts.ts). */
export interface ExistingTest {
  path: string;
  text: string;
}

/** What the second try learns about the first: its answer, when there was one, and why it was refused. */
export interface PreviousTry {
  answer?: TestAnswer;
  reason: string;
}

/** Everything one try gives the model. */
export interface TestWriterInput {
  issue: TrackerIssue;
  /** The base: the files of the ping, whole. */
  files: Record<string, string>;
  existingTests: ExistingTest[];
  previousTry?: PreviousTry;
}

/** What the model call hands back. `none`: the model did not answer at all (network, 429, 5xx). */
export type TestModelResult =
  | { kind: 'test'; answer: TestAnswer }
  | { kind: 'unusable'; reason: string }
  | { kind: 'none'; reason: string };

export interface TestWriterDeps {
  fetch: typeof fetch;
  /** The course's origin, no slash at the end: the tracker is read at `<courseUrl>/rig/tracker/issues/<n>`. */
  courseUrl: string;
  existingTests: ExistingTest[];
  /** One try. Never throws for a model that does not answer. */
  askModel: (input: TestWriterInput) => Promise<TestModelResult>;
}

/** The part of a test ping the agent uses. */
export interface TestWork {
  issue: number;
  reply: string;
  files: Record<string, string>;
}

/**
 * `status` goes to the course; `log` is one line for the host's log; `test` is the checked test
 * that was POSTed to the reply address, whatever that address said.
 */
export interface TestWriterOutcome {
  status: 200 | 502;
  log: string;
  test?: TestAnswer;
}

const TEST_PATH = /^test\/[a-z0-9-]+\.test\.ts$/;
const ALLOWED_MODULES = ['vitest', 'node:fs', 'node:os', 'node:path'];
const SRC_PREFIX = '../src/';
const ALLOWED_FS_NAMES = ['mkdtempSync', 'writeFileSync', 'readFileSync', 'rmSync'];
// A reason goes to the log and to the second try: text the model wrote is shown this short.
const MAX_SHOWN_CHARS = 80;

// \v, \f, NEL and the Unicode separators break a line as well, in a log or in a source.
const LINE_BREAK = /[\r\n\v\f\u0085\u2028\u2029]/;

const NAME = /[A-Za-z_$][\w$]*/.source;
// No quote, slash or brace inside the braces: a quoted name or a comment there is not plain.
const NAMES = /\{([^{}'"`/]*)\}/.source;
// A plain import statement, read from its word `import` on: a default name, `{ names }` or both,
// then `from` and the source; or the source alone. Only white space between the parts.
// Groups: 1 or 3 the default name, 2 or 4 the names, 6 the source, or 8 the source alone.
const PLAIN_IMPORT = new RegExp(
  String.raw`import\s+(?:type\s+)?(?:(${NAME})\s*,\s*${NAMES}|(${NAME})|${NAMES})\s*from\s*(['"])([^'"\\\r\n]*)\5|import\s*(['"])([^'"\\\r\n]*)\7`,
  'y',
);
const ONE_NAME = new RegExp(String.raw`^(?:type\s+)?(${NAME})(?:\s+as\s+${NAME})?$`);
const WORD_IMPORT = /\bimport\b/g;
const WORD_EXPORT = /\bexport\b/;
const NEXT_CHAR = /\s*(\S?)/y;
const META_AT = /\.meta\b/y;
// `(`, or a comment before it: `require/**/(` is a call too.
const REQUIRE = /\brequire\s*(?:\(|\/[/*])/;
const WRITE_OR_REMOVE = /\b(?:writeFileSync|rmSync)\b/;
// A quoted text that is `runs` or `src`, or goes on below it: 'runs', "src/x", `runs${sep}x`.
// 'runs a thing' and 'src.txt' name no such folder.
const UNDER_RUNS_OR_SRC = /['"`](?:\.\.?\/)*(?:runs|src)[/\\$'"`]/;

/** One plain import statement: the names it imports, by imported name, and its source. */
interface PlainImport {
  names: string[];
  source: string;
}

function shown(text: string): string {
  return text.length > MAX_SHOWN_CHARS ? `${text.slice(0, MAX_SHOWN_CHARS)}…` : text;
}

// The names between the braces, by imported name: `a as b` gives `a`. null when a part is not a name.
function namesIn(braces: string): string[] | null {
  const names: string[] = [];
  for (const part of braces.split(',')) {
    if (part.trim() === '') continue;
    const name = ONE_NAME.exec(part.trim())?.[1];
    if (!name) return null;
    names.push(name);
  }

  return names;
}

// Every import of the test, or the reason one cannot be read.
// Fail closed, no parser: each word `import` in the text must open a plain import statement (or be
// `import.meta`). So a comment or a quoted name inside a statement cannot hide its source, and the
// word in a comment or a test name is refused too: the instructions tell the model.
function readImports(test: string): PlainImport[] | string {
  const imports: PlainImport[] = [];
  for (const word of test.matchAll(WORD_IMPORT)) {
    const at = word.index ?? 0;
    const after = at + word[0].length;

    PLAIN_IMPORT.lastIndex = at;
    const plain = PLAIN_IMPORT.exec(test);
    const names = plain ? namesIn(plain[2] ?? plain[4] ?? '') : null;
    if (plain && names) {
      if (plain[1] ?? plain[3]) names.unshift('default');
      imports.push({ names, source: plain[6] ?? plain[8] ?? '' });
      continue;
    }

    META_AT.lastIndex = after;
    if (META_AT.test(test)) continue;

    NEXT_CHAR.lastIndex = after;
    const next = NEXT_CHAR.exec(test)?.[1];
    if (next === '(') return 'the test uses a dynamic import(';
    if (next === '*') return 'the test uses import * as';

    return 'the test uses the word import outside a plain import statement';
  }

  return imports;
}

function isAllowedSource(source: string): boolean {
  if (ALLOWED_MODULES.includes(source)) return true;
  // `../src/../runs/x.js` starts with ../src/ and still leaves it.
  return source.startsWith(SRC_PREFIX) && !source.slice(SRC_PREFIX.length).split('/').includes('..');
}

function checkImports(test: string): string | null {
  // A test file exports nothing, and `export … from` is an import by another word.
  if (WORD_EXPORT.test(test)) return 'the test uses the word export';

  const imports = readImports(test);
  if (typeof imports === 'string') return imports;

  for (const { names, source } of imports) {
    if (!isAllowedSource(source)) return `the test imports from "${shown(source)}", which is not allowed`;
    if (source !== 'node:fs') continue;
    const name = names.find((n) => !ALLOWED_FS_NAMES.includes(n));
    if (name) return `the test imports ${shown(name)} from node:fs, which is not allowed`;
  }
  if (!imports.some(({ source }) => source.startsWith(SRC_PREFIX))) return 'the test imports nothing from ../src/';

  return null;
}

function checkCalls(test: string): string | null {
  if (REQUIRE.test(test)) return 'the test uses require(';
  // A tripwire, not a proof: it looks at one line, so a path held in a variable passes it.
  for (const line of test.split('\n')) {
    if (WRITE_OR_REMOVE.test(line) && UNDER_RUNS_OR_SRC.test(line)) return 'the test writes or removes under runs or src';
  }

  return null;
}

// null when the test may leave; otherwise what failed, ready for the log and for the second try.
export function checkTest(answer: TestAnswer, existingPaths: string[]): string | null {
  const { path, test, red } = answer;
  if (!TEST_PATH.test(path)) return 'the path is not test/<name>.test.ts';
  if (existingPaths.includes(path)) return "the path is an existing test's path";

  const shownRed = red.trim();
  if (shownRed === '') return 'red is empty';
  if (LINE_BREAK.test(shownRed)) return 'red has a line break';

  // The size first: the scans below then never read more than MAX_TEST_BYTES of text.
  const bytes = new TextEncoder().encode(JSON.stringify({ path, test, red })).length;
  if (bytes > MAX_TEST_BYTES) return `the reply is ${bytes} bytes, the limit is ${MAX_TEST_BYTES}`;

  return checkImports(test) ?? checkCalls(test);
}

// The log is one line: a reason from the model may carry line breaks.
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function nothingSent(reason: string): TestWriterOutcome {
  return { status: 502, log: oneLine(`no test sent: ${reason}`) };
}

// The ping's issue, read live, or why it could not be read.
async function readTrackerIssue(ping: TestWork, deps: TestWriterDeps): Promise<TrackerIssue | string> {
  let res: Response;
  try {
    res = await deps.fetch(`${deps.courseUrl}/rig/tracker/issues/${ping.issue}`, { method: 'GET' });
  } catch {
    return 'the GET threw';
  }
  if (!res.ok) return `the tracker said ${res.status}`;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return 'the tracker body is not JSON';
  }

  const issue = readIssue(json);
  if (typeof issue === 'string') return issue;
  // Another issue would get a test written for the wrong bug.
  if (issue.number !== ping.issue) return `the tracker answered with issue #${issue.number}`;

  return issue;
}

/** One try: a test that passed the check, what the next try learns from a refused one, or no answer. */
type Try =
  | { kind: 'passed'; answer: TestAnswer }
  | { kind: 'refused'; previous: PreviousTry }
  | { kind: 'none'; reason: string };

async function tryOnce(input: TestWriterInput, deps: TestWriterDeps): Promise<Try> {
  const result = await deps.askModel(input);
  if (result.kind === 'none') return result;
  if (result.kind === 'unusable') return { kind: 'refused', previous: { reason: result.reason } };

  // Built field by field: only `{ path, test, red }` ever leaves, `red` as the log shows it.
  const { path, test, red } = result.answer;
  const answer = { path, test, red: red.trim() };
  const reason = checkTest(answer, deps.existingTests.map((existing) => existing.path));
  if (reason) return { kind: 'refused', previous: { answer, reason } };

  return { kind: 'passed', answer };
}

// One POST to the reply address. `test` is in the outcome whatever the address said.
async function send(ping: TestWork, deps: TestWriterDeps, answer: TestAnswer): Promise<TestWriterOutcome> {
  const tail = ` | red: ${answer.red}`;

  let res: Response;
  try {
    res = await deps.fetch(ping.reply, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(answer),
    });
  } catch {
    return { status: 502, log: oneLine(`${answer.path} not delivered: the reply address did not answer${tail}`), test: answer };
  }

  const said = `reply address said ${res.status}`;
  // 409: the ping was answered already, so the course has its test.
  if (res.status === 202 || res.status === 409) return { status: 200, log: oneLine(`sent ${answer.path}, ${said}${tail}`), test: answer };

  return { status: 502, log: oneLine(`${answer.path} not delivered: ${said}${tail}`), test: answer };
}

export async function runTestWriter(ping: TestWork, deps: TestWriterDeps): Promise<TestWriterOutcome> {
  const issue = await readTrackerIssue(ping, deps);
  if (typeof issue === 'string') return nothingSent(`the tracker does not answer (${issue})`);
  if (issue.state === 'closed') return nothingSent(`issue #${issue.number} is closed`);

  const input: TestWriterInput = { issue, files: ping.files, existingTests: deps.existingTests };
  const first = await tryOnce(input, deps);
  if (first.kind === 'passed') return send(ping, deps, first.answer);
  // No answer from the model: the ping stays unanswered, so the course may ping again.
  if (first.kind === 'none') return nothingSent(first.reason);

  const second = await tryOnce({ ...input, previousTry: first.previous }, deps);
  if (second.kind === 'passed') return send(ping, deps, second.answer);
  const secondReason = second.kind === 'none' ? second.reason : second.previous.reason;

  return nothingSent(`try 1: ${first.previous.reason}; try 2: ${secondReason}`);
}
