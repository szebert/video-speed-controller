// SPDX-License-Identifier: GPL-3.0-only

import {
  hotkeyBindingsEqual,
  isTypingContext,
  matchHotkeyAction,
  type EffectiveHotkeyMap,
  type HotkeyBinding,
} from '../settings/hotkey-binding';
import {
  canonicalizeHotkeyRepeatDelayMs,
  canonicalizeHotkeyRepeatRate,
  hotkeyActionMode,
  hotkeyRepeatIntervalMs,
  type SiteHotkeyAction,
} from '../settings/site-behavior';
import { isMediaNavigationAction, type ControllerActionPhase } from './controller-action';
import { executeControllerAction } from './execute-controller-action';
import type { MediaRegistry, TransportHoldOwner } from './media-registry';

export type HotkeyRepeatPolicy = {
  enabled: boolean;
  delayMs: number;
  rate: number;
};

type HeldHotkey = {
  action: SiteHotkeyAction;
  binding: HotkeyBinding;
  /** `repeat` drives timers; `hold` runs one start and one matching end. */
  mode: 'repeat' | 'hold';
  /** Target locked on the initial keydown. Repeat ticks never reselect. */
  video: HTMLVideoElement | null;
  delayTimer?: number;
  intervalTimer?: number;
  inFlight: boolean;
  ended?: boolean;
};

const DEFAULT_REPEAT_POLICY: HotkeyRepeatPolicy = {
  enabled: false,
  delayMs: 500,
  rate: 15,
};

export class HotkeyListener {
  private map: EffectiveHotkeyMap | null = null;
  private policy: HotkeyRepeatPolicy = DEFAULT_REPEAT_POLICY;
  private held: HeldHotkey | null = null;
  private targetObserver: MutationObserver | null = null;
  private readonly abort = new AbortController();

  constructor(
    private readonly target: Window,
    private readonly resolveRegistry: () => MediaRegistry,
  ) {
    target.addEventListener('keydown', this.onKeyDown, {
      capture: true,
      signal: this.abort.signal,
    });
    target.addEventListener('keyup', this.onKeyUp, {
      capture: true,
      signal: this.abort.signal,
    });
    target.addEventListener('blur', this.onBlur, {
      signal: this.abort.signal,
    });
    target.document.addEventListener('visibilitychange', this.onVisibilityChange, {
      signal: this.abort.signal,
    });
  }

  setHotkeys(map: EffectiveHotkeyMap): void {
    this.map = map;
    const held = this.held;
    if (!held) {
      return;
    }
    const next = map[held.action];
    if (!next || !hotkeyBindingsEqual(next, held.binding)) {
      this.cancelHeld();
    }
  }

  setRepeatPolicy(policy: HotkeyRepeatPolicy): void {
    const next = {
      enabled: policy.enabled,
      delayMs: canonicalizeHotkeyRepeatDelayMs(policy.delayMs),
      rate: canonicalizeHotkeyRepeatRate(policy.rate),
    };
    if (
      this.policy.enabled === next.enabled &&
      this.policy.delayMs === next.delayMs &&
      this.policy.rate === next.rate
    ) {
      return;
    }
    this.policy = next;
    this.cancelHeld();
  }

  destroy(): void {
    this.cancelHeld();
    this.abort.abort();
    this.map = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.map) {
      return;
    }
    if (event.isComposing || event.key === 'Dead' || event.key === 'Process') {
      return;
    }
    if (isTypingContext(event)) {
      return;
    }
    const action = matchHotkeyAction(this.map, event);
    if (!action) {
      return;
    }
    const mode = hotkeyActionMode(action, this.policy.enabled);
    if (mode === 'disabled') {
      // Bindable scaffolding. Leave the key to the page instead of eating it.
      return;
    }
    const video = isMediaNavigationAction(action) ? this.resolveTarget() : null;
    if (isMediaNavigationAction(action) && !isLiveMedia(video)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) {
      return;
    }
    const binding = this.map[action];
    if (!binding) {
      return;
    }
    this.cancelHeld();
    if (mode === 'once') {
      this.dispatchOnce(action, binding, video);
      return;
    }
    if (mode === 'hold') {
      this.dispatchHold(this.beginHold(action, binding, 'hold', video), 'start');
      return;
    }
    const held = this.beginHold(action, binding, 'repeat', video);
    this.startDelayTimer(held);
    this.dispatchHeld(held);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const held = this.held;
    if (!held) {
      return;
    }
    if (event.code === held.binding.code || !this.bindingModifiersHeld(held.binding, event)) {
      this.cancelHeld();
    }
  };

  private readonly onBlur = (): void => {
    this.cancelHeld();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.target.document.visibilityState === 'hidden') {
      this.cancelHeld();
    }
  };

  private beginHold(
    action: SiteHotkeyAction,
    binding: HotkeyBinding,
    mode: 'repeat' | 'hold',
    video: HTMLVideoElement | null,
  ): HeldHotkey {
    const held: HeldHotkey = { action, binding, mode, video, inFlight: false };
    this.held = held;
    this.watchHeldVideo(video);
    return held;
  }

  private watchHeldVideo(video: HTMLVideoElement | null): void {
    this.unwatchHeldVideo();
    if (!video) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (!video.isConnected) {
        this.cancelHeld();
      }
    });
    observer.observe(video.ownerDocument.documentElement, { childList: true, subtree: true });
    this.targetObserver = observer;
  }

  private unwatchHeldVideo(): void {
    this.targetObserver?.disconnect();
    this.targetObserver = null;
  }

  private resolveTarget(): HTMLVideoElement | null {
    try {
      return this.resolveRegistry().resolveHotkeyTarget();
    } catch {
      return null;
    }
  }

  private startDelayTimer(held: HeldHotkey): void {
    held.delayTimer = this.target.setTimeout(() => {
      this.tryRepeat(held);
      this.startInterval(held);
    }, this.policy.delayMs);
  }

  private startInterval(held: HeldHotkey): void {
    if (this.held !== held) {
      return;
    }
    held.intervalTimer = this.target.setInterval(() => {
      this.tryRepeat(held);
    }, hotkeyRepeatIntervalMs(this.policy.rate));
  }

  private tryRepeat(held: HeldHotkey): void {
    if (this.held !== held || held.inFlight) {
      return;
    }
    if (held.video && !held.video.isConnected) {
      this.cancelHeld();
      return;
    }
    this.dispatchHeld(held);
  }

  private dispatchHeld(held: HeldHotkey): void {
    if (this.held !== held) {
      return;
    }
    if (held.video && !held.video.isConnected) {
      this.cancelHeld();
      return;
    }
    held.inFlight = true;
    void this.execute(held.action, held.binding, held.video, 'press')
      .catch(() => {
        if (this.held === held) {
          this.cancelHeld();
        }
      })
      .finally(() => {
        if (this.held === held) {
          held.inFlight = false;
        }
      });
  }

  // Exactly one start and one end per hold, whichever cancel path runs first.
  private dispatchHold(held: HeldHotkey, phase: 'start' | 'end'): void {
    if (phase === 'end') {
      if (held.ended) {
        return;
      }
      held.ended = true;
    }
    void this.execute(held.action, held.binding, held.video, phase, held).catch(() => {
      // executeControllerAction already logs transport failures.
    });
  }

  private dispatchOnce(
    action: SiteHotkeyAction,
    binding: HotkeyBinding,
    video: HTMLVideoElement | null,
  ): void {
    void this.execute(action, binding, video, 'press').catch(() => {
      // executeControllerAction already logs transport failures.
    });
  }

  private execute(
    action: SiteHotkeyAction,
    binding: HotkeyBinding,
    video: HTMLVideoElement | null,
    phase: ControllerActionPhase,
    hold?: TransportHoldOwner,
  ): Promise<void> {
    return executeControllerAction(action, {
      resolveRegistry: this.resolveRegistry,
      source: { kind: 'hotkey', binding, video },
      phase,
      ...(hold ? { hold } : {}),
    });
  }

  private cancelHeld(): void {
    const held = this.held;
    if (!held) {
      return;
    }
    this.held = null;
    this.unwatchHeldVideo();
    if (held.delayTimer != null) {
      this.target.clearTimeout(held.delayTimer);
    }
    if (held.intervalTimer != null) {
      this.target.clearInterval(held.intervalTimer);
    }
    if (held.mode === 'hold') {
      this.dispatchHold(held, 'end');
    }
  }

  private bindingModifiersHeld(binding: HotkeyBinding, event: KeyboardEvent): boolean {
    return (
      (!binding.ctrl || event.ctrlKey) &&
      (!binding.alt || event.altKey) &&
      (!binding.shift || event.shiftKey) &&
      (!binding.meta || event.metaKey)
    );
  }
}

function isLiveMedia(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return video != null && video.isConnected;
}
