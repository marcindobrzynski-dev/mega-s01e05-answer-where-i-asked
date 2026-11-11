// The model call both agents share: OpenAI Responses API, plain fetch, Structured Outputs.
// `callModel` does the POST and reads the body. Each agent keeps its own instructions, schema and
// shape check in its own file: pulse-model.ts, test-writer-model.ts.

export const MODEL = 'gpt-6.1-terra';
export const RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const MAX_FIELD_CHARS = 4000;

export interface ModelDeps {
  fetch: typeof fetch;
  apiKey: string;
}

/**
 * What one call hands back, whoever asks. `json`: the model's text, parsed, shape not checked yet.
 * `none`: the model did not answer at all (network, 429, 5xx).
 */
export type CallResult =
  | { kind: 'json'; value: unknown }
  | { kind: 'unusable'; reason: string }
  | { kind: 'none'; reason: string };

// A body or a comment longer than MAX_FIELD_CHARS is cut and marked as cut.
export function cutText(text: string): string {
  if (text.length <= MAX_FIELD_CHARS) return text;

  // An emoji is two UTF-16 units: a cut between them leaves a lone high surrogate, so keep one unit less.
  const last = text.charCodeAt(MAX_FIELD_CHARS - 1);
  const kept = last >= 0xd800 && last <= 0xdbff ? MAX_FIELD_CHARS - 1 : MAX_FIELD_CHARS;

  return `${text.slice(0, kept)}\n[cut: ${text.length - kept} more characters]`;
}

// A list is an object to `typeof`; no part of a response body we read is a list.
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

// The content parts of every message item. The REST body has no top-level output_text,
// and a reasoning item may come before the message.
function messageParts(body: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(body.output)) return [];

  const parts: Record<string, unknown>[] = [];
  for (const value of body.output) {
    const item = asRecord(value);
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      const record = asRecord(part);
      if (record) parts.push(record);
    }
  }

  return parts;
}

function unusable(reason: string): { kind: 'unusable'; reason: string } {
  return { kind: 'unusable', reason };
}

// A 2xx Responses API body → the JSON the model wrote, or why there is none to use.
export function readOutputJson(json: unknown): CallResult {
  const body = asRecord(json);
  if (!body) return unusable('the response has no text');

  // A response that failed, was cancelled or is still running: the model did not answer.
  // Checked before anything else: a text in such a body is not an answer.
  if (typeof body.status === 'string' && body.status !== 'completed' && body.status !== 'incomplete') {
    return { kind: 'none', reason: `the model did not finish (${body.status})` };
  }

  // Incomplete next: a cut-off text may still parse, but it is not the whole answer.
  if (body.status === 'incomplete') {
    const reason = asRecord(body.incomplete_details)?.reason;
    return unusable(`the response is incomplete (${typeof reason === 'string' ? reason : 'unknown'})`);
  }

  const parts = messageParts(body);
  // The refusal text stays behind: it is the model's words, not ours to pass on.
  if (parts.some((part) => part.type === 'refusal')) return unusable('the model refused');

  const text = parts.find((part) => part.type === 'output_text' && typeof part.text === 'string')?.text;
  if (typeof text !== 'string') return unusable('the response has no text');

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return unusable('the text is not JSON');
  }

  return { kind: 'json', value };
}

// `error.code`, else `error.type`, of an OpenAI error body. Never `message`: it may quote the key.
function errorName(json: unknown): string | null {
  const error = asRecord(asRecord(json)?.error);
  if (!error) return null;
  if (typeof error.code === 'string') return error.code;
  if (typeof error.type === 'string') return error.type;

  return null;
}

// One POST to the Responses API and the reading of its body, for any agent: the agent builds
// `body` (instructions, schema, effort) and checks the shape of `value` itself.
// No timeout, no retry. Never rejects: a model that does not answer is `none`.
export async function callModel(deps: ModelDeps, body: Record<string, unknown>): Promise<CallResult> {
  let res: Response;
  try {
    res = await deps.fetch(RESPONSES_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${deps.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: 'none', reason: 'no connection to the model' };
  }

  // undefined marks a body that did not arrive: the connection broke off after the headers.
  let raw: string | undefined;
  try {
    raw = await res.text();
  } catch {
    raw = undefined;
  }

  // undefined marks a body that is not JSON: JSON.parse never returns it.
  let json: unknown;
  try {
    json = raw === undefined ? undefined : JSON.parse(raw);
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const name = errorName(json);
    return { kind: 'none', reason: `the model answered ${res.status}${name ? ` (${name})` : ''}` };
  }
  if (raw === undefined) return { kind: 'none', reason: "the model's body did not arrive" };
  if (json === undefined) return { kind: 'unusable', reason: 'the response is not JSON' };

  return readOutputJson(json);
}
