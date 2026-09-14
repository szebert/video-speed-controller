// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayActions } from '../overlay/types';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import type { AppliedTabBehavior } from './applied-tab-behavior';
import type { TransportHoldOwner } from './controller-action';
import { MediaController, type TransportSession } from './media-controller';
import { isExtensionHost, VideoOverlay, type HotkeyFlashPayload } from './video-overlay';

export type { TransportHoldOwner };

type RegistryEntry = {
  controller: MediaController;
  overlay: VideoOverlay;
  hold?: { owner: TransportHoldOwner; session: TransportSession };
};

function isVideoElement(node: Node): node is HTMLVideoElement {
  return node.nodeType === 1 && (node as Element).localName === 'video';
}

function pointHitsRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function collectVideos(root: Node): HTMLVideoElement[] {
  const videos: HTMLVideoElement[] = [];
  if (isVideoElement(root)) {
    videos.push(root);
  }
  if (root instanceof Element || root instanceof Document || root instanceof ShadowRoot) {
    videos.push(...root.querySelectorAll('video'));
  }
  return videos;
}

/**
 * Deepest focused element across open shadow boundaries. This repo discovers
 * videos inside open shadow roots, where `document.activeElement` only reports
 * the outermost host.
 */
export function composedActiveElement(document: Document): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

export function collectOpenShadowRoots(root: Node): ShadowRoot[] {
  const shadows: ShadowRoot[] = [];
  const visitElement = (element: Element): void => {
    if (isExtensionHost(element)) {
      return;
    }
    if (element.shadowRoot) {
      shadows.push(element.shadowRoot);
    }
  };
  if (root instanceof Element) {
    visitElement(root);
    root.querySelectorAll('*').forEach(visitElement);
  } else if (root instanceof Document && root.documentElement) {
    visitElement(root.documentElement);
    root.documentElement.querySelectorAll('*').forEach(visitElement);
  } else if (root instanceof ShadowRoot) {
    root.querySelectorAll('*').forEach(visitElement);
  }
  return shadows;
}

export class MediaRegistry {
  private readonly entries = new Map<HTMLVideoElement, RegistryEntry>();
  private readonly rootObservers = new Map<Document | ShadowRoot, MutationObserver>();
  private readonly resizeObserver: ResizeObserver;
  private currentBehavior: AppliedTabBehavior | null = null;
  private currentHotkeys: EffectiveHotkeyMap | null = null;
  private destroyed = false;
  private layoutRaf: number | null = null;
  private latestPointer: { x: number; y: number } | null = null;
  private readonly view: Window | null;

  constructor(
    private readonly document: Document,
    private readonly actions?: OverlayActions,
  ) {
    this.view = document.defaultView;
    this.resizeObserver = new ResizeObserver((entries) => {
      this.onVideoResize(entries);
    });
  }

  start(): void {
    this.attachLayoutListeners();
    this.observeRoot(this.document);
    this.discover(this.document);
  }

  setBehavior(behavior: AppliedTabBehavior, hotkeys?: EffectiveHotkeyMap): void {
    this.currentBehavior = behavior;
    if (hotkeys) {
      this.currentHotkeys = hotkeys;
    }
    for (const entry of this.entries.values()) {
      entry.overlay.setBehavior(behavior, hotkeys ?? this.currentHotkeys ?? undefined);
      if (entry.controller.targetSpeed !== behavior.targetSpeed) {
        entry.controller.setTarget(behavior.targetSpeed);
      }
    }
    this.requestLayout();
  }

  ensureController(video: HTMLVideoElement): MediaController {
    return this.ensureEntry(video).controller;
  }

  getController(video: HTMLVideoElement): MediaController | undefined {
    return this.entries.get(video)?.controller;
  }

  getOverlay(video: HTMLVideoElement): VideoOverlay | undefined {
    return this.entries.get(video)?.overlay;
  }

  get size(): number {
    return this.entries.size;
  }

  get observerCount(): number {
    return this.rootObservers.size;
  }

  get behavior(): AppliedTabBehavior | null {
    return this.currentBehavior;
  }

  /** Tab-wide feedback: speed actions apply to every video in the frame. */
  flashHotkeyAction(payload: HotkeyFlashPayload): void {
    if (this.destroyed || !this.currentBehavior?.hotkeyFlash) {
      return;
    }
    for (const entry of this.entries.values()) {
      entry.overlay.showHotkeyFlash(payload);
    }
  }

  /** Media-local feedback: navigation actions only touch their own video. */
  flashHotkeyActionOn(video: HTMLVideoElement, payload: HotkeyFlashPayload): void {
    if (this.destroyed || !this.currentBehavior?.hotkeyFlash) {
      return;
    }
    this.entries.get(video)?.overlay.showHotkeyFlash(payload);
  }

  /**
   * Starts a temporary transport rate for `owner`, replacing any hold on this
   * video. The replaced owner's `endTransportHold` becomes a no-op.
   */
  beginTransportHold(
    video: HTMLVideoElement,
    owner: TransportHoldOwner,
    rate: number,
    options: { resumePlayback?: boolean } = { resumePlayback: true },
  ): boolean {
    if (this.destroyed || !video.isConnected) {
      return false;
    }
    const entry = this.ensureEntry(video);
    const session = entry.controller.beginTemporaryRate(rate, options);
    if (!session) {
      return false;
    }
    entry.hold = { owner, session };
    return true;
  }

  /** Ends the hold only when `owner` still owns the active session. */
  endTransportHold(video: HTMLVideoElement, owner: TransportHoldOwner): void {
    const entry = this.entries.get(video);
    if (entry?.hold?.owner !== owner) {
      return;
    }
    const { session } = entry.hold;
    entry.hold = undefined;
    entry.controller.endTemporaryRate(session);
  }

  /**
   * Picks the single video a media-local hotkey acts on in this frame. Frame
   * local by design: the content script runs in every frame.
   */
  resolveHotkeyTarget(): HTMLVideoElement | null {
    if (this.destroyed || this.entries.size === 0) {
      return null;
    }
    const pictureInPicture = this.document.pictureInPictureElement;
    if (pictureInPicture instanceof HTMLVideoElement && this.entries.has(pictureInPicture)) {
      return pictureInPicture;
    }
    const focused = composedActiveElement(this.document);
    if (focused instanceof HTMLVideoElement && this.entries.has(focused)) {
      return focused;
    }
    const playing = this.largestVideo((video) => !video.paused && !video.ended);
    if (playing) {
      return playing;
    }
    const visible = this.largestVideo(() => true);
    if (visible) {
      return visible;
    }
    if (this.entries.size === 1) {
      const [only] = this.entries.keys();
      return only ?? null;
    }
    return null;
  }

  private largestVideo(accept: (video: HTMLVideoElement) => boolean): HTMLVideoElement | null {
    const viewport = this.view;
    if (!viewport) {
      return null;
    }
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;
    for (const video of this.entries.keys()) {
      if (!video.isConnected || !accept(video) || isStyleHidden(viewport, video)) {
        continue;
      }
      const area = visibleViewportArea(video.getBoundingClientRect(), viewport);
      if (area <= 0) {
        continue;
      }
      if (area > bestArea) {
        best = video;
        bestArea = area;
      }
    }
    return best;
  }

  destroy(): void {
    this.destroyed = true;
    this.latestPointer = null;
    this.cancelLayout();
    this.resizeObserver.disconnect();
    this.detachLayoutListeners();
    for (const entry of this.entries.values()) {
      entry.overlay.destroy();
      entry.controller.destroy();
    }
    this.entries.clear();
    for (const observer of this.rootObservers.values()) {
      observer.disconnect();
    }
    this.rootObservers.clear();
  }

  private ensureEntry(video: HTMLVideoElement): RegistryEntry {
    const existing = this.entries.get(video);
    if (existing) {
      return existing;
    }
    const overlay = new VideoOverlay(video, this.requestLayout, this.actions);
    const controller = new MediaController(video, (owned) => {
      overlay.setControlled(owned);
    });
    const entry = { controller, overlay };
    this.entries.set(video, entry);
    this.resizeObserver.observe(video);
    if (this.currentBehavior) {
      overlay.setBehavior(this.currentBehavior, this.currentHotkeys ?? undefined);
      controller.setTarget(this.currentBehavior.targetSpeed);
    }
    this.requestLayout();
    return entry;
  }

  private discover(root: Node): void {
    for (const video of collectVideos(root)) {
      this.ensureEntry(video);
    }
    for (const shadow of collectOpenShadowRoots(root)) {
      this.observeRoot(shadow);
      this.discover(shadow);
    }
  }

  private observeRoot(root: Document | ShadowRoot): void {
    if (this.destroyed || this.rootObservers.has(root)) {
      return;
    }
    const observer = new MutationObserver((records) => {
      this.handleMutations(records);
    });
    observer.observe(root, { childList: true, subtree: true });
    this.rootObservers.set(root, observer);
  }

  private handleMutations(records: MutationRecord[]): void {
    const added: Node[] = [];
    const removedVideos: HTMLVideoElement[] = [];
    const touchedShadows = new Set<ShadowRoot>();

    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (isExtensionHost(node)) {
          return;
        }
        added.push(node);
      });
      record.removedNodes.forEach((node) => {
        if (isExtensionHost(node)) {
          return;
        }
        for (const video of collectVideos(node)) {
          removedVideos.push(video);
        }
        const shadows = collectOpenShadowRoots(node);
        if (node instanceof Element && node.shadowRoot) {
          shadows.push(node.shadowRoot);
        }
        for (const shadow of shadows) {
          touchedShadows.add(shadow);
          removedVideos.push(...collectVideos(shadow));
        }
      });
    }

    for (const node of added) {
      this.discover(node);
    }

    for (const video of removedVideos) {
      if (!video.isConnected) {
        this.destroyEntry(video);
      }
    }

    for (const [root, observer] of this.rootObservers) {
      if (root instanceof ShadowRoot && !root.host.isConnected) {
        observer.disconnect();
        this.rootObservers.delete(root);
        touchedShadows.delete(root);
      }
    }
    void touchedShadows;
  }

  private destroyEntry(video: HTMLVideoElement): void {
    const entry = this.entries.get(video);
    if (!entry) {
      return;
    }
    this.resizeObserver.unobserve(video);
    this.entries.delete(video);
    entry.hold = undefined;
    entry.overlay.destroy();
    // destroy() ends any active transport session, so a disconnected video
    // never stays stuck at a temporary rate.
    entry.controller.destroy();
  }

  private onVideoResize(entries: ResizeObserverEntry[]): void {
    if (this.destroyed) {
      return;
    }
    for (const entry of entries) {
      if (entry.target instanceof HTMLVideoElement && this.entries.has(entry.target)) {
        this.requestLayout();
        return;
      }
    }
  }

  private readonly requestLayout = (): void => {
    if (this.destroyed || this.layoutRaf != null || !this.view) {
      return;
    }
    this.layoutRaf = this.view.requestAnimationFrame(() => {
      this.flushLayout();
    });
  };

  private flushLayout(): void {
    this.layoutRaf = null;
    if (this.destroyed) {
      return;
    }
    const measuredThisFlush = new Map<HTMLVideoElement, DOMRect>();
    const measure = (video: HTMLVideoElement): DOMRect => {
      const cached = measuredThisFlush.get(video);
      if (cached) {
        return cached;
      }
      const rect = video.getBoundingClientRect();
      measuredThisFlush.set(video, rect);
      return rect;
    };

    const pointer = this.latestPointer;
    this.latestPointer = null;
    if (pointer) {
      for (const [video, entry] of this.entries) {
        if (!entry.overlay.isPointerEligible()) {
          continue;
        }
        if (pointHitsRect(pointer.x, pointer.y, measure(video))) {
          entry.overlay.notifyActivity();
        }
      }
    }

    for (const [video, entry] of this.entries) {
      entry.overlay.layout(() => measure(video));
    }
  }

  private readonly onLayoutSignal = (): void => {
    this.requestLayout();
  };

  private readonly onWindowPointer = (event: Event): void => {
    if (this.destroyed || !(event instanceof PointerEvent)) {
      return;
    }
    this.latestPointer = { x: event.clientX, y: event.clientY };
    this.requestLayout();
  };

  private attachLayoutListeners(): void {
    if (!this.view) {
      return;
    }
    const capture = { capture: true };
    this.view.addEventListener('scroll', this.onLayoutSignal, capture);
    this.document.addEventListener('scroll', this.onLayoutSignal, capture);
    this.view.addEventListener('resize', this.onLayoutSignal);
    this.document.addEventListener('fullscreenchange', this.onLayoutSignal);
    this.view.addEventListener('pointermove', this.onWindowPointer, capture);
    this.view.addEventListener('pointerdown', this.onWindowPointer, capture);
  }

  private detachLayoutListeners(): void {
    if (!this.view) {
      return;
    }
    const capture = { capture: true };
    this.view.removeEventListener('scroll', this.onLayoutSignal, capture);
    this.document.removeEventListener('scroll', this.onLayoutSignal, capture);
    this.view.removeEventListener('resize', this.onLayoutSignal);
    this.document.removeEventListener('fullscreenchange', this.onLayoutSignal);
    this.view.removeEventListener('pointermove', this.onWindowPointer, capture);
    this.view.removeEventListener('pointerdown', this.onWindowPointer, capture);
  }

  private cancelLayout(): void {
    if (this.layoutRaf != null && this.view) {
      this.view.cancelAnimationFrame(this.layoutRaf);
    }
    this.layoutRaf = null;
  }
}

function isStyleHidden(view: Window, video: HTMLVideoElement): boolean {
  const style = view.getComputedStyle(video);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** Intersect the layout box with the viewport. Offscreen area does not count. */
function visibleViewportArea(
  rect: DOMRect,
  viewport: { innerWidth: number; innerHeight: number },
): number {
  const visibleWidth = Math.min(rect.right, viewport.innerWidth) - Math.max(rect.left, 0);
  const visibleHeight = Math.min(rect.bottom, viewport.innerHeight) - Math.max(rect.top, 0);
  return Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
}
