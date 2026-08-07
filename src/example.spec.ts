import { describe, it, expect } from 'vitest';
import { add } from './lib/utils/math';

describe('math.add', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('works with negatives', () => {
    expect(add(-1, -2)).toBe(-3);
  });
});
