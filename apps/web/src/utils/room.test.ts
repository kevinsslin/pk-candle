import { describe, expect, it } from 'vitest';
import { normalizeRoomId } from './room';

describe('normalizeRoomId', () => {
  it('keeps lowercase safe ids', () => {
    expect(normalizeRoomId('gemini-01')).toBe('gemini-01');
  });

  it('lowercases and strips invalid chars', () => {
    expect(normalizeRoomId('GEMINI!!')).toBe('gemini');
  });

  it('falls back to public', () => {
    expect(normalizeRoomId('***')).toBe('public');
  });
});
