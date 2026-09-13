// SPDX-License-Identifier: GPL-3.0-only

import { persistSiteSpeed } from '../storage/site-settings';
import { getSiteKey } from '../storage/site-key';

/** Same quiet window as options settings writes. */
export const SITE_SPEED_PERSIST_COALESCE_MS = 400;

type PersistSiteSpeed = (url: string, speed: number) => Promise<void>;

type PendingSiteSpeed = {
  url: string;
  speed: number;
};

export type SiteSpeedPersistCoalescer = {
  persist: (url: string, speed: number) => Promise<void>;
  flush: () => Promise<void>;
};

export function createSiteSpeedPersistCoalescer(
  deps: {
    persist?: PersistSiteSpeed;
    delayMs?: number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
  } = {},
): SiteSpeedPersistCoalescer {
  const persistFn = deps.persist ?? persistSiteSpeed;
  const delayMs = deps.delayMs ?? SITE_SPEED_PERSIST_COALESCE_MS;
  const schedule = deps.setTimeoutFn ?? setTimeout;
  const cancel = deps.clearTimeoutFn ?? clearTimeout;
  let inFlight = false;
  let quiet = true;
  let drainChain: Promise<void> = Promise.resolve();
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, PendingSiteSpeed>();

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

  function takeNext(): PendingSiteSpeed | null {
    const first = pending.entries().next().value;
    if (!first) {
      return null;
    }
    pending.delete(first[0]);
    return first[1];
  }

  async function drainUnlocked(): Promise<void> {
    if (inFlight) {
      return;
    }
    const next = takeNext();
    if (!next) {
      scheduleQuiet();
      return;
    }
    markBusy();
    inFlight = true;
    try {
      await persistFn(next.url, next.speed);
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
      void drain().catch((error: unknown) => {
        console.warn('Failed to persist siteSpeed', error);
      });
    }, delayMs);
  }

  return {
    async persist(url, speed) {
      const siteKey = getSiteKey(url);
      if (!siteKey.supported) {
        await persistFn(url, speed);
        return;
      }
      pending.set(siteKey.hostname, { url, speed });
      if (inFlight) {
        return;
      }
      if (quiet) {
        markBusy();
        await drain();
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
  };
}

let defaultCoalescer = createSiteSpeedPersistCoalescer();

export function persistSiteSpeedCoalesced(url: string, speed: number): Promise<void> {
  return defaultCoalescer.persist(url, speed);
}

export function flushPersistedSiteSpeeds(): Promise<void> {
  return defaultCoalescer.flush();
}

export function resetSiteSpeedPersistCoalescerForTests(
  deps?: Parameters<typeof createSiteSpeedPersistCoalescer>[0],
): SiteSpeedPersistCoalescer {
  defaultCoalescer = createSiteSpeedPersistCoalescer(deps);
  return defaultCoalescer;
}
