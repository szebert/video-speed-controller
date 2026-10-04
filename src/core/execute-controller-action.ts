// SPDX-License-Identifier: GPL-3.0-only

import { t } from '../i18n/t';
import { contentFailureMessage, sendContentRequest } from '../protocol/content/client';
import type { HotkeyBinding } from '../settings/hotkey-binding';
import {
  isJumpPercentAction,
  isMediaLocalAction,
  isMediaLoopAction,
  isTabSpeedAction,
  JUMP_PERCENT_BY_ACTION,
  type ControllerAction,
  type ControllerActionPhase,
  type MediaLocalAction,
} from './controller-action';
import {
  adjustMediaVolume,
  effectiveSkipSeconds,
  formatSkipSeconds,
  jumpToEnd,
  jumpToStart,
  seekBy,
  seekToPercent,
  toggleMediaMute,
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

const VOLUME_STEP_PERCENT = 10;

function formatVolumePercent(level: number): string {
  const percent = Math.round(level * 100);
  return `${Number.isFinite(percent) ? percent : 0}%`;
}

function formatVolumeDelta(deltaPercent: number): string {
  const sign = deltaPercent < 0 ? '−' : '+';
  return `(${sign}${Math.abs(deltaPercent)}%)`;
}

/** Localized text for the media-local flash. */
type MediaLocalFeedback = { label: string; detail?: string; hold?: true };

export async function executeControllerAction(
  action: ControllerAction,
  context: ControllerActionContext,
): Promise<void> {
  if (isMediaLocalAction(action)) {
    executeMediaLocalAction(action, context);
    return;
  }
  try {
    if (action === 'openSettings') {
      const response = await sendContentRequest({ type: 'OPEN_OPTIONS_PAGE' });
      const failure = response ? contentFailureMessage(response) : 'Invalid response';
      if (failure) {
        console.warn('OPEN_OPTIONS_PAGE failed', failure);
      }
      return;
    }
    if (!isTabSpeedAction(action)) {
      return;
    }
    const response = await sendContentRequest({ type: 'DISPATCH_TAB_ACTION', action });
    if (!response) {
      console.warn('DISPATCH_TAB_ACTION failed', 'Invalid response');
      return;
    }
    const failure = contentFailureMessage(response);
    if (failure) {
      console.warn('DISPATCH_TAB_ACTION failed', failure);
    }
    if (!response.ok) {
      return;
    }
    // Resolve after DISPATCH. setSpeed re-injects the content script, which
    // invalidates the engine that started this call.
    const registry = context.resolveRegistry();
    const payload = {
      kind: 'speed' as const,
      previousTargetSpeed: response.previousTargetSpeed,
      targetSpeed: response.targetSpeed,
      action,
    };
    if (context.source.kind === 'hotkey') {
      registry.flashHotkeyAction({ ...payload, binding: context.source.binding });
      return;
    }
    registry.flashButtonAction(payload);
  } catch (error) {
    console.warn(
      `${action === 'openSettings' ? 'OPEN_OPTIONS_PAGE' : 'DISPATCH_TAB_ACTION'} failed`,
      error,
    );
    throw error;
  }
}

// Media-local: stays inside this frame and touches exactly one video. These
// actions must never reach DISPATCH_TAB_ACTION, which is the tab-wide speed RPC.
function executeMediaLocalAction(action: MediaLocalAction, context: ControllerActionContext): void {
  const video = context.source.video;
  if (!video) {
    return;
  }
  const phase = context.phase ?? 'press';
  // `end` must still close a tokenized hold after the element is removed.
  if (!video.isConnected && phase !== 'end') {
    return;
  }
  const registry = context.resolveRegistry();
  const feedback = runMediaLocalAction(action, phase, video, registry, context.hold);
  if (!feedback) {
    return;
  }
  const payload = {
    kind: 'media' as const,
    label: feedback.label,
    ...(feedback.detail !== undefined ? { detail: feedback.detail } : {}),
    action,
  };
  const options = feedback.hold ? { hold: true } : undefined;
  if (context.source.kind === 'hotkey') {
    registry.flashHotkeyActionOn(video, { ...payload, binding: context.source.binding }, options);
    return;
  }
  registry.flashButtonActionOn(video, payload, options);
}

function runMediaLocalAction(
  action: MediaLocalAction,
  phase: ControllerActionPhase,
  video: HTMLVideoElement,
  registry: MediaRegistry,
  hold: TransportHoldOwner | undefined,
): MediaLocalFeedback | null {
  if (action === 'rewind') {
    return runRewind(phase, video, registry, hold);
  }
  if (action === 'fastForward') {
    return runFastForward(phase, video, registry, hold);
  }
  if (phase !== 'press') {
    return null;
  }
  if (isMediaLoopAction(action)) {
    return registry.runLoopAction(video, action);
  }
  if (isJumpPercentAction(action)) {
    const percent = JUMP_PERCENT_BY_ACTION[action];
    return seekToPercent(video, percent)
      ? { label: t('navJumpToPercent', [String(percent)]) }
      : null;
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
    case 'toggleMute':
      if (!toggleMediaMute(video)) {
        return null;
      }
      return video.muted
        ? { label: t('volumeMute') }
        : { label: t('volumeUnmute'), detail: formatVolumePercent(video.volume) };
    case 'decreaseVolume':
    case 'increaseVolume': {
      const before = Math.round(video.volume * 100);
      const percent = adjustMediaVolume(
        video,
        action === 'increaseVolume' ? VOLUME_STEP_PERCENT : -VOLUME_STEP_PERCENT,
      );
      if (percent === null || !Number.isFinite(before)) {
        return null;
      }
      return {
        label: `${t('volumeLevel')} ${percent}%`,
        detail: formatVolumeDelta(percent - before),
      };
    }
  }
}

function runSkip(
  action: 'skipBack' | 'skipForward',
  video: HTMLVideoElement,
  registry: MediaRegistry,
): MediaLocalFeedback | null {
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
): MediaLocalFeedback | null {
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
  // Stay visible for the whole press. endTransportHold starts the hide delay.
  return {
    label: t('navFastForward'),
    detail: formatSpeed(behavior.fastForwardSpeed),
    hold: true,
  };
}

function runRewind(
  phase: ControllerActionPhase,
  video: HTMLVideoElement,
  registry: MediaRegistry,
  hold: TransportHoldOwner | undefined,
): MediaLocalFeedback | null {
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
  const magnitude = Math.abs(behavior?.rewindSpeed ?? Number.NaN);
  if (!behavior || !registry.beginRewindHold(video, hold, magnitude)) {
    return null;
  }
  return {
    label: t('navRewind'),
    detail: formatSpeed(magnitude),
    hold: true,
  };
}
