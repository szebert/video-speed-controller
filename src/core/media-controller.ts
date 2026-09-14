// SPDX-License-Identifier: GPL-3.0-only

import { decideRateChange, ratesAlmostEqual } from './arbitration';
import { safePause, safePlay } from './media-navigation';

export type OwnershipChangeHandler = (owned: boolean) => void;

/** Opaque handle for one temporary transport session. */
export type TransportSession = { readonly id: number };

type TransportState = {
  id: number;
  rate: number;
  /** Set when a session resumed a paused video, so ending restores pause. */
  startedPlayback: boolean;
};

export class MediaController {
  targetSpeed: number | null = null;
  lastWrittenRate?: number;
  retryCount = 0;
  surrendered = false;

  private restoreRate: number | null = null;
  private readonly abort = new AbortController();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private transport: TransportState | null = null;
  private transportSequence = 0;

  constructor(
    readonly video: HTMLVideoElement,
    private readonly onOwnershipChange?: OwnershipChangeHandler,
  ) {
    this.video.addEventListener('ratechange', this.onRateChange, {
      signal: this.abort.signal,
    });
  }

  setTarget(speed: number): void {
    const takingOwnership = this.targetSpeed == null || this.surrendered;
    if (takingOwnership) {
      this.restoreRate = this.video.playbackRate;
    }
    this.targetSpeed = speed;
    this.retryCount = 0;
    this.surrendered = false;
    this.clearRetry();
    if (takingOwnership) {
      this.onOwnershipChange?.(true);
    }
    if (this.transport) {
      // A temporary transport rate outranks the normal target until it ends.
      // Ending restores whatever target is current at that point.
      return;
    }
    this.writeRate(speed);
  }

  /** Rate of the active temporary session, or null when none is active. */
  get temporaryRate(): number | null {
    return this.transport?.rate ?? null;
  }

  /**
   * Applies a temporary transport rate without touching `targetSpeed`. Returns
   * the session that must be passed back to `endTemporaryRate`. A later call
   * replaces the active session; the replaced session's token goes stale.
   */
  beginTemporaryRate(
    rate: number,
    options: { resumePlayback?: boolean } = {},
  ): TransportSession | null {
    if (!Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    const id = ++this.transportSequence;
    this.transport = {
      id,
      rate,
      startedPlayback: this.transport?.startedPlayback ?? false,
    };
    this.retryCount = 0;
    this.clearRetry();
    this.writeRate(rate);
    if (options.resumePlayback && this.video.paused) {
      this.transport.startedPlayback = true;
      void safePlay(this.video);
    }
    return { id };
  }

  /** Ends only the given session. A stale or already-ended token is a no-op. */
  endTemporaryRate(session: TransportSession): void {
    if (this.transport?.id !== session.id) {
      return;
    }
    this.finishTemporaryRate();
  }

  private finishTemporaryRate(): void {
    const transport = this.transport;
    if (!transport) {
      return;
    }
    this.transport = null;
    this.retryCount = 0;
    this.clearRetry();
    if (this.targetSpeed != null && !this.surrendered) {
      this.writeRate(this.targetSpeed);
    }
    if (transport.startedPlayback) {
      // Also aborts a play() that has not resolved yet.
      safePause(this.video);
    }
  }

  destroy(): void {
    this.finishTemporaryRate();
    this.clearRetry();
    const restoreBaseline =
      this.targetSpeed != null && !this.surrendered && this.restoreRate != null;
    const baseline = this.restoreRate;
    this.targetSpeed = null;
    this.restoreRate = null;
    this.abort.abort();
    if (restoreBaseline && baseline != null) {
      this.writeRate(baseline);
    }
  }

  private onRateChange = (): void => {
    const transport = this.transport;
    if (transport) {
      this.defendTemporaryRate(transport);
      return;
    }
    if (this.targetSpeed == null) {
      return;
    }
    const decision = decideRateChange({
      currentRate: this.video.playbackRate,
      targetSpeed: this.targetSpeed,
      lastWrittenRate: this.lastWrittenRate,
      retryCount: this.retryCount,
      surrendered: this.surrendered,
    });
    if (decision.kind === 'retry') {
      this.retryCount = decision.retryCount;
      this.clearRetry();
      this.retryTimer = setTimeout(() => {
        if (!this.surrendered && this.targetSpeed != null) {
          this.writeRate(this.targetSpeed);
        }
      }, decision.delayMs);
      return;
    }
    if (decision.kind === 'adopt') {
      this.surrendered = true;
      this.clearRetry();
      this.onOwnershipChange?.(false);
    }
  };

  // A transport session is evaluated against its own rate and never surrenders
  // ownership: the temporary rate is not what the page is being judged against.
  private defendTemporaryRate(transport: TransportState): void {
    const decision = decideRateChange({
      currentRate: this.video.playbackRate,
      targetSpeed: transport.rate,
      lastWrittenRate: this.lastWrittenRate,
      retryCount: this.retryCount,
      surrendered: false,
    });
    if (decision.kind !== 'retry') {
      return;
    }
    this.retryCount = decision.retryCount;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      if (this.transport?.id === transport.id) {
        this.writeRate(transport.rate);
      }
    }, decision.delayMs);
  }

  private writeRate(speed: number): void {
    if (ratesAlmostEqual(this.video.playbackRate, speed)) {
      this.lastWrittenRate = this.video.playbackRate;
      return;
    }
    this.lastWrittenRate = speed;
    this.video.playbackRate = speed;
  }

  private clearRetry(): void {
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
