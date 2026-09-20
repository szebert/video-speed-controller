// SPDX-License-Identifier: GPL-3.0-only

import { persistGlobalCurrentSpeed } from '../storage/behavior-defaults';
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

type PersistGlobalSpeed = (speed: number) => Promise<void>;

type GlobalBurst = {
  revision: number;
  latest: number | null;
  lastWritten: number | null;
  active: boolean;
  inFlight: boolean;
  write: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
};

export type GlobalSpeedPersistCoalescer = {
  persist: (speed: number) => Promise<void>;
  flush: () => Promise<void>;
};

export function createGlobalSpeedPersistCoalescer(
  deps: {
    persist?: PersistGlobalSpeed;
    delayMs?: number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
  } = {},
): GlobalSpeedPersistCoalescer {
  const persistFn = deps.persist ?? persistGlobalCurrentSpeed;
  const delayMs = deps.delayMs ?? SITE_SPEED_PERSIST_COALESCE_MS;
  const schedule = deps.setTimeoutFn ?? setTimeout;
  const cancel = deps.clearTimeoutFn ?? clearTimeout;
  const burst: GlobalBurst = {
    revision: 0,
    latest: null,
    lastWritten: null,
    active: false,
    inFlight: false,
    write: Promise.resolve(),
    timer: null,
  };

  function clearTimer(): void {
    if (burst.timer != null) {
      cancel(burst.timer);
      burst.timer = null;
    }
  }

  function discardBurst(): void {
    clearTimer();
    burst.active = false;
    burst.latest = null;
    burst.lastWritten = null;
  }

  function scheduleTrailing(): void {
    clearTimer();
    burst.timer = schedule(() => {
      burst.timer = null;
      void finishBurst().catch((error: unknown) => {
        console.warn('Failed to persist globalSpeed', error);
      });
    }, delayMs);
  }

  async function persistSnapshot(): Promise<void> {
    const snapshot = burst.latest;
    if (snapshot == null || Object.is(burst.lastWritten, snapshot)) {
      return;
    }
    burst.inFlight = true;
    const write = (async () => {
      try {
        await persistFn(snapshot);
        burst.lastWritten = snapshot;
      } finally {
        burst.inFlight = false;
      }
    })();
    burst.write = write;
    await write;
  }

  async function finishBurst(): Promise<void> {
    if (burst.inFlight) {
      try {
        await burst.write;
      } catch {
        // The leading persist() caller already received this rejection.
      }
    }
    if (burst.timer != null) {
      return;
    }
    if (burst.latest != null && !Object.is(burst.lastWritten, burst.latest)) {
      await persistSnapshot();
    }
    if (burst.timer != null) {
      return;
    }
    if (burst.latest != null && !Object.is(burst.lastWritten, burst.latest)) {
      scheduleTrailing();
      return;
    }
    discardBurst();
  }

  return {
    async persist(speed) {
      burst.latest = speed;
      burst.revision += 1;
      const revision = burst.revision;
      if (burst.active) {
        scheduleTrailing();
        return;
      }
      burst.active = true;
      try {
        await persistSnapshot();
      } catch (error) {
        if (burst.revision === revision) {
          discardBurst();
        }
        throw error;
      }
      if (burst.timer == null) {
        scheduleTrailing();
      }
    },
    async flush() {
      clearTimer();
      await finishBurst();
    },
  };
}

let defaultSiteCoalescer = createSiteSpeedPersistCoalescer();
let defaultGlobalCoalescer = createGlobalSpeedPersistCoalescer();

export function persistSiteSpeedCoalesced(url: string, speed: number): Promise<void> {
  return defaultSiteCoalescer.persist(url, speed);
}

export function persistGlobalSpeedCoalesced(speed: number): Promise<void> {
  return defaultGlobalCoalescer.persist(speed);
}

export async function persistRememberedSpeeds(url: string, speed: number): Promise<void> {
  const results = await Promise.allSettled([
    persistSiteSpeedCoalesced(url, speed),
    persistGlobalSpeedCoalesced(speed),
  ]);
  const errors = results.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [];
    }
    return [result.reason instanceof Error ? result.reason.message : String(result.reason)];
  });
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

export function flushPersistedSpeeds(): Promise<void> {
  return Promise.all([defaultSiteCoalescer.flush(), defaultGlobalCoalescer.flush()]).then(
    () => undefined,
  );
}

export function resetSiteSpeedPersistCoalescerForTests(
  deps?: Parameters<typeof createSiteSpeedPersistCoalescer>[0],
): SiteSpeedPersistCoalescer {
  defaultSiteCoalescer = createSiteSpeedPersistCoalescer(deps);
  return defaultSiteCoalescer;
}

export function resetGlobalSpeedPersistCoalescerForTests(
  deps?: Parameters<typeof createGlobalSpeedPersistCoalescer>[0],
): GlobalSpeedPersistCoalescer {
  defaultGlobalCoalescer = createGlobalSpeedPersistCoalescer(deps);
  return defaultGlobalCoalescer;
}

export function resetSpeedPersistCoalescersForTests(deps?: {
  site?: Parameters<typeof createSiteSpeedPersistCoalescer>[0];
  global?: Parameters<typeof createGlobalSpeedPersistCoalescer>[0];
}): void {
  defaultSiteCoalescer = createSiteSpeedPersistCoalescer(deps?.site);
  defaultGlobalCoalescer = createGlobalSpeedPersistCoalescer(deps?.global);
}
