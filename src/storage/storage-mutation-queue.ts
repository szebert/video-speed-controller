// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_BEHAVIOR_KEY } from '../settings/site-behavior';
import { createKeyedMutationQueue } from './keyed-mutation-queue';

export const SITE_SETTINGS_LOCK = 'site:*';
export const GLOBAL_DEFAULTS_LOCK = GLOBAL_BEHAVIOR_KEY;
export const THEME_LOCK = 'pref:theme';

const storageMutations = createKeyedMutationQueue<string>();

export function enqueueStorageMutation<T>(key: string, task: () => Promise<T>): Promise<T> {
  return storageMutations.enqueue(key, task);
}

function uniqueSortedKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort();
}

export function enqueueStorageMutations<T>(
  keys: readonly string[],
  task: () => Promise<T>,
): Promise<T> {
  const ordered = uniqueSortedKeys(keys);
  if (ordered.length === 0) {
    return task();
  }
  const [head, ...rest] = ordered;
  if (head === undefined) {
    return task();
  }
  return enqueueStorageMutation(head, () =>
    rest.length === 0 ? task() : enqueueStorageMutations(rest, task),
  );
}

export function resetStorageMutationQueue(): void {
  storageMutations.reset();
}

export function hasStorageMutation(key: string): boolean {
  return storageMutations.has(key);
}
