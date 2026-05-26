import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/util/rate-limit.js';

describe('RateLimiter', () => {
  it('allows under-limit operations', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(rl.allow('user1:quiz', 10000, 5)).toBe(true);
    }
  });

  it('rejects over-limit', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.allow('user2:quiz', 10000, 5);
    expect(rl.allow('user2:quiz', 10000, 5)).toBe(false);
  });

  it('expires old entries', () => {
    const rl = new RateLimiter();
    const t0 = Date.now();
    let now = t0;
    rl.nowFn = () => now;
    for (let i = 0; i < 5; i++) rl.allow('user3:quiz', 1000, 5);
    expect(rl.allow('user3:quiz', 1000, 5)).toBe(false);
    now = t0 + 2000;
    expect(rl.allow('user3:quiz', 1000, 5)).toBe(true);
  });

  it('isolates keys', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.allow('user4:quiz', 10000, 5);
    expect(rl.allow('user4:quiz', 10000, 5)).toBe(false);
    expect(rl.allow('user4:addenda', 10000, 5)).toBe(true);
  });
});
