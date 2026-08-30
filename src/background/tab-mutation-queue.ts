// SPDX-License-Identifier: GPL-3.0-only

import { createKeyedMutationQueue } from '../storage/keyed-mutation-queue';

const tabMutations = createKeyedMutationQueue<number>();

export function enqueueTabMutation<T>(tabId: number, task: () => Promise<T>): Promise<T> {
  return tabMutations.enqueue(tabId, task);
}

export function resetTabMutationQueue(): void {
  tabMutations.reset();
}

export function hasTabMutation(tabId: number): boolean {
  return tabMutations.has(tabId);
}
