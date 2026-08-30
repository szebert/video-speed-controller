// SPDX-License-Identifier: GPL-3.0-only

const tabMutations = new Map<number, Promise<unknown>>();

export function enqueueTabMutation<T>(tabId: number, task: () => Promise<T>): Promise<T> {
  const previous = tabMutations.get(tabId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  tabMutations.set(
    tabId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export function resetTabMutationQueue(): void {
  tabMutations.clear();
}
