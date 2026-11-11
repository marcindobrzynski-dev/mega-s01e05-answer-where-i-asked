// The pulse agent (plan: pulse §2–§4; issues #2, #3; words: docs/glossary.md).
// A pulse ping → read the tracker live → the model picks one open issue and a recommendation →
// code writes the answer, checks it, and sends it to the reply address.
// Nothing here touches the network by itself: `fetch` and the model call come in as `deps`.

export const MAX_ANSWER_CHARS = 2000;
export const STOPPED_PREFIX = 'pulse stopped: ';

export interface TrackerComment {
  by: string;
  body: string;
}

/** One issue as the course tracker shows it (docs/course-api.md, "The tracker"). */
export interface TrackerIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  by: string;
  body: string;
  comments: TrackerComment[];
}

/** What the model call hands back. `none`: the model did not answer at all (network, 429, 5xx). */
export type ModelResult =
  | { kind: 'pick'; issue: number; recommendation: string }
  | { kind: 'unusable'; reason: string }
  | { kind: 'none'; reason: string };

export interface PulseDeps {
  fetch: typeof fetch;
  /** Gets the open set, returns the model's pick. Never throws for a model that does not answer. */
  askModel: (openSet: TrackerIssue[]) => Promise<ModelResult>;
}

/** The part of a pulse ping the agent uses. */
export interface PulseWork {
  phrase?: unknown;
  reply: string;
  tracker: string;
}

/** `status` goes to the course; `log` is one line for the host's log. */
export interface PulseOutcome {
  status: 200 | 502;
  log: string;
}

// A list is an object to `typeof`; the tracker's records never are lists.
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

function readComment(value: unknown): TrackerComment | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.by !== 'string' || typeof raw.body !== 'string') return null;

  return { by: raw.by, body: raw.body };
}

function readIssue(value: unknown): TrackerIssue | string {
  const raw = asRecord(value);
  if (!raw) return 'an issue is not an object';

  const { number } = raw;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return 'an issue has no number';
  if (typeof raw.title !== 'string') return `issue #${number}: title is not text`;
  if (raw.state !== 'open' && raw.state !== 'closed') return `issue #${number}: state is not open or closed`;
  if (typeof raw.by !== 'string') return `issue #${number}: by is not text`;
  if (typeof raw.body !== 'string') return `issue #${number}: body is not text`;
  if (!Array.isArray(raw.comments)) return `issue #${number}: comments is not a list`;

  const comments: TrackerComment[] = [];
  for (const item of raw.comments) {
    const comment = readComment(item);
    if (!comment) return `issue #${number}: a comment is not { by, body }`;
    comments.push(comment);
  }

  // Built field by field: labels and any unknown field stay behind.
  return { number, title: raw.title, state: raw.state, by: raw.by, body: raw.body, comments };
}

// The tracker's JSON → its issues, or the reason the shape is wrong.
export function readIssues(json: unknown): TrackerIssue[] | string {
  const answer = asRecord(json);
  if (!answer) return 'the tracker answer is not an object';
  if (!Array.isArray(answer.issues)) return 'issues is not a list';

  const issues: TrackerIssue[] = [];
  for (const item of answer.issues) {
    const issue = readIssue(item);
    // One bad issue refuses the whole answer: a partial list would hide issues from the pick.
    if (typeof issue === 'string') return issue;
    issues.push(issue);
  }

  return issues;
}

// The open set: the issues with `state: open`, in the tracker's order. No author rule.
export function openIssues(issues: TrackerIssue[]): TrackerIssue[] {
  return issues.filter((issue) => issue.state === 'open');
}

// `"<phrase>" · #N: <recommendation>`
export function composeAnswer(phrase: string, issue: number, recommendation: string): string {
  return `"${phrase}" · #${issue}: ${recommendation.trim()}`;
}

const NAMED_ISSUE = /^#(\d+): /;
const ANY_ISSUE = /#(\d+)/g;

// null when the answer may leave; otherwise what failed, ready for a stopped line.
export function checkAnswer(text: string, phrase: string, openSet: number[]): string | null {
  // startsWith, not a RegExp: the phrase is read literally.
  const prefix = `"${phrase}" · `;
  if (!text.startsWith(prefix)) return 'the answer does not quote the phrase';

  const rest = text.slice(prefix.length);
  const named = NAMED_ISSUE.exec(rest);
  if (!named) return 'the answer names no issue';

  // The whole text: a closed issue named inside the phrase would be sent just as well.
  for (const [, digits] of text.matchAll(ANY_ISSUE)) {
    const n = Number(digits);
    if (!openSet.includes(n)) return `the answer names #${n}, which is not open`;
  }

  if (rest.slice(named[0].length).trim() === '') return 'the recommendation is empty';
  if (text.length > MAX_ANSWER_CHARS) return `the answer is ${text.length} characters, the limit is ${MAX_ANSWER_CHARS}`;

  return null;
}

// The log is one line: a reason from the model may carry line breaks.
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// One POST to the reply address; the answer and the stopped line both leave this way.
async function send(ping: PulseWork, deps: PulseDeps, text: string, what: string): Promise<PulseOutcome> {
  let res: Response;
  try {
    res = await deps.fetch(ping.reply, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    return { status: 502, log: oneLine(`${what} not delivered: the reply address did not answer`) };
  }
  
  const said = `reply address said ${res.status}`;
  // 409: the ping was answered already, so the course has its answer.
  if (res.status === 202 || res.status === 409) return { status: 200, log: oneLine(`${what}, ${said}`) };

  return { status: 502, log: oneLine(`${what} not delivered: ${said}`) };
}

// The stopped line goes to the course; the detail stays in the log.
function stop(ping: PulseWork, deps: PulseDeps, reason: string, detail?: string): Promise<PulseOutcome> {
  const what = detail ? `stopped: ${reason} (${detail})` : `stopped: ${reason}`;

  return send(ping, deps, STOPPED_PREFIX + reason, what);
}

// The tracker's issues, read live, or why they could not be read.
async function readTracker(ping: PulseWork, deps: PulseDeps): Promise<TrackerIssue[] | string> {
  let res: Response;
  try {
    res = await deps.fetch(ping.tracker, { method: 'GET' });
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

  return readIssues(json);
}

export async function runPulse(ping: PulseWork, deps: PulseDeps): Promise<PulseOutcome> {
  const { phrase } = ping;
  if (typeof phrase !== 'string' || phrase.trim() === '') return stop(ping, deps, 'the ping carries no phrase');

  const issues = await readTracker(ping, deps);
  if (typeof issues === 'string') return stop(ping, deps, 'the tracker does not answer', issues);

  const openSet = openIssues(issues);
  if (openSet.length === 0) return stop(ping, deps, 'nothing is open');

  const result = await deps.askModel(openSet);
  // No answer from the model: the ping stays unanswered, so the course may ping again.
  if (result.kind === 'none') return { status: 502, log: oneLine(`no answer sent: ${result.reason}`) };
  if (result.kind === 'unusable') return stop(ping, deps, `the model's answer cannot be used: ${result.reason}`);

  const answer = composeAnswer(phrase, result.issue, result.recommendation);
  const failed = checkAnswer(answer, phrase, openSet.map((issue) => issue.number));
  if (failed) return stop(ping, deps, failed);

  return send(ping, deps, answer, `answered #${result.issue}`);
}
