// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_BEHAVIOR_KEY } from '../settings/site-behavior';
import { createKeyedMutationQueue } from './keyed-mutation-queue';

export const SITE_SETTINGS_LOCK = 'site:*';
export const GLOBAL_DEFAULTS_LOCK = GLOBAL_BEHAVIOR_KEY;

const storageMutations = createKeyedMutationQueue<string>();

export function enqueueStorageMutation<T>(key: string, task: () => Promise<T>): Promise<T> {
  return storageMutations.enqueue(key, task);
}

export function resetStorageMutationQueue(): void {
  storageMutations.reset();
}

export function hasStorageMutation(key: string): boolean {
  return storageMutations.has(key);
}
