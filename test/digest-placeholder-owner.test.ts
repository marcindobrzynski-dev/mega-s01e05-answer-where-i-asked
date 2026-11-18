import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('digest owners', () => {
  it('keeps jobs with a literal placeholder as well as missing owners', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-owner-'));
    try {
      const lines = [
        { at: '2026-10-04T04:03:00+00:00', job: 'a/missing', status: 'ok', owner: null },
        { at: '2026-10-04T04:04:00+00:00', job: 'b/literal', status: 'ok', owner: '—' },
      ];
      writeFileSync(join(dir, '2026-10-04.jsonl'), lines.map((line) => JSON.stringify(line)).join('\n'));

      const night = readNight(dir, '2026-10-04')!;
      expect(night.rows.map((row) => [row.job, row.owner])).toEqual([
        ['a/missing', '—'],
        ['b/literal', '—'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
