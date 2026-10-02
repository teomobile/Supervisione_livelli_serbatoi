import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('minuti, ore e giorni', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(125 * 60_000)).toBe('2 h 05 min');
    expect(formatDuration((3 * 24 + 4) * 3_600_000)).toBe('3 g 4 h');
  });

  it('mai negativa', () => {
    expect(formatDuration(-5000)).toBe('0 min');
  });
});
