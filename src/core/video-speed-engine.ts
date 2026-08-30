// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from './applied-tab-behavior';
import { MediaRegistry } from './media-registry';

export type VideoSpeedEngine = {
  active: boolean;
  listening: boolean;
  setBehavior: (behavior: AppliedTabBehavior) => void;
  destroy: () => void;
  registry: MediaRegistry;
};

declare global {
  var __OSVSC_ENGINE__: VideoSpeedEngine | undefined;
}

function createEngine(): VideoSpeedEngine {
  const registry = new MediaRegistry(document);
  const engine: VideoSpeedEngine = {
    active: true,
    listening: false,
    registry,
    setBehavior(behavior: AppliedTabBehavior) {
      if (!engine.active) {
        return;
      }
      registry.setBehavior(behavior);
    },
    destroy() {
      if (!engine.active) {
        return;
      }
      engine.active = false;
      registry.destroy();
      if (globalThis.__OSVSC_ENGINE__ === engine) {
        delete globalThis.__OSVSC_ENGINE__;
      }
    },
  };
  registry.start();
  return engine;
}

export function startEngine(): VideoSpeedEngine {
  if (globalThis.__OSVSC_ENGINE__?.active) {
    return globalThis.__OSVSC_ENGINE__;
  }
  const engine = createEngine();
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
