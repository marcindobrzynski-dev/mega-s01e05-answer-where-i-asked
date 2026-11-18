import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXISTING_TESTS, PLAN_TEXTS } from '../src/texts.js';

// The repo root: this file is worker/test/texts.test.ts.
const ROOT = join(import.meta.dirname, '..', '..');

describe('PLAN_TEXTS', () => {
  it('carries plan.md as it is on disk', () => {
    expect(PLAN_TEXTS.plan).toBe(readFileSync(`${ROOT}/plan.md`, 'utf8'));
  });

  it('lists every plan in docs/plans/done, so a finished plan cannot be forgotten', () => {
    const onDisk = readdirSync(`${ROOT}/docs/plans/done`).filter((name) => name.endsWith('.md')).sort();

    expect(PLAN_TEXTS.done.map((done) => done.name).sort()).toEqual(onDisk);
  });

  it('carries each finished plan under its own name', () => {
    expect(PLAN_TEXTS.done.length).toBeGreaterThan(0);
    for (const done of PLAN_TEXTS.done) {
      expect(done.text).toBe(readFileSync(`${ROOT}/docs/plans/done/${done.name}`, 'utf8'));
    }
  });
});

describe('EXISTING_TESTS', () => {
  it('lists the two existing tests of the repo, in order', () => {
    expect(EXISTING_TESTS.map((test) => test.path)).toStrictEqual(['test/digest.test.ts', 'test/status.test.tsx']);
  });

  it('carries each existing test as it is on disk', () => {
    expect(EXISTING_TESTS).toHaveLength(2);
    for (const test of EXISTING_TESTS) {
      expect(Object.keys(test).sort()).toStrictEqual(['path', 'text']);
      expect(test.text).toBe(readFileSync(join(ROOT, test.path), 'utf8'));
    }
  });
});
