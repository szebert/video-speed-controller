// SPDX-License-Identifier: GPL-3.0-only

import { persistSiteSpeed } from '../storage/site-settings';
import { getSiteKey } from '../storage/site-key';

/** Quiet window after the last change before a burst writes its final speed. */
export const SITE_SPEED_PERSIST_COALESCE_MS = 400;

type PersistSiteSpeed = (url: string, speed: number) => Promise<void>;

type SiteSpeed = {
  url: string;
  speed: number;
};

type HostBurst = {
  revision: number;
  latest: SiteSpeed;
  lastWritten: SiteSpeed | null;
  active: boolean;
  inFlight: boolean;
  write: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
};

export type SiteSpeedPersistCoalescer = {
  persist: (url: string, speed: number) => Promise<void>;
  flush: () => Promise<void>;
};

function speedsEqual(left: SiteSpeed | null, right: SiteSpeed): boolean {
  return left != null && Object.is(left.speed, right.speed);
}

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
  const bursts = new Map<string, HostBurst>();

  function isCurrent(burst: HostBurst, hostname: string): boolean {
    return bursts.get(hostname) === burst;
  }

  function clearTimer(burst: HostBurst): void {
    if (burst.timer != null) {
      cancel(burst.timer);
      burst.timer = null;
    }
  }

  function discardBurst(burst: HostBurst, hostname: string): void {
    clearTimer(burst);
    burst.active = false;
    if (isCurrent(burst, hostname)) {
      bursts.delete(hostname);
    }
  }

  function scheduleTrailing(burst: HostBurst, hostname: string): void {
    clearTimer(burst);
    burst.timer = schedule(() => {
      burst.timer = null;
      if (!isCurrent(burst, hostname)) {
        return;
      }
      void finishBurst(burst, hostname).catch((error: unknown) => {
        console.warn('Failed to persist siteSpeed', error);
      });
    }, delayMs);
  }

  async function persistSnapshot(burst: HostBurst, hostname: string): Promise<void> {
    if (!isCurrent(burst, hostname)) {
      return;
    }
    const snapshot = burst.latest;
    if (speedsEqual(burst.lastWritten, snapshot)) {
      return;
    }
    burst.inFlight = true;
    const write = (async () => {
      try {
        await persistFn(snapshot.url, snapshot.speed);
        if (!isCurrent(burst, hostname)) {
          return;
        }
        burst.lastWritten = snapshot;
      } finally {
        burst.inFlight = false;
      }
    })();
    burst.write = write;
    await write;
  }

  async function finishBurst(burst: HostBurst, hostname: string): Promise<void> {
    if (burst.inFlight) {
      try {
        await burst.write;
      } catch {
        // The leading persist() caller already received this rejection.
      }
    }
    if (!isCurrent(burst, hostname)) {
      return;
    }
    if (burst.timer != null) {
      return;
    }
    if (!speedsEqual(burst.lastWritten, burst.latest)) {
      await persistSnapshot(burst, hostname);
    }
    if (!isCurrent(burst, hostname)) {
      return;
    }
    if (burst.timer != null) {
      return;
    }
    if (!speedsEqual(burst.lastWritten, burst.latest)) {
      scheduleTrailing(burst, hostname);
      return;
    }
    discardBurst(burst, hostname);
  }

  return {
    async persist(url, speed) {
      const siteKey = getSiteKey(url);
      if (!siteKey.supported) {
        await persistFn(url, speed);
        return;
      }
      const hostname = siteKey.hostname;
      const next = { url, speed };
      let burst = bursts.get(hostname);
      if (!burst) {
        burst = {
          revision: 0,
          latest: next,
          lastWritten: null,
          active: false,
          inFlight: false,
          write: Promise.resolve(),
          timer: null,
        };
        bursts.set(hostname, burst);
      }
      burst.latest = next;
      burst.revision += 1;
      const revision = burst.revision;
      if (burst.active) {
        scheduleTrailing(burst, hostname);
        return;
      }
      burst.active = true;
      try {
        await persistSnapshot(burst, hostname);
      } catch (error) {
        if (isCurrent(burst, hostname) && burst.revision === revision) {
          discardBurst(burst, hostname);
        }
        throw error;
      }
      if (!isCurrent(burst, hostname)) {
        return;
      }
      if (burst.timer == null) {
        scheduleTrailing(burst, hostname);
      }
    },
    async flush() {
      await Promise.all(
        [...bursts.entries()].map(async ([hostname, burst]) => {
          clearTimer(burst);
          await finishBurst(burst, hostname);
        }),
      );
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
