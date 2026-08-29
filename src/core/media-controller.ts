// SPDX-License-Identifier: GPL-3.0-only

import { decideRateChange, ratesAlmostEqual } from './arbitration';

export class MediaController {
  targetSpeed: number | null = null;
  lastWrittenRate?: number;
  retryCount = 0;
  surrendered = false;

  private readonly abort = new AbortController();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly video: HTMLVideoElement) {
    this.video.addEventListener('ratechange', this.onRateChange, {
      signal: this.abort.signal,
    });
  }

  setTarget(speed: number): void {
    this.targetSpeed = speed;
    this.retryCount = 0;
    this.surrendered = false;
    this.clearRetry();
    this.writeRate(speed);
  }

  destroy(): void {
    this.clearRetry();
    this.abort.abort();
  }

  private onRateChange = (): void => {
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
    }
  };

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
