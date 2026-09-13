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
  hotkeyRepeatIntervalMs,
  hotkeyRepeatsWhileHeld,
  type SiteHotkeyAction,
} from '../settings/site-behavior';
import { executeControllerAction } from './execute-controller-action';
import type { MediaRegistry } from './media-registry';

export type HotkeyRepeatPolicy = {
  enabled: boolean;
  delayMs: number;
  rate: number;
};

type HeldHotkey = {
  action: SiteHotkeyAction;
  binding: HotkeyBinding;
  delayTimer?: number;
  intervalTimer?: number;
  inFlight: boolean;
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
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) {
      return;
    }
    const binding = this.map[action];
    if (!binding) {
      return;
    }
    const repeatable = hotkeyRepeatsWhileHeld(action, this.policy.enabled);
    this.cancelHeld();
    if (!repeatable) {
      this.dispatchOnce(action, binding);
      return;
    }
    const held = this.beginHold(action, binding);
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

  private beginHold(action: SiteHotkeyAction, binding: HotkeyBinding): HeldHotkey {
    const held: HeldHotkey = { action, binding, inFlight: false };
    this.held = held;
    return held;
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
    this.dispatchHeld(held);
  }

  private dispatchHeld(held: HeldHotkey): void {
    if (this.held !== held) {
      return;
    }
    held.inFlight = true;
    void this.execute(held.action, held.binding)
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

  private dispatchOnce(action: SiteHotkeyAction, binding: HotkeyBinding): void {
    void this.execute(action, binding);
  }

  private execute(action: SiteHotkeyAction, binding: HotkeyBinding): Promise<void> {
    return executeControllerAction(action, {
      resolveRegistry: this.resolveRegistry,
      source: { kind: 'hotkey', binding },
    });
  }

  private cancelHeld(): void {
    const held = this.held;
    if (!held) {
      return;
    }
    this.held = null;
    if (held.delayTimer != null) {
      this.target.clearTimeout(held.delayTimer);
    }
    if (held.intervalTimer != null) {
      this.target.clearInterval(held.intervalTimer);
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
