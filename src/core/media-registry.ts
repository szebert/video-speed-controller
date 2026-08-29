// SPDX-License-Identifier: GPL-3.0-only

import { MediaController } from './media-controller';

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
  private readonly controllers = new Map<HTMLVideoElement, MediaController>();
  private readonly rootObservers = new Map<Document | ShadowRoot, MutationObserver>();
  private currentTarget: number | null = null;
  private destroyed = false;

  constructor(private readonly document: Document) {}

  start(): void {
    this.observeRoot(this.document);
    this.discover(this.document);
  }

  setTarget(speed: number): void {
    this.currentTarget = speed;
    for (const controller of this.controllers.values()) {
      controller.setTarget(speed);
    }
  }

  ensureController(video: HTMLVideoElement): MediaController {
    const existing = this.controllers.get(video);
    if (existing) {
      if (this.currentTarget != null) {
        existing.setTarget(this.currentTarget);
      }
      return existing;
    }
    const controller = new MediaController(video);
    this.controllers.set(video, controller);
    if (this.currentTarget != null) {
      controller.setTarget(this.currentTarget);
    }
    return controller;
  }

  getController(video: HTMLVideoElement): MediaController | undefined {
    return this.controllers.get(video);
  }

  get size(): number {
    return this.controllers.size;
  }

  get observerCount(): number {
    return this.rootObservers.size;
  }

  destroy(): void {
    this.destroyed = true;
    for (const controller of this.controllers.values()) {
      controller.destroy();
    }
    this.controllers.clear();
    for (const observer of this.rootObservers.values()) {
      observer.disconnect();
    }
    this.rootObservers.clear();
  }

  private discover(root: Node): void {
    for (const video of collectVideos(root)) {
      this.ensureController(video);
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
      record.addedNodes.forEach((node) => added.push(node));
      record.removedNodes.forEach((node) => {
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
        this.destroyController(video);
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

  private destroyController(video: HTMLVideoElement): void {
    const controller = this.controllers.get(video);
    if (!controller) {
      return;
    }
    controller.destroy();
    this.controllers.delete(video);
  }
}
