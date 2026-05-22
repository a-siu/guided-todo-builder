export class CacheService {
  private store = new Map<string, unknown>();

  get<T>(key: string): T | null {
    return (this.store.get(key) as T) ?? null;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export const cacheService = new CacheService();
