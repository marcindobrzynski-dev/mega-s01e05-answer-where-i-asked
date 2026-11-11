import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAN_TEXTS } from '../src/texts.js';

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
