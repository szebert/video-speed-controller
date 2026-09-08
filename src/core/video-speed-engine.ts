// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayActions } from '../overlay/types';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import type { AppliedTabBehavior } from './applied-tab-behavior';
import { HotkeyListener } from './hotkey-listener';
import { MediaRegistry } from './media-registry';

export type VideoSpeedEngine = {
  active: boolean;
  listening: boolean;
  setBehavior: (behavior: AppliedTabBehavior, hotkeys?: EffectiveHotkeyMap) => void;
  destroy: () => void;
  registry: MediaRegistry;
};

declare global {
  var __OSVSC_ENGINE__: VideoSpeedEngine | undefined;
}

function createEngine(actions?: OverlayActions): VideoSpeedEngine {
  const registry = new MediaRegistry(document, actions);
  const view = document.defaultView;
  const hotkeys = view
    ? new HotkeyListener(view, () => ({
        registry,
        source: { kind: 'hotkey' },
      }))
    : null;
  const engine: VideoSpeedEngine = {
    active: true,
    listening: false,
    registry,
    setBehavior(behavior: AppliedTabBehavior, nextHotkeys?: EffectiveHotkeyMap) {
      if (!engine.active) {
        return;
      }
      registry.setBehavior(behavior, nextHotkeys);
      if (nextHotkeys) {
        hotkeys?.setHotkeys(nextHotkeys);
      }
    },
    destroy() {
      if (!engine.active) {
        return;
      }
      engine.active = false;
      hotkeys?.destroy();
      registry.destroy();
      if (globalThis.__OSVSC_ENGINE__ === engine) {
        delete globalThis.__OSVSC_ENGINE__;
      }
    },
  };
  registry.start();
  return engine;
}

export function startEngine(actions?: OverlayActions): VideoSpeedEngine {
  if (globalThis.__OSVSC_ENGINE__?.active) {
    return globalThis.__OSVSC_ENGINE__;
  }
  const engine = createEngine(actions);
  globalThis.__OSVSC_ENGINE__ = engine;
  return engine;
}

export function destroyEngine(): boolean {
  const engine = globalThis.__OSVSC_ENGINE__;
  if (!engine) {
    return false;
  }
  engine.destroy();
  return true;
}

export function getActiveEngine(): VideoSpeedEngine | undefined {
  return globalThis.__OSVSC_ENGINE__?.active ? globalThis.__OSVSC_ENGINE__ : undefined;
}
