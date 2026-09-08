// SPDX-License-Identifier: GPL-3.0-only

import type { BehaviorSettingChange } from '../../settings/site-behavior';

export const SETTINGS_WRITE_COALESCE_MS = 400;

export type SettingsWriteScope = { kind: 'global' } | { kind: 'site'; hostname: string };

export type SettingsWriteBatch<TChange = BehaviorSettingChange> = {
  scope: SettingsWriteScope;
  changes: TChange[];
};

export type SettingsWriteQueue = {
  flush: () => Promise<void>;
  isBusy: () => boolean;
};

export function settingsWriteScopeId(scope: SettingsWriteScope): string {
  return scope.kind === 'global' ? 'global' : `site:${scope.hostname}`;
}

export async function flushSettingsWriteQueues(
  ...queues: Array<SettingsWriteQueue | null | undefined>
): Promise<void> {
  for (const queue of queues) {
    await queue?.flush();
  }
}

export function settingsWriteQueuesBusy(
  ...queues: Array<SettingsWriteQueue | null | undefined>
): boolean {
  return queues.some((queue) => queue?.isBusy());
}

export function createSerialMutationLane(): {
  enqueue: <T>(work: () => Promise<T>) => Promise<T>;
} {
  let tail = Promise.resolve();
  return {
    enqueue(work) {
      const run = tail.then(work, work);
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

export function createSettingsWriteCoalescer<TChange>(deps: {
  key: (change: TChange) => string;
  send: (batch: SettingsWriteBatch<TChange>) => Promise<void>;
  delayMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): {
  enqueue: (scope: SettingsWriteScope, change: TChange) => void;
  flush: () => Promise<void>;
  isBusy: () => boolean;
} {
  const delayMs = deps.delayMs ?? SETTINGS_WRITE_COALESCE_MS;
  const schedule = deps.setTimeoutFn ?? setTimeout;
  const cancel = deps.clearTimeoutFn ?? clearTimeout;
  let inFlight = false;
  let quiet = true;
  let drainChain: Promise<void> = Promise.resolve();
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, { scope: SettingsWriteScope; change: TChange }>();

  function pendingKey(scope: SettingsWriteScope, itemKey: string): string {
    return `${settingsWriteScopeId(scope)}\0${itemKey}`;
  }

  function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
    if (timer != null) {
      cancel(timer);
    }
    return null;
  }

  function markBusy(): void {
    quiet = false;
    quietTimer = clearTimer(quietTimer);
  }

  function scheduleQuiet(): void {
    quietTimer = clearTimer(quietTimer);
    quietTimer = schedule(() => {
      quietTimer = null;
      quiet = true;
    }, delayMs);
  }

  function takeScopeBatch(): SettingsWriteBatch<TChange> | null {
    if (pending.size === 0) {
      return null;
    }
    const first = pending.values().next().value;
    if (!first) {
      return null;
    }
    const id = settingsWriteScopeId(first.scope);
    const changes: TChange[] = [];
    for (const [key, item] of [...pending.entries()]) {
      if (settingsWriteScopeId(item.scope) === id) {
        changes.push(item.change);
        pending.delete(key);
      }
    }
    return { scope: first.scope, changes };
  }

  async function drainUnlocked(): Promise<void> {
    if (inFlight) {
      return;
    }
    const next = takeScopeBatch();
    if (!next) {
      scheduleQuiet();
      return;
    }
    markBusy();
    inFlight = true;
    try {
      await deps.send(next);
    } finally {
      inFlight = false;
    }
    if (pending.size > 0) {
      await drainUnlocked();
    } else {
      scheduleQuiet();
    }
  }

  function drain(): Promise<void> {
    drainChain = drainChain.then(drainUnlocked, drainUnlocked);
    return drainChain;
  }

  function scheduleTrailing(): void {
    trailingTimer = clearTimer(trailingTimer);
    trailingTimer = schedule(() => {
      trailingTimer = null;
      void drain();
    }, delayMs);
  }

  return {
    enqueue(scope, change) {
      pending.set(pendingKey(scope, deps.key(change)), { scope, change });
      if (inFlight) {
        return;
      }
      if (quiet) {
        markBusy();
        void drain();
        return;
      }
      scheduleTrailing();
    },
    async flush() {
      trailingTimer = clearTimer(trailingTimer);
      if (!inFlight && pending.size === 0) {
        return;
      }
      await drain();
    },
    isBusy() {
      return inFlight || pending.size > 0 || trailingTimer != null;
    },
  };
}
