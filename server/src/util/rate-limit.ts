export class RateLimiter {
  private store = new Map<string, number[]>();
  nowFn: () => number = () => Date.now();

  allow(key: string, windowMs: number, limit: number): boolean {
    const now = this.nowFn();
    const cutoff = now - windowMs;
    let arr = this.store.get(key);
    if (!arr) {
      arr = [];
      this.store.set(key, arr);
    }
    let i = 0;
    while (i < arr.length && arr[i]! < cutoff) i++;
    if (i > 0) arr.splice(0, i);
    if (arr.length >= limit) return false;
    arr.push(now);
    return true;
  }
}
