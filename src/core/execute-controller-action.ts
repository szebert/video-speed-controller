// SPDX-License-Identifier: GPL-3.0-only

import { t } from '../i18n/t';
import { contentFailureMessage, sendContentRequest } from '../protocol/content/client';
import type { HotkeyBinding } from '../settings/hotkey-binding';
import {
  isMediaNavigationAction,
  isTabSpeedAction,
  type ControllerAction,
  type ControllerActionPhase,
  type MediaNavigationAction,
} from './controller-action';
import {
  effectiveSkipSeconds,
  formatSkipSeconds,
  jumpToEnd,
  jumpToStart,
  seekBy,
  togglePlayback,
} from './media-navigation';
import type { MediaRegistry, TransportHoldOwner } from './media-registry';
import { formatSpeed } from './speed';

export type ControllerActionSource =
  | {
      kind: 'hotkey';
      binding: HotkeyBinding;
      /** Target resolved on the initial keydown. Never reselected per tick. */
      video?: HTMLVideoElement | null;
    }
  | { kind: 'overlay'; video: HTMLVideoElement };

export type ControllerActionContext = {
  resolveRegistry: () => MediaRegistry;
  source: ControllerActionSource;
  phase?: ControllerActionPhase;
  /** Identity of one press-and-hold, so only its own `end` can close it. */
  hold?: TransportHoldOwner;
};

/** Localized text for the navigation hotkey flash. */
type NavigationFeedback = { label: string; detail?: string };

export async function executeControllerAction(
  action: ControllerAction,
  context: ControllerActionContext,
): Promise<void> {
  if (isMediaNavigationAction(action)) {
    executeMediaNavigation(action, context);
    return;
  }
  if (!isTabSpeedAction(action)) {
    return;
  }
  try {
    const response = await sendContentRequest({ type: 'DISPATCH_TAB_ACTION', action });
    if (!response) {
      console.warn('DISPATCH_TAB_ACTION failed', 'Invalid response');
      return;
    }
    const failure = contentFailureMessage(response);
    if (failure) {
      console.warn('DISPATCH_TAB_ACTION failed', failure);
    }
    if (!response.ok || context.source.kind !== 'hotkey') {
      return;
    }
    // Resolve after DISPATCH. setSpeed re-injects the content script, which
    // invalidates the engine that started this call.
    context.resolveRegistry().flashHotkeyAction({
      kind: 'speed',
      previousTargetSpeed: response.previousTargetSpeed,
      targetSpeed: response.targetSpeed,
      binding: context.source.binding,
    });
  } catch (error) {
    console.warn('DISPATCH_TAB_ACTION failed', error);
    throw error;
  }
}

// Media-local: stays inside this frame and touches exactly one video. These
// actions must never reach DISPATCH_TAB_ACTION, which is the tab-wide speed RPC.
function executeMediaNavigation(
  action: MediaNavigationAction,
  context: ControllerActionContext,
): void {
  const video = context.source.video;
  if (!video) {
    return;
  }
  const registry = context.resolveRegistry();
  const phase = context.phase ?? 'press';
  const feedback = runMediaNavigation(action, phase, video, registry, context.hold);
  if (!feedback || context.source.kind !== 'hotkey') {
    return;
  }
  registry.flashHotkeyActionOn(video, {
    kind: 'navigation',
    label: feedback.label,
    ...(feedback.detail !== undefined ? { detail: feedback.detail } : {}),
    binding: context.source.binding,
  });
}

function runMediaNavigation(
  action: MediaNavigationAction,
  phase: ControllerActionPhase,
  video: HTMLVideoElement,
  registry: MediaRegistry,
  hold: TransportHoldOwner | undefined,
): NavigationFeedback | null {
  if (action === 'rewind') {
    // Scaffolding only: the binding, overlay button, and hold lifecycle exist,
    // but nothing may assign a negative playbackRate in this release.
    return null;
  }
  if (action === 'fastForward') {
    return runFastForward(phase, video, registry, hold);
  }
  if (phase !== 'press') {
    return null;
  }
  switch (action) {
    case 'jumpToStart':
      return jumpToStart(video) ? { label: t('navJumpToStart') } : null;
    case 'jumpToEnd':
      return jumpToEnd(video) ? { label: t('navJumpToEnd') } : null;
    case 'playPause': {
      const toggled = togglePlayback(video);
      if (!toggled) {
        return null;
      }
      return { label: t(toggled === 'play' ? 'navPlay' : 'navPause') };
    }
    case 'skipBack':
    case 'skipForward':
      return runSkip(action, video, registry);
  }
}

function runSkip(
  action: 'skipBack' | 'skipForward',
  video: HTMLVideoElement,
  registry: MediaRegistry,
): NavigationFeedback | null {
  const behavior = registry.behavior;
  if (!behavior) {
    return null;
  }
  const forward = action === 'skipForward';
  const seconds = effectiveSkipSeconds(
    forward ? behavior.skipForwardSeconds : behavior.skipBackSeconds,
    video.playbackRate,
    behavior.skipScaleWithPlaybackRate,
  );
  const result = seekBy(video, forward ? seconds : -seconds);
  if (!result) {
    return null;
  }
  return {
    label: t(forward ? 'navSkipForward' : 'navSkipBack'),
    detail: formatSkipSeconds(result.appliedSeconds),
  };
}

function runFastForward(
  phase: ControllerActionPhase,
  video: HTMLVideoElement,
  registry: MediaRegistry,
  hold: TransportHoldOwner | undefined,
): NavigationFeedback | null {
  if (!hold) {
    return null;
  }
  if (phase === 'end') {
    registry.endTransportHold(video, hold);
    return null;
  }
  if (phase !== 'start') {
    return null;
  }
  const behavior = registry.behavior;
  if (!behavior || !registry.beginTransportHold(video, hold, behavior.fastForwardSpeed)) {
    return null;
  }
  return { label: t('navFastForward'), detail: formatSpeed(behavior.fastForwardSpeed) };
}
