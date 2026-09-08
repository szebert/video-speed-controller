// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayActions } from '../overlay/types';
import type { EffectiveHotkeyMap } from '../settings/hotkey-binding';
import type { AppliedTabBehavior } from './applied-tab-behavior';
import { MediaController } from './media-controller';
import { OVERLAY_HOST_TAG, VideoOverlay } from './video-overlay';

type RegistryEntry = {
  controller: MediaController;
  overlay: VideoOverlay;
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

export function collectOpenShadowRoots(root: Node): ShadowRoot[] {
  const shadows: ShadowRoot[] = [];
  const visitElement = (element: Element): void => {
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
        if (node instanceof Element && node.localName === OVERLAY_HOST_TAG) {
          return;
        }
        added.push(node);
      });
      record.removedNodes.forEach((node) => {
        if (node instanceof Element && node.localName === OVERLAY_HOST_TAG) {
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
    entry.overlay.destroy();
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
