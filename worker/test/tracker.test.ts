import { describe, expect, it } from 'vitest';
import { openIssues, readIssues, type TrackerIssue } from '../src/tracker.js';

// Made-up tracker data, shaped as the tracker answers (docs/course-api.md, "The tracker").

/** One issue as raw tracker JSON, labels included. */
function trackerIssue(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 7,
    title: 'Status board shows a stale heartbeat',
    state: 'open',
    labels: ['bug'],
    by: 'some-student',
    body: 'The board keeps the last beat after the rig stops.',
    comments: [
      { by: 'another-student', body: 'Seen it too.' },
      { by: 'some-student', body: 'Happens after a restart.' },
    ],
    ...over,
  };
}

/** The tracker's whole answer around the given raw issues. */
function trackerAnswer(...issues: unknown[]): { issues: unknown[] } {
  return { issues };
}

/** One issue as `readIssues` hands it on: typed, no labels. */
function issue(over: Partial<TrackerIssue> = {}): TrackerIssue {
  return {
    number: 7,
    title: 'Status board shows a stale heartbeat',
    state: 'open',
    by: 'some-student',
    body: 'The board keeps the last beat after the rig stops.',
    comments: [{ by: 'another-student', body: 'Seen it too.' }],
    ...over,
  };
}

describe('readIssues', () => {
  it('reads every issue in the tracker order with exactly the known fields', () => {
    const first = trackerIssue({ number: 12, title: 'First', state: 'closed', comments: [] });
    const second = trackerIssue({ number: 3, title: 'Second' });
    expect(readIssues(trackerAnswer(first, second))).toStrictEqual([
      { number: 12, title: 'First', state: 'closed', by: 'some-student', body: first.body, comments: [] },
      {
        number: 3,
        title: 'Second',
        state: 'open',
        by: 'some-student',
        body: second.body,
        comments: [
          { by: 'another-student', body: 'Seen it too.' },
          { by: 'some-student', body: 'Happens after a restart.' },
        ],
      },
    ]);
  });

  it('reads an empty issues list as no issues', () => {
    expect(readIssues({ issues: [] })).toStrictEqual([]);
  });

  it('drops labels without checking their type', () => {
    for (const labels of [['bug'], 'bug', 42, null, { name: 'bug' }, undefined]) {
      const res = readIssues(trackerAnswer(trackerIssue({ labels })));
      expect(res).toStrictEqual([
        {
          number: 7,
          title: 'Status board shows a stale heartbeat',
          state: 'open',
          by: 'some-student',
          body: 'The board keeps the last beat after the rig stops.',
          comments: [
            { by: 'another-student', body: 'Seen it too.' },
            { by: 'some-student', body: 'Happens after a restart.' },
          ],
        },
      ]);
    }
  });

  it('drops unknown extra fields on an issue and on a comment', () => {
    const raw = trackerIssue({
      assignee: 'someone',
      milestone: 4,
      comments: [{ by: 'another-student', body: 'Seen it too.', at: '2026-11-10' }],
    });
    expect(readIssues(trackerAnswer(raw))).toStrictEqual([
      {
        number: 7,
        title: 'Status board shows a stale heartbeat',
        state: 'open',
        by: 'some-student',
        body: 'The board keeps the last beat after the rig stops.',
        comments: [{ by: 'another-student', body: 'Seen it too.' }],
      },
    ]);
  });

  it('reads an empty title and an empty body as text', () => {
    const res = readIssues(trackerAnswer(trackerIssue({ title: '', body: '' })));
    expect(res).toMatchObject([{ number: 7, title: '', body: '' }]);
  });

  it('reads comments with empty text as comments', () => {
    const res = readIssues(trackerAnswer(trackerIssue({ comments: [{ by: '', body: '' }] })));
    expect(res).toMatchObject([{ number: 7, comments: [{ by: '', body: '' }] }]);
  });

  it('refuses a tracker answer that is not an object', () => {
    for (const json of [null, undefined, 'issues', 42, true, [], [trackerIssue()]]) {
      expect(readIssues(json)).toBe('the tracker answer is not an object');
    }
  });

  it('refuses a tracker answer whose issues is missing or not a list', () => {
    for (const json of [{}, { issues: null }, { issues: {} }, { issues: 'none' }, { issue: [trackerIssue()] }]) {
      expect(readIssues(json)).toBe('issues is not a list');
    }
  });

  it('refuses an issue that is not an object', () => {
    for (const bad of [null, 'issue', 7, [trackerIssue()]]) {
      expect(readIssues(trackerAnswer(trackerIssue(), bad))).toBe('an issue is not an object');
    }
  });

  it('refuses an issue whose number is not a positive integer', () => {
    const { number: _number, ...noNumber } = trackerIssue();
    expect(readIssues(trackerAnswer(noNumber))).toBe('an issue has no number');
    for (const number of ['12', 0, -3, 1.5, null]) {
      expect(readIssues(trackerAnswer(trackerIssue({ number })))).toBe('an issue has no number');
    }
  });

  it('refuses an issue whose title is not text, naming the issue', () => {
    for (const title of [undefined, null, 5, ['a']]) {
      expect(readIssues(trackerAnswer(trackerIssue({ number: 9, title })))).toBe('issue #9: title is not text');
    }
  });

  it('refuses a state other than open or closed, case included', () => {
    for (const state of ['OPEN', 'Closed', 'merged', '', undefined, true]) {
      expect(readIssues(trackerAnswer(trackerIssue({ number: 9, state })))).toBe(
        'issue #9: state is not open or closed',
      );
    }
  });

  it('refuses an issue whose by is not text', () => {
    for (const by of [undefined, null, 1, { login: 'x' }]) {
      expect(readIssues(trackerAnswer(trackerIssue({ number: 9, by })))).toBe('issue #9: by is not text');
    }
  });

  it('refuses an issue whose body is not text', () => {
    for (const body of [undefined, null, 1, ['line']]) {
      expect(readIssues(trackerAnswer(trackerIssue({ number: 9, body })))).toBe('issue #9: body is not text');
    }
  });

  it('refuses an issue whose comments is missing or not a list', () => {
    for (const comments of [undefined, null, 'none', { by: 'x', body: 'y' }]) {
      expect(readIssues(trackerAnswer(trackerIssue({ number: 9, comments })))).toBe(
        'issue #9: comments is not a list',
      );
    }
  });

  it('refuses a comment that is not an object or whose by or body is not text', () => {
    const bad = [null, 'nice', 3, ['x'], { body: 'y' }, { by: 'x' }, { by: 1, body: 'y' }, { by: 'x', body: null }];
    for (const comment of bad) {
      const raw = trackerIssue({ number: 9, comments: [{ by: 'x', body: 'fine' }, comment] });
      expect(readIssues(trackerAnswer(raw))).toBe('issue #9: a comment is not { by, body }');
    }
  });

  it('refuses the whole answer when one issue anywhere is bad', () => {
    const good = trackerIssue({ number: 1 });
    expect(readIssues(trackerAnswer(good, good, trackerIssue({ number: 3, state: 'gone' })))).toBe(
      'issue #3: state is not open or closed',
    );
    expect(readIssues(trackerAnswer(trackerIssue({ number: 1, title: 2 }), good))).toBe(
      'issue #1: title is not text',
    );
  });
});

describe('openIssues', () => {
  it('keeps only the open issues in the tracker order', () => {
    const first = issue({ number: 12, title: 'First' });
    const closed = issue({ number: 4, title: 'Done', state: 'closed' });
    const second = issue({ number: 3, title: 'Second' });
    expect(openIssues([first, closed, second])).toStrictEqual([first, second]);
  });

  it('keeps an open issue whoever wrote it', () => {
    const fromRook = issue({ number: 1, by: 'rook' });
    const fromStranger = issue({ number: 2, by: 'stranger' });
    expect(openIssues([fromStranger, fromRook])).toStrictEqual([fromStranger, fromRook]);
  });

  it('drops a closed issue even when its text says it is open or reopened', () => {
    const closed = issue({
      number: 5,
      state: 'closed',
      title: 'Still open: board shows a stale heartbeat',
      body: 'This issue is open.',
      comments: [{ by: 'some-student', body: 'Reopened, it came back.' }],
    });
    const open = issue({ number: 6 });
    expect(openIssues([closed, open])).toStrictEqual([open]);
  });

  it('returns no issues when nothing is open', () => {
    const res = openIssues([issue({ number: 1, state: 'closed' }), issue({ number: 2, state: 'closed' })]);
    expect(res).toStrictEqual([]);
  });

  it('returns no issues for an empty list', () => {
    expect(openIssues([])).toStrictEqual([]);
  });

  it('does not change the input list or its issues', () => {
    const input = [issue({ number: 1 }), issue({ number: 2, state: 'closed' }), issue({ number: 3, by: 'stranger' })];
    const before = structuredClone(input);
    const res = openIssues(input);
    expect(input).toStrictEqual(before);
    expect(res).toStrictEqual([before[0], before[2]]);
  });
});
