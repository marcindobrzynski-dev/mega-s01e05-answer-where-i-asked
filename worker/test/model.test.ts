import { describe, expect, it } from 'vitest';
import { cutText, MAX_FIELD_CHARS } from '../src/model.js';

// The shared part of the model call. `callModel` itself is pinned through the agents that use it:
// test/pulse-model.test.ts (askModel) and test/test-writer-model.test.ts (askTestModel).

/** A high surrogate with no low one after it, or a low one with no high one before it. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('cutText', () => {
  it('finds a lone surrogate, and none in a whole emoji', () => {
    expect(LONE_SURROGATE.test('a\uD83D')).toBe(true);
    expect(LONE_SURROGATE.test('\uDE00a')).toBe(true);
    expect(LONE_SURROGATE.test('a😀b')).toBe(false);
  });

  it('returns a short text unchanged', () => {
    expect(cutText('The digest drops a row.')).toBe('The digest drops a row.');
  });

  it('returns an empty text unchanged', () => {
    expect(cutText('')).toBe('');
  });

  it('returns a text of exactly the limit unchanged', () => {
    const text = 'a'.repeat(MAX_FIELD_CHARS);
    expect(MAX_FIELD_CHARS).toBe(4000);
    expect(cutText(text)).toBe(text);
  });

  it('cuts a text one character over the limit and marks one character cut', () => {
    const text = 'a'.repeat(4000) + 'b';
    expect(cutText(text)).toBe('a'.repeat(4000) + '\n[cut: 1 more characters]');
  });

  it('keeps the first 4000 characters and names how many were removed', () => {
    const text = 'a'.repeat(4000) + 'b'.repeat(1000);
    expect(cutText(text)).toBe('a'.repeat(4000) + '\n[cut: 1000 more characters]');
  });

  it('does not split an emoji that straddles the cut, and counts the removed units from there', () => {
    // '😀' is two UTF-16 units: the high one is unit 4000, the low one unit 4001.
    const text = 'a'.repeat(3999) + '😀' + 'b'.repeat(10);
    expect(text.length).toBe(4011);
    const result = cutText(text);
    expect(result).toBe('a'.repeat(3999) + '\n[cut: 12 more characters]');
    expect(LONE_SURROGATE.test(result)).toBe(false);
  });

  it('keeps an emoji that ends exactly at the cut whole', () => {
    const text = 'a'.repeat(3998) + '😀' + 'b'.repeat(10);
    const result = cutText(text);
    expect(result).toBe('a'.repeat(3998) + '😀' + '\n[cut: 10 more characters]');
    expect(LONE_SURROGATE.test(result)).toBe(false);
  });

  it('cuts a text of emoji only on a whole emoji', () => {
    // 2001 emoji = 4002 units; the cut at 4000 falls between two emoji.
    const even = '😀'.repeat(2001);
    expect(cutText(even)).toBe('😀'.repeat(2000) + '\n[cut: 2 more characters]');
    // A one-unit prefix moves every emoji by one: the cut at 4000 falls inside one.
    const odd = 'a' + '😀'.repeat(2001);
    const result = cutText(odd);
    expect(result).toBe('a' + '😀'.repeat(1999) + '\n[cut: 4 more characters]');
    expect(LONE_SURROGATE.test(result)).toBe(false);
  });
});
