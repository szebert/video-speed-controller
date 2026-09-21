// SPDX-License-Identifier: GPL-3.0-only

import type { AppliedTabBehavior } from '../core/applied-tab-behavior';
import type {
  ControllerActionPhase,
  MediaNavigationAction,
  TransportHoldOwner,
} from '../core/controller-action';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import type { OverlayPosition } from '../settings/site-behavior';

export type OverlayBufferedRange = { start: number; end: number };

export type OverlayTimelineState = {
  currentTime: number;
  duration: number | null;
  buffered: readonly OverlayBufferedRange[];
};

export type OverlaySeekPhase = 'input' | 'commit';

export type OverlayActions = {
  adjustSpeed(direction: -1 | 1, video: HTMLVideoElement): void;
  resetSpeed?(video: HTMLVideoElement): void;
  /** One callback for every navigation button, rather than seven methods. */
  mediaAction?(
    action: MediaNavigationAction,
    phase: ControllerActionPhase,
    video: HTMLVideoElement,
    hold: TransportHoldOwner,
  ): void;
  setOverlayPosition?(position: OverlayPosition): void;
  openSettings?(): void;
  seek?(seconds: number, video: HTMLVideoElement): boolean;
};

export type OverlayViewCallbacks = {
  onAdjust(direction: -1 | 1): void;
  onReset(): void;
  onMediaAction(
    action: MediaNavigationAction,
    phase: ControllerActionPhase,
    hold?: TransportHoldOwner,
  ): void;
  onSetPosition(position: OverlayPosition): void;
  onOpenSettings(): void;
  onInteractiveChange(active: boolean): void;
  onSeek(seconds: number, phase: OverlaySeekPhase): void;
  onSeekCancel(): void;
};

export type OverlayViewState = {
  behavior: AppliedTabBehavior;
  visible: boolean;
  paused: boolean;
  hotkeys?: EffectiveHotkeyMap | null;
};
