import type { AuthMe } from './api/types.js';

type Listener = () => void;

class Store<T> {
  private listeners = new Set<Listener>();
  constructor(private value: T) {}
  get(): T { return this.value; }
  set(next: T): void {
    this.value = next;
    for (const fn of this.listeners) fn();
  }
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

declare global {
  interface Window {
    __INITIAL__?: {
      user: AuthMe | null;
      build: { version: string };
    };
  }
}

export const userStore = new Store<AuthMe | null>(window.__INITIAL__?.user ?? null);
export const buildVersion = window.__INITIAL__?.build.version ?? 'unknown';
