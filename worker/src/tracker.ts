// What both agents need from the course tracker (docs/course-api.md, "The tracker"):
// the shape of an issue, and reading the tracker's JSON into it. Nothing here touches the network.

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

// One raw issue → the issue, or the reason its shape is wrong.
export function readIssue(value: unknown): TrackerIssue | string {
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
