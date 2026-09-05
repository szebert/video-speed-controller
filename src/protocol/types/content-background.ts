// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayPosition } from '../../settings/site-behavior';

export type AdjustSpeedRequest = {
  type: 'ADJUST_SPEED';
  direction: -1 | 1;
};

export type SetOverlayPositionRequest = {
  type: 'SET_OVERLAY_POSITION';
  position: OverlayPosition;
};

export type OpenOptionsPageRequest = {
  type: 'OPEN_OPTIONS_PAGE';
};

export type FrameReadyRequest = {
  type: 'FRAME_READY';
};

export type TopFrameDestroyedRequest = {
  type: 'TOP_FRAME_DESTROYED';
};

export type ContentToBackgroundRequest =
  | AdjustSpeedRequest
  | SetOverlayPositionRequest
  | OpenOptionsPageRequest
  | FrameReadyRequest
  | TopFrameDestroyedRequest;
