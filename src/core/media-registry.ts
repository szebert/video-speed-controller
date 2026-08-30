// SPDX-License-Identifier: GPL-3.0-only

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
  private currentBehavior: AppliedTabBehavior | null = null;
  private destroyed = false;
  private layoutRaf: number | null = null;
  private readonly view: Window | null;

  constructor(private readonly document: Document) {
    this.view = document.defaultView;
  }

  start(): void {
    this.attachLayoutListeners();
    this.observeRoot(this.document);
    this.discover(this.document);
  }

  setBehavior(behavior: AppliedTabBehavior): void {
    this.currentBehavior = behavior;
    for (const entry of this.entries.values()) {
      entry.overlay.setBehavior(behavior);
      entry.controller.setTarget(behavior.targetSpeed);
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
    this.cancelLayout();
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
      if (this.currentBehavior) {
        existing.overlay.setBehavior(this.currentBehavior);
        existing.controller.setTarget(this.currentBehavior.targetSpeed);
      }
      return existing;
    }
    const overlay = new VideoOverlay(video, this.requestLayout);
    const controller = new MediaController(video, (owned) => {
      overlay.setControlled(owned);
    });
    const entry = { controller, overlay };
    this.entries.set(video, entry);
    if (this.currentBehavior) {
      overlay.setBehavior(this.currentBehavior);
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
    entry.overlay.destroy();
    entry.controller.destroy();
    this.entries.delete(video);
  }

  private readonly requestLayout = (): void => {
    if (this.destroyed || this.layoutRaf != null || !this.view) {
      return;
    }
    this.layoutRaf = this.view.requestAnimationFrame(() => {
      this.layoutRaf = null;
      if (this.destroyed) {
        return;
      }
      for (const entry of this.entries.values()) {
        entry.overlay.layout();
      }
    });
  };

  private readonly onLayoutSignal = (): void => {
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
  }

  private cancelLayout(): void {
    if (this.layoutRaf != null && this.view) {
      this.view.cancelAnimationFrame(this.layoutRaf);
    }
    this.layoutRaf = null;
  }
}
