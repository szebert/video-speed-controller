// SPDX-License-Identifier: GPL-3.0-only

/** Find the fullscreen element without losing a video inside shadow DOM to retargeting. */
function fullscreenElement(video: HTMLVideoElement): Element | null {
  const root = video.getRootNode();
  return (
    ('fullscreenElement' in root ? (root as Document | ShadowRoot).fullscreenElement : null) ??
    video.ownerDocument.fullscreenElement ??
    null
  );
}

/** The fullscreen element that contains `video`, including a player wrapper. */
export function containingFullscreenElement(video: HTMLVideoElement): Element | null {
  const fullscreen = fullscreenElement(video);
  if (!fullscreen) {
    return null;
  }
  // Include fullscreen player wrappers and cross shadow boundaries.
  let node: Node | null = video;
  while (node) {
    if (node === fullscreen) {
      return fullscreen;
    }
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }
  return null;
}

export function isVideoFullscreen(video: HTMLVideoElement): boolean {
  return containingFullscreenElement(video) != null;
}

export function isNativeVideoFullscreen(video: HTMLVideoElement): boolean {
  return fullscreenElement(video) === video;
}

/** Capability and Permissions Policy checks cannot predict every runtime rejection. */
export function canToggleVideoFullscreen(video: HTMLVideoElement): boolean {
  if (!video.isConnected) {
    return false;
  }
  const document = video.ownerDocument;
  return isVideoFullscreen(video)
    ? typeof document.exitFullscreen === 'function'
    : document.fullscreenEnabled === true && typeof video.requestFullscreen === 'function';
}

export type FullscreenResult = 'entered' | 'exited' | 'unavailable' | 'failed';

const pending = new WeakSet<HTMLVideoElement>();

/** Call directly from the click/keydown stack so the browser retains user activation. */
export async function toggleVideoFullscreen(
  video: HTMLVideoElement,
): Promise<FullscreenResult | null> {
  if (pending.has(video)) {
    return null;
  }
  if (!canToggleVideoFullscreen(video)) {
    return 'unavailable';
  }
  pending.add(video);
  try {
    if (isVideoFullscreen(video)) {
      await video.ownerDocument.exitFullscreen();
      return 'exited';
    }
    await video.requestFullscreen();
    return 'entered';
  } catch {
    return 'failed';
  } finally {
    pending.delete(video);
  }
}
