// SPDX-License-Identifier: GPL-3.0-only

export function createKeyedMutationQueue<K extends string | number>(): {
  enqueue: <T>(key: K, task: () => Promise<T>) => Promise<T>;
  reset: () => void;
  has: (key: K) => boolean;
} {
  const pending = new Map<K, Promise<unknown>>();

  return {
    enqueue<T>(key: K, task: () => Promise<T>): Promise<T> {
      const previous = pending.get(key) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(task);
      const tracked = next.then(
        () => undefined,
        () => undefined,
      );
      pending.set(key, tracked);
      void tracked.finally(() => {
        if (pending.get(key) === tracked) {
          pending.delete(key);
        }
      });
      return next;
    },
    reset() {
      pending.clear();
    },
    has(key: K) {
      return pending.has(key);
    },
  };
}
