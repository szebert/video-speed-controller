// SPDX-License-Identifier: GPL-3.0-only

import {
  isTypingContext,
  matchHotkeyAction,
  type EffectiveHotkeyMap,
} from '../settings/hotkey-binding';
import { executeControllerAction } from './execute-controller-action';

export class HotkeyListener {
  private map: EffectiveHotkeyMap | null = null;
  private readonly abort = new AbortController();

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.onKeyDown, {
      capture: true,
      signal: this.abort.signal,
    });
  }

  setHotkeys(map: EffectiveHotkeyMap): void {
    this.map = map;
  }

  destroy(): void {
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
    void executeControllerAction(action);
  };
}
