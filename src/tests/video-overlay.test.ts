// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_HOTKEYS, builtInEffectiveHotkeys } from '../settings/hotkey-binding';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import {
  HOTKEY_FLASH_HOST_TAG,
  OVERLAY_HOST_TAG,
  OVERLAY_INSET_PX,
  OVERLAY_Z_INDEX,
  VideoOverlay,
} from '../core/video-overlay';
import { OverlayView } from '../overlay/overlay-view';
import overlayCss from '../overlay/overlay.css?inline';
import { tabBehavior } from './tab-behavior-fixture';

function sizedVideo(rect = { left: 10, top: 20, width: 200, height: 100 }): HTMLVideoElement {
  const video = document.createElement('video');
  document.body.append(video);
  video.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  return video;
}

describe('VideoOverlay', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.querySelectorAll(OVERLAY_HOST_TAG).forEach((node) => node.remove());
    document.documentElement
      .querySelectorAll(HOTKEY_FLASH_HOST_TAG)
      .forEach((node) => node.remove());
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    document.head.querySelectorAll('style').forEach((node) => node.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders 1.25× after it is controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.speedReadout?.textContent).toBe('1.25×');
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('keeps setBehavior hidden while not controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(3, { overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.speedReadout?.textContent).toBe('3.00×');
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('reads the video rect once when layout shows the overlay', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    const getRect = vi.spyOn(video, 'getBoundingClientRect');
    overlay.layout();
    expect(getRect).toHaveBeenCalledTimes(1);
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('does not read the video rect when a cheap hide condition already applies', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    const getRect = vi.spyOn(video, 'getBoundingClientRect');
    overlay.layout();
    expect(getRect).not.toHaveBeenCalled();
    expect(overlay.host.style.visibility).toBe('hidden');

    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayVisible: false, overlayAutoHide: false }));
    getRect.mockClear();
    overlay.layout();
    expect(getRect).not.toHaveBeenCalled();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('does not read geometry from setBehavior or syncView before layout', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setControlled(true);
    const getRect = vi.spyOn(video, 'getBoundingClientRect');
    const update = vi.spyOn(OverlayView.prototype, 'update');
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    expect(getRect).not.toHaveBeenCalled();
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('does not treat a cheap-pass as visible before a successful layout', () => {
    const video = sizedVideo({ left: 0, top: 0, width: 0, height: 0 });
    const update = vi.spyOn(OverlayView.prototype, 'update');
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
  });

  it('places badges with grid anchors and transforms', () => {
    const video = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.TOP_LEFT }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe(`${10 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(0, 0)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.TOP_CENTER }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe('110px');
    expect(overlay.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.CENTER }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe('110px');
    expect(overlay.host.style.top).toBe('70px');
    expect(overlay.host.style.transform).toBe('translate(-50%, -50%)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe(`${210 - OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.top).toBe(`${120 - OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(-100%, -100%)');
  });

  it('updates the host transform after auto-hide has already expired', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');

    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT,
      }),
    );
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.style.transform).toBe('translate(-100%, -100%)');
    overlay.destroy();
  });

  it('applies overlay opacity to the controls shell', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayOpacity: 40 }));
    overlay.setControlled(true);
    overlay.layout();
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    expect((shell as HTMLElement).style.opacity).toBe('0.4');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayOpacity: 1 }));
    overlay.layout();
    expect((shell as HTMLElement).style.opacity).toBe('0.01');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayOpacity: 100 }));
    overlay.layout();
    expect((shell as HTMLElement).style.opacity).toBe('1');
  });

  it('applies overlay scale on the host and keeps the position translate', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayScale: 150 }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.getPropertyValue('--overlay-scale')).toBe('1.5');
    expect(overlay.host.style.getPropertyPriority('--overlay-scale')).toBe('important');
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayScale: 25 }));
    overlay.layout();
    expect(overlay.host.style.getPropertyValue('--overlay-scale')).toBe('0.25');
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayScale: 300 }));
    overlay.layout();
    expect(overlay.host.style.getPropertyValue('--overlay-scale')).toBe('3');
    expect(overlay.host.style.getPropertyPriority('--overlay-scale')).toBe('important');
    overlay.destroy();
  });

  it('maps overlay positions to shell row and column attributes', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    const shell = (): HTMLElement => {
      const element = overlay.host.shadowRoot?.querySelector('.controls-shell');
      expect(element).toBeInstanceOf(HTMLElement);
      return element as HTMLElement;
    };

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.TOP_LEFT }),
    );
    overlay.layout();
    expect(shell().dataset.row).toBe('0');
    expect(shell().dataset.column).toBe('0');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.CENTER }),
    );
    overlay.layout();
    expect(shell().dataset.row).toBe('1');
    expect(shell().dataset.column).toBe('1');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
    );
    overlay.layout();
    expect(shell().dataset.row).toBe('2');
    expect(shell().dataset.column).toBe('2');
    overlay.destroy();
  });

  it('does not intercept pointer input', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    expect(overlay.host.style.pointerEvents).toBe('none');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('loads overlay CSS as an inline string', () => {
    expect(overlayCss).toContain('all: initial');
    expect(overlayCss).toContain('--background');
    expect(overlayCss).toContain('--overlay-scale: 1');
    expect(overlayCss).toContain('transform: scale(var(--overlay-scale))');
    expect(overlayCss).toContain('--flash-scale: 1');
    expect(overlayCss).toContain('transform: scale(var(--flash-scale))');
    expect(overlayCss).toContain(".controls-shell[data-column='2']");
    expect(overlayCss).toContain('--origin-x: 100%');
    expect(overlayCss).toContain(".controls-shell[data-row='2']");
    expect(overlayCss).toContain('--origin-y: 100%');
    expect(overlayCss).not.toMatch(/\.control-speed\s*\{[^}]*border-inline:/);
  });

  it('does not inherit page typography into the badge', () => {
    document.documentElement.style.fontSize = '48px';
    document.body.style.color = 'rgb(255, 0, 0)';
    document.body.style.lineHeight = '4';
    document.body.style.fontFamily = 'serif';
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const speed = overlay.speedReadout;
    expect(speed).not.toBeNull();
    const speedStyle = getComputedStyle(speed!);
    expect(speedStyle.fontSize).not.toBe('48px');
    expect(speedStyle.color).not.toBe('rgb(255, 0, 0)');
    expect(overlay.host.style.userSelect).toBe('none');
    expect(overlayCss).toContain('user-select: none');
    const sheetText = [...(overlay.host.shadowRoot?.querySelectorAll('style') ?? [])]
      .map((node) => node.textContent)
      .join('');
    expect(
      sheetText.includes('all: initial') ||
        (overlay.host.shadowRoot?.adoptedStyleSheets?.length ?? 0) > 0,
    ).toBeTruthy();
  });

  it('stays visible when auto-hide is off', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(10_000);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after the auto-hide delay and stays hidden on a later speed APPLY', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(1.5, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('does not restart the auto-hide timer when only target speed changes', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    vi.advanceTimersByTime(150);
    overlay.setBehavior(tabBehavior(1.5, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(50);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('reveals from a later overlay auto-hide APPLY', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides immediately on setControlled(false) and cancels the auto-hide timer', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(3, { overlayAutoHide: true, overlayAutoHideDelayMs: 5_000 }));
    overlay.layout();
    overlay.setControlled(false);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(2, { overlayAutoHide: true, overlayAutoHideDelayMs: 5_000 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('stays hidden when overlayVisible is false even if auto-hide is off', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayVisible: false, overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('hides when the video is disconnected or near-zero size', () => {
    const video = sizedVideo({ left: 0, top: 0, width: 0, height: 0 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');

    const visible = sizedVideo();
    const shown = new VideoOverlay(visible, () => shown.layout());
    shown.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    shown.setControlled(true);
    shown.layout();
    expect(shown.host.style.visibility).toBe('visible');
    visible.remove();
    shown.layout();
    expect(shown.host.style.visibility).toBe('hidden');
  });

  it('destroy removes the host and timers', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 1_000 }),
    );
    overlay.destroy();
    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
    expect(overlay.host.isConnected).toBe(false);
    expect(overlay.host.shadowRoot?.querySelector('.speed')).toBeNull();
    vi.advanceTimersByTime(1_000);
  });

  it('keeps inline host geometry against hostile page selectors', () => {
    const style = document.createElement('style');
    style.textContent = `${OVERLAY_HOST_TAG} { position: static !important; z-index: 1 !important; }`;
    document.head.append(style);
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('hides at the built-in 2000ms delay and reveals on pointer activity, not video focus', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(1_999);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(1);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('focus'));
    video.dispatchEvent(new Event('focusin'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.notifyActivity();
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after a pointer click on Faster even if the pointer stays over the overlay', () => {
    vi.useFakeTimers();
    const adjustSpeed = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    expect(shell).toBeInstanceOf(HTMLElement);
    (faster as HTMLButtonElement).focus();
    faster?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(adjustSpeed).toHaveBeenCalledWith(1, video);
    expect(overlay.host.shadowRoot?.activeElement).not.toBe(faster);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('resets to default speed from the speed readout and disables at Default', () => {
    const resetSpeed = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      resetSpeed,
    });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.speedReadout).toBeInstanceOf(HTMLButtonElement);
    overlay.speedReadout?.click();
    expect(resetSpeed).toHaveBeenCalledWith(video);

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.speedReadout?.disabled).toBe(true);
    resetSpeed.mockClear();
    overlay.speedReadout?.click();
    expect(resetSpeed).not.toHaveBeenCalled();
  });

  it('restarts auto-hide when plus or minus is pressed', () => {
    vi.useFakeTimers();
    const adjustSpeed = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(150);
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    (faster as HTMLButtonElement).click();
    expect(adjustSpeed).toHaveBeenCalledWith(1, video);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(150);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(50);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('stays visible while a control is focused', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    (faster as HTMLButtonElement).focus();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('mounts slower, speed, and faster controls inside the shadow root', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const controls = [...(root?.querySelector('.controls')?.children ?? [])];
    expect(controls.map((node) => node.getAttribute('aria-label') ?? node.className)).toEqual([
      'Move overlay',
      'Slower',
      'Reset to default speed',
      'Faster',
      'Open settings',
    ]);
    expect(overlay.speedReadout?.tagName.toLowerCase()).toBe('button');
    expect(overlay.speedReadout?.querySelector('.speed-value')?.textContent).toBe('1.25×');
    expect(overlay.speedReadout?.hasAttribute('disabled')).toBe(false);
    expect(overlay.host.hasAttribute('aria-hidden')).toBe(false);
  });

  it('hides the position and settings buttons when those settings are off', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: false,
        overlayPositionButton: false,
        overlaySettingsButton: false,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Move overlay"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Open settings"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Slower"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root?.querySelector('[aria-label="Faster"]')).toBeInstanceOf(HTMLButtonElement);
  });

  it('opens a position picker and reports the chosen cell', () => {
    const setOverlayPosition = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      setOverlayPosition,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Bottom right"]')).toBeNull();
    (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    const bottomRight = root?.querySelector('[aria-label="Bottom right"]');
    expect(bottomRight).toBeInstanceOf(HTMLButtonElement);
    (bottomRight as HTMLButtonElement).click();
    expect(setOverlayPosition).toHaveBeenCalledWith(OVERLAY_POSITION.BOTTOM_RIGHT);
    expect(root?.querySelector('[aria-label="Bottom right"]')).toBeNull();
  });

  it('hides after opening the position picker when hover hold is off', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const move = root?.querySelector('[aria-label="Move overlay"]');
    expect(move).toBeInstanceOf(HTMLButtonElement);
    (move as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    root
      ?.querySelector('.controls-shell')
      ?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(root?.querySelector('.position-picker')).toBeNull();
  });

  it('keeps the same Faster button across hide and reveal', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]')).toBe(faster);
    overlay.notifyActivity();
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    expect(overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]')).toBe(faster);
  });

  it('does not keep the overlay visible after closing the position picker', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const move = root?.querySelector('[aria-label="Move overlay"]');
    expect(move).toBeInstanceOf(HTMLButtonElement);
    (move as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    (move as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).toBeNull();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('stays visible while the pointer is over the overlay when hover hold is on', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: true,
        overlayHoverHold: true,
        overlayAutoHideDelayMs: 200,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('stays visible while the pointer is over the position picker when hover hold is on', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: true,
        overlayHoverHold: true,
        overlayAutoHideDelayMs: 200,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    const picker = root?.querySelector('.position-picker');
    const shell = root?.querySelector('.controls-shell');
    expect(picker).toBeInstanceOf(HTMLElement);
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after idle while the pointer is over the overlay when hover hold is off', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: true,
        overlayHoverHold: false,
        overlayAutoHideDelayMs: 200,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('hides after retake when interaction ended during surrender', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const shell = root?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    overlay.setControlled(false);
    overlay.layout();
    shell?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('closes the picker when the position button is hidden', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: false, overlayPositionButton: false }),
    );
    overlay.layout();
    expect(root?.querySelector('.position-picker')).toBeNull();
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.layout();
    expect(root?.querySelector('.position-picker')).toBeNull();
  });

  it('opens settings from the gear button', () => {
    const openSettings = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      openSettings,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const settings = overlay.host.shadowRoot?.querySelector('[aria-label="Open settings"]');
    expect(settings).toBeInstanceOf(HTMLButtonElement);
    (settings as HTMLButtonElement).click();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('updates the settings shortcut hint only while a binding is assigned', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    const behavior = tabBehavior(1, { overlayAutoHide: false });
    const hotkeys = builtInEffectiveHotkeys();
    overlay.setBehavior(behavior, hotkeys);
    overlay.setControlled(true);
    overlay.layout();
    const settings = overlay.host.shadowRoot?.querySelector('[aria-label="Open settings"]');
    expect(settings).toBeInstanceOf(HTMLButtonElement);
    expect(settings?.querySelector('kbd')).toBeNull();
    expect(settings?.hasAttribute('aria-keyshortcuts')).toBe(false);

    const assigned = {
      ...hotkeys,
      openSettings: { code: 'KeyO', ctrl: true, alt: false, shift: true, meta: false },
    };
    overlay.setBehavior(behavior, assigned);
    overlay.layout();
    expect(settings?.querySelectorAll('kbd.hotkey-hint')).toHaveLength(1);
    expect(settings?.querySelector('kbd')?.textContent).toBe('Ctrl\u2009Shift\u2009O');
    expect(settings?.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+O');

    overlay.setBehavior({ ...behavior, overlayHotkeyHints: false }, assigned);
    overlay.layout();
    expect(settings?.querySelector('kbd')).toBeNull();
    expect(settings?.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+O');

    overlay.setBehavior(behavior, {
      ...assigned,
      openSettings: { ...assigned.openSettings, code: 'KeyP' },
    });
    overlay.layout();
    expect(settings?.querySelectorAll('kbd.hotkey-hint')).toHaveLength(1);
    expect(settings?.querySelector('kbd')?.textContent).toBe('Ctrl\u2009Shift\u2009P');

    overlay.setBehavior(behavior, hotkeys);
    overlay.layout();
    expect(settings?.querySelector('kbd')).toBeNull();
    expect(settings?.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('disables plus at max speed and minus at min speed', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(4, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const slower = overlay.host.shadowRoot?.querySelector('[aria-label="Slower"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    expect(slower).toBeInstanceOf(HTMLButtonElement);
    expect((faster as HTMLButtonElement).disabled).toBe(true);
    expect((slower as HTMLButtonElement).disabled).toBe(false);

    overlay.setBehavior(tabBehavior(0.25, { overlayAutoHide: false }));
    overlay.layout();
    const fasterAtMin = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const slowerAtMin = overlay.host.shadowRoot?.querySelector('[aria-label="Slower"]');
    expect((fasterAtMin as HTMLButtonElement).disabled).toBe(false);
    expect((slowerAtMin as HTMLButtonElement).disabled).toBe(true);
  });

  it('reveals from notifyActivity without scheduling layout itself', () => {
    vi.useFakeTimers();
    const requestLayout = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, requestLayout);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    requestLayout.mockClear();
    overlay.notifyActivity();
    expect(requestLayout).not.toHaveBeenCalled();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('does not reveal on pointerenter or pointerleave after idle hide', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointerleave'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointerenter'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointermove'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.notifyActivity();
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides immediately on surrender', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 5_000 }),
    );
    overlay.setControlled(true);
    overlay.layout();
    overlay.setControlled(false);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('starts a fresh auto-hide timer on retake after surrender', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    overlay.setControlled(false);
    overlay.layout();
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('keeps two overlays isolated and leaves B intact when A is destroyed', () => {
    const videoA = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const videoB = sizedVideo({ left: 300, top: 20, width: 200, height: 100 });
    const overlayA = new VideoOverlay(videoA, () => overlayA.layout());
    const overlayB = new VideoOverlay(videoB, () => overlayB.layout());
    const behavior = tabBehavior(1.25, { overlayAutoHide: false });
    overlayA.setBehavior(behavior);
    overlayB.setBehavior(behavior);
    overlayA.setControlled(true);
    overlayB.setControlled(true);
    overlayA.layout();
    overlayB.layout();

    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(2);
    expect(overlayA.host).not.toBe(overlayB.host);
    expect(overlayA.speedReadout).not.toBe(overlayB.speedReadout);
    expect(overlayA.speedReadout?.textContent).toBe('1.25×');
    expect(overlayB.speedReadout?.textContent).toBe('1.25×');
    expect(overlayA.host.style.visibility).toBe('visible');
    expect(overlayB.host.style.visibility).toBe('visible');

    const fasterA = overlayA.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const fasterB = overlayB.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(fasterA).toBeInstanceOf(HTMLButtonElement);
    expect(fasterB).toBeInstanceOf(HTMLButtonElement);
    (fasterA as HTMLButtonElement).click();
    expect(overlayB.host).toBe(document.querySelectorAll(OVERLAY_HOST_TAG)[1]);
    expect(overlayB.host.style.visibility).toBe('visible');
    expect(overlayB.speedReadout?.textContent).toBe('1.25×');

    const moveA = overlayA.host.shadowRoot?.querySelector('[aria-label="Move overlay"]');
    const moveB = overlayB.host.shadowRoot?.querySelector('[aria-label="Move overlay"]');
    expect(moveA).toBeInstanceOf(HTMLButtonElement);
    expect(moveB).toBeInstanceOf(HTMLButtonElement);
    (moveA as HTMLButtonElement).click();
    expect(overlayA.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();
    expect(overlayB.host.shadowRoot?.querySelector('.position-picker')).toBeNull();
    (moveB as HTMLButtonElement).click();
    expect(overlayA.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();
    expect(overlayB.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();

    overlayA.setControlled(false);
    overlayA.layout();
    expect(overlayA.host.style.visibility).toBe('hidden');
    expect(overlayB.host.style.visibility).toBe('visible');
    expect(overlayB.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();

    overlayA.destroy();
    expect(overlayA.host.isConnected).toBe(false);
    expect(overlayB.host.isConnected).toBe(true);
    expect(overlayB.speedReadout?.textContent).toBe('1.25×');
    expect(overlayB.host.style.visibility).toBe('visible');
  });

  it('detaches overlay listeners on destroy and does not accumulate them', () => {
    const requestLayout = vi.fn();
    const video = sizedVideo();
    const first = new VideoOverlay(video, requestLayout);
    first.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    first.setControlled(true);
    first.layout();
    requestLayout.mockClear();
    first.destroy();
    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    video.dispatchEvent(new Event('pointermove'));
    video.dispatchEvent(new Event('focus'));
    expect(requestLayout).not.toHaveBeenCalled();

    for (let index = 0; index < 8; index += 1) {
      const overlay = new VideoOverlay(video, requestLayout);
      overlay.destroy();
    }
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(0);
    requestLayout.mockClear();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    expect(requestLayout).not.toHaveBeenCalled();
  });

  it('shows [ / \\ ] captions and aria-keyshortcuts on −/reset/+ only when those actions are bound', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), builtInEffectiveHotkeys());
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const slower = root?.querySelector('[aria-label="Slower"]');
    const faster = root?.querySelector('[aria-label="Faster"]');
    expect(slower?.getAttribute('aria-keyshortcuts')).toBe('[');
    expect(faster?.getAttribute('aria-keyshortcuts')).toBe(']');
    expect(slower?.querySelector('.hotkey-hint')?.textContent).toBe('[');
    expect(faster?.querySelector('.hotkey-hint')?.textContent).toBe(']');
    expect(slower?.querySelector('.hotkey-hint')?.tagName).toBe('KBD');
    expect(slower?.querySelector('.adjust-glyph')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(slower?.querySelector('.adjust-glyph')?.nextElementSibling?.className).toBe(
      'hotkey-hint',
    );
    expect(overlayCss).toContain('flex-direction: row');
    expect(overlayCss).toContain('height: 15px');
    expect(overlay.speedReadout?.getAttribute('aria-keyshortcuts')).toBe('\\');
    expect(overlay.speedReadout?.querySelector('.hotkey-hint')?.textContent).toBe('\\');

    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: false, overlayHotkeyHints: false }),
      builtInEffectiveHotkeys(),
    );
    expect(slower?.getAttribute('aria-keyshortcuts')).toBe('[');
    expect(faster?.getAttribute('aria-keyshortcuts')).toBe(']');
    expect(overlay.speedReadout?.getAttribute('aria-keyshortcuts')).toBe('\\');
    expect(slower?.querySelector('.hotkey-hint')).toBeNull();
    expect(faster?.querySelector('.hotkey-hint')).toBeNull();
    expect(overlay.speedReadout?.querySelector('.hotkey-hint')).toBeNull();

    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: false, overlayHotkeyHints: true }),
      builtInEffectiveHotkeys(),
    );
    expect(slower?.querySelectorAll('.hotkey-hint')).toHaveLength(1);
    expect(faster?.querySelectorAll('.hotkey-hint')).toHaveLength(1);
    expect(slower?.querySelector('.hotkey-hint')?.textContent).toBe('[');
    expect(faster?.querySelector('.hotkey-hint')?.textContent).toBe(']');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), {
      ...builtInEffectiveHotkeys(),
      decreaseSpeed: {
        code: 'BracketLeft',
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
      },
    });
    const chord = root?.querySelector('[aria-label="Slower"]')?.querySelector('.hotkey-hint');
    expect(chord?.textContent?.includes('+')).toBe(false);
    expect(chord?.textContent?.endsWith('[')).toBe(true);
    expect(chord?.textContent).toContain('\u2009');
    expect(chord?.childElementCount).toBe(0);

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), {
      ...builtInEffectiveHotkeys(),
      decreaseSpeed: null,
      increaseSpeed: null,
    });
    expect(
      root?.querySelector('[aria-label="Slower"]')?.getAttribute('aria-keyshortcuts'),
    ).toBeNull();
    expect(root?.querySelector('[aria-label="Faster"]')?.querySelector('.hotkey-hint')).toBeNull();
    expect(overlay.speedReadout?.querySelector('.hotkey-hint')?.textContent).toBe('\\');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), {
      ...builtInEffectiveHotkeys(),
      resetSpeed: null,
    });
    expect(overlay.speedReadout?.getAttribute('aria-keyshortcuts')).toBeNull();
    expect(overlay.speedReadout?.querySelector('.hotkey-hint')).toBeNull();
  });

  it('shows shortcut hints for seek, volume, and loop controls when those keys are bound', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    const binding = { ctrl: false, alt: false, shift: false, meta: false };
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlaySeekBar: true,
        overlayVolumeBar: true,
        overlayExtrasBar: true,
        overlayHotkeyHints: true,
      }),
      {
        ...builtInEffectiveHotkeys(),
        markA: { ...binding, code: 'KeyA' },
        toggleLoop: { ...binding, code: 'KeyL' },
        toggleMute: { ...binding, code: 'KeyM' },
        decreaseVolume: { ...binding, code: 'ArrowDown' },
        increaseVolume: { ...binding, code: 'ArrowUp' },
        jumpTo50Percent: { ...binding, code: 'Digit5' },
      },
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('.loop-mark')?.querySelector('.hotkey-hint')?.textContent).toBe('A');
    expect(root?.querySelector('.loop-toggle')?.getAttribute('aria-keyshortcuts')).toBe('L');
    expect(root?.querySelector('.volume-mute')?.querySelector('.hotkey-hint')?.textContent).toBe(
      'M',
    );
    expect(root?.querySelector('.volume-mute svg')).toBeTruthy();
    expect(root?.querySelector('.loop-clear-mark .loop-slash')).toBeTruthy();
    expect(root?.querySelector('.seek-readout .hotkey-hint')).toBeNull();
    expect(root?.querySelector('.volume-readout .hotkey-hint')).toBeNull();
  });

  it('shows a replaceable flash between top-center and center', () => {
    vi.useFakeTimers();
    const video = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayVisible: false, flashDelayMs: 200 }),
    );
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.layout();
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host).toBeInstanceOf(HTMLElement);
    expect((host as HTMLElement).style.visibility).toBe('visible');
    expect((host as HTMLElement).style.left).toBe('110px');
    expect((host as HTMLElement).style.top).toBe('45px');
    expect((host as HTMLElement).style.transform).toBe('translate(-50%, -50%)');
    const pill = host?.shadowRoot?.querySelector('.hotkey-flash');
    expect(pill?.textContent).toBe('1.25× (+0.25×)]');
    expect(pill?.querySelector('.hotkey-hint')?.textContent).toBe(']');
    expect((host as HTMLElement).style.userSelect).toBe('none');
    expect((pill as HTMLElement).style.opacity).toBe('0.7');

    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelectorAll(HOTKEY_FLASH_HOST_TAG)).toHaveLength(1);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.50× (+0.25×)',
    );
    vi.advanceTimersByTime(199);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('omits a zero speed delta when a hotkey is already at the limit', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(4, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 4,
      targetSpeed: 4,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.layout();
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('4.00×');
  });

  it('keeps the overlay hidden when a hotkey APPLY flashes', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)?.shadowRoot?.textContent).toContain(
      '1.25× (+0.25×)',
    );
  });

  it('keeps a held flash until release, then uses the auto-hide delay', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash(
      {
        kind: 'media',
        label: 'Fast forward',
        detail: '3.00×',
        binding: BUILT_IN_HOTKEYS.increaseSpeed,
      },
      { hold: true },
    );
    overlay.layout();
    vi.advanceTimersByTime(5_000);
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      'Fast forward 3.00×',
    );
    overlay.releaseHeldHotkeyFlash();
    vi.advanceTimersByTime(199);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBe(host);
    vi.advanceTimersByTime(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('does not restart a timed flash when releaseHeldHotkeyFlash is called', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.releaseHeldHotkeyFlash();
    vi.advanceTimersByTime(200);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('lets a later timed flash replace a held flash', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash(
      {
        kind: 'media',
        label: 'Fast forward',
        detail: '3.00×',
        binding: BUILT_IN_HOTKEYS.increaseSpeed,
      },
      { hold: true },
    );
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    vi.advanceTimersByTime(199);
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('1.25× (+0.25×)');
    vi.advanceTimersByTime(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('does not let a stale flash hide timer remove a newer pulse', () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {});
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, flashDelayMs: 5_000 }));
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.50× (+0.25×)',
    );
    vi.advanceTimersByTime(200);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBe(host);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.50× (+0.25×)',
    );
  });

  it('uses hotkey flash opacity and ignores overlay opacity', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayOpacity: 40,
        flashOpacity: 20,
      }),
    );
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    const pill = document
      .querySelector(HOTKEY_FLASH_HOST_TAG)
      ?.shadowRoot?.querySelector('.hotkey-flash');
    expect(pill).toBeInstanceOf(HTMLElement);
    expect((pill as HTMLElement).style.opacity).toBe('0.2');
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayOpacity: 100,
        flashOpacity: 55,
      }),
    );
    expect((pill as HTMLElement).style.opacity).toBe('0.55');
  });

  it('applies flash scale independently of overlay scale', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayScale: 150, flashScale: 150 }),
    );
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    const flashHost = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(flashHost).toBeInstanceOf(HTMLElement);
    expect(overlay.host.style.getPropertyValue('--overlay-scale')).toBe('1.5');
    expect(overlay.host.style.getPropertyValue('--flash-scale')).toBe('');
    expect((flashHost as HTMLElement).style.getPropertyValue('--flash-scale')).toBe('1.5');
    expect((flashHost as HTMLElement).style.getPropertyPriority('--flash-scale')).toBe('important');
    expect((flashHost as HTMLElement).style.getPropertyValue('--overlay-scale')).toBe('');
    expect((flashHost as HTMLElement).style.transform).toBe('translate(-50%, -50%)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayScale: 200, flashScale: 150 }),
    );
    expect(overlay.host.style.getPropertyValue('--overlay-scale')).toBe('2');
    expect((flashHost as HTMLElement).style.getPropertyValue('--flash-scale')).toBe('1.5');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayScale: 200, flashScale: 200 }),
    );
    expect((flashHost as HTMLElement).style.getPropertyValue('--flash-scale')).toBe('2');

    overlay.destroy();
    const next = new VideoOverlay(video, () => next.layout());
    next.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayScale: 100,
        flashScale: 125,
        overlayOpacity: 40,
      }),
    );
    next.setControlled(true);
    next.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    const created = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(created).toBeInstanceOf(HTMLElement);
    expect(next.host.style.getPropertyValue('--overlay-scale')).toBe('1');
    expect((created as HTMLElement).style.getPropertyValue('--flash-scale')).toBe('1.25');
    const shell = next.host.shadowRoot?.querySelector('.controls-shell');
    expect((shell as HTMLElement).style.opacity).toBe('0.4');
    next.destroy();
  });

  it('hides the flash immediately when the toggle turns off and ignores a later delay APPLY', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, flashDelayMs: 5_000 }));
    vi.advanceTimersByTime(200);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();

    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.setBehavior(tabBehavior(1.5, { overlayAutoHide: false, hotkeyFlash: false }));
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('shows a control flash only when that toggle is on', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: false }));
    overlay.setControlled(true);
    overlay.showControlFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: true }));
    overlay.showControlFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
    });
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('1.25× (+0.25×)');
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: false }));
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('recreates a flash host after setControlled(false) removes it', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    overlay.setControlled(false);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    overlay.destroy();
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('does not flash when the overlay is not controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('shows the navigation row as a second row only when it is enabled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('.controls-nav')).toBeNull();

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.layout();
    const shell = root?.querySelector('.controls-shell');
    expect([...(shell?.children ?? [])].map((node) => node.className)).toEqual([
      'controls',
      'controls controls-nav',
    ]);
    expect(
      [...(root?.querySelectorAll('.controls-nav .control-nav') ?? [])].map((node) =>
        node.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Jump to start',
      'Rewind',
      'Skip back',
      'Play',
      'Skip forward',
      'Fast forward',
      'Jump to end',
    ]);

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.layout();
    expect(root?.querySelector('.controls-nav')).toBeNull();
  });

  it('reports one-shot navigation presses against its own video', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    (root?.querySelector('[aria-label="Skip forward"]') as HTMLButtonElement).click();
    expect(mediaAction).toHaveBeenCalledWith('skipForward', 'press', video, overlay);
    (root?.querySelector('[aria-label="Jump to start"]') as HTMLButtonElement).click();
    expect(mediaAction).toHaveBeenLastCalledWith('jumpToStart', 'press', video, overlay);
  });

  it('starts rewind and fast forward on pointer down and ends them on release', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayNavigationBar: true,
        overlayHotkeyHints: true,
      }),
      {
        ...builtInEffectiveHotkeys(),
        rewind: { code: 'KeyH', ctrl: false, alt: false, shift: false, meta: false },
      },
    );
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    expect(rewind.disabled).toBe(false);
    expect(rewind.getAttribute('aria-keyshortcuts')).toBe('H');
    rewind.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledWith('rewind', 'start', video, expect.any(Object));
    const rewindOwner = mediaAction.mock.calls[0]?.[3];
    expect(rewindOwner).not.toBe(overlay);
    rewind.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledTimes(1);

    rewind.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenLastCalledWith('rewind', 'end', video, rewindOwner);
    rewind.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenCalledTimes(2);

    mediaAction.mockClear();
    const button = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Fast forward"]',
    ) as HTMLButtonElement;
    button.setPointerCapture = () => undefined;
    button.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledWith('fastForward', 'start', video, expect.any(Object));
    const owner = mediaAction.mock.calls[0]?.[3];
    expect(owner).not.toBe(overlay);
    button.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledTimes(1);

    button.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenLastCalledWith('fastForward', 'end', video, owner);
    button.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenCalledTimes(2);
  });

  it('keeps a pointer hold live through lost capture and blur until pointerup', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    rewind.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, buttons: 1 }));
    expect(mediaAction).toHaveBeenCalledTimes(1);
    rewind.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, buttons: 0 }));
    rewind.dispatchEvent(new Event('blur'));
    expect(mediaAction).toHaveBeenCalledTimes(1);
    rewind.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, buttons: 0 }));
    expect(mediaAction).toHaveBeenLastCalledWith('rewind', 'end', video, expect.any(Object));
  });

  it('keeps the first pointer id when a second finger hits the same hold', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    rewind.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, buttons: 1 }));
    const owner = mediaAction.mock.calls[0]?.[3];
    rewind.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, buttons: 1 }));
    expect(mediaAction).toHaveBeenCalledTimes(1);
    rewind.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, buttons: 0 }));
    expect(mediaAction.mock.calls).toEqual([
      ['rewind', 'start', video, owner],
      ['rewind', 'end', video, owner],
    ]);
    overlay.destroy();
  });

  it('gives overlapping rewind and fast forward holds distinct gesture owners', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    const fastForward = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Fast forward"]',
    ) as HTMLButtonElement;
    rewind.setPointerCapture = () => undefined;
    fastForward.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new Event('pointerdown'));
    fastForward.dispatchEvent(new Event('pointerdown'));
    const rewindOwner = mediaAction.mock.calls[0]?.[3];
    const fastForwardOwner = mediaAction.mock.calls[1]?.[3];
    expect(rewindOwner).not.toBe(fastForwardOwner);
    rewind.dispatchEvent(new Event('pointerup'));
    expect(mediaAction.mock.calls[2]).toEqual(['rewind', 'end', video, rewindOwner]);
    fastForward.dispatchEvent(new Event('pointerup'));
    expect(mediaAction.mock.calls[3]).toEqual(['fastForward', 'end', video, fastForwardOwner]);
  });

  it('holds rewind and fast forward from the keyboard and never fires a click', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    for (const label of ['Rewind', 'Fast forward'] as const) {
      mediaAction.mockClear();
      const button = overlay.host.shadowRoot?.querySelector(
        `[aria-label="${label}"]`,
      ) as HTMLButtonElement;
      button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', repeat: true, cancelable: true }),
      );
      expect(mediaAction).toHaveBeenCalledTimes(1);
      const action = label === 'Rewind' ? 'rewind' : 'fastForward';
      expect(mediaAction).toHaveBeenCalledWith(action, 'start', video, expect.any(Object));
      const owner = mediaAction.mock.calls[0]?.[3];
      button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', cancelable: true }));
      expect(mediaAction).toHaveBeenLastCalledWith(action, 'end', video, owner);

      mediaAction.mockClear();
      button.click();
      expect(mediaAction).not.toHaveBeenCalled();
    }
  });

  it('ends a live hold when the row, overlay, or view goes away', () => {
    const navigationOn = tabBehavior(1, {
      overlayAutoHide: false,
      overlayNavigationBar: true,
    });
    for (const label of ['Fast forward', 'Rewind'] as const) {
      const mediaAction = vi.fn();
      const video = sizedVideo();
      const overlay = new VideoOverlay(video, () => overlay.layout(), {
        adjustSpeed() {},
        mediaAction,
      });
      overlay.setBehavior(navigationOn);
      overlay.setControlled(true);
      overlay.layout();
      const hold = (): void => {
        const button = overlay.host.shadowRoot?.querySelector(
          `[aria-label="${label}"]`,
        ) as HTMLButtonElement;
        button.setPointerCapture = () => undefined;
        button.dispatchEvent(new Event('pointerdown'));
      };
      const phases = (): string[] => mediaAction.mock.calls.map(([, phase]) => phase);

      hold();
      overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
      expect(phases()).toEqual(['start', 'end']);

      mediaAction.mockClear();
      overlay.setBehavior(navigationOn);
      hold();
      overlay.setBehavior(
        tabBehavior(1, {
          overlayAutoHide: false,
          overlayNavigationBar: true,
          overlayVisible: false,
        }),
      );
      expect(phases()).toEqual(['start', 'end']);

      mediaAction.mockClear();
      overlay.setBehavior(navigationOn);
      overlay.layout();
      hold();
      overlay.destroy();
      expect(phases()).toEqual(['start', 'end']);
    }
  });

  it('tracks the play and pause state of its own video', () => {
    const video = sizedVideo();
    let paused = true;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Play"]')).toBeInstanceOf(HTMLButtonElement);

    paused = false;
    video.dispatchEvent(new Event('play'));
    expect(root?.querySelector('[aria-label="Play"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Pause"]')).toBeInstanceOf(HTMLButtonElement);

    paused = true;
    video.dispatchEvent(new Event('pause'));
    expect(root?.querySelector('[aria-label="Play"]')).toBeInstanceOf(HTMLButtonElement);
  });

  it('shows navigation hotkey hints only for bound actions', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayNavigationBar: true,
        overlayHotkeyHints: true,
      }),
      {
        ...builtInEffectiveHotkeys(),
        skipForward: { code: 'KeyK', ctrl: false, alt: false, shift: false, meta: false },
      },
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const skipForward = root?.querySelector('[aria-label="Skip forward"]') as HTMLButtonElement;
    const skipBack = root?.querySelector('[aria-label="Skip back"]') as HTMLButtonElement;
    expect(skipForward.querySelector('.hotkey-hint')?.textContent).toBe('K');
    expect(skipForward.getAttribute('aria-keyshortcuts')).toBe('K');
    expect(skipBack.querySelector('.hotkey-hint')).toBeNull();
    expect(skipBack.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('keeps the overlay visible while a fast forward hold is live', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction() {},
    });
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlayNavigationBar: true,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const button = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Fast forward"]',
    ) as HTMLButtonElement;
    button.setPointerCapture = () => undefined;
    button.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(400);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');

    button.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(400);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('keeps the seek row off by default and independent of navigation', () => {
    const video = timelineVideo({ currentTime: 12, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.shadowRoot?.querySelector('.controls-seek')).toBeNull();

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.layout();
    expect(rowClasses(overlay)).toEqual(['controls', 'controls controls-seek']);

    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlaySeekBar: true,
        overlayNavigationBar: true,
      }),
    );
    overlay.layout();
    expect(rowClasses(overlay)).toEqual([
      'controls',
      'controls controls-nav',
      'controls controls-seek',
    ]);

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.layout();
    expect(overlay.host.shadowRoot?.querySelector('.controls-seek')).toBeNull();
    expect(overlay.host.shadowRoot?.querySelector('.controls-nav')).toBeTruthy();
  });

  it('renders time text, disjoint buffers, and duration-relative geometry', () => {
    const video = timelineVideo({
      currentTime: 763,
      duration: 2901,
      buffered: [
        { start: 0, end: 50 },
        { start: 200, end: 400 },
      ],
    });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {} });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(seekReadout(overlay)).toBe('12:43 / 48:21');
    expect(overlay.host.shadowRoot?.querySelectorAll('.seek-tick')).toHaveLength(11);
    expect(overlay.host.shadowRoot?.querySelectorAll('.seek-tick-major')).toHaveLength(3);
    expect(seekRange(overlay).getAttribute('aria-valuetext')).toBe('12:43 of 48:21');
    const first = overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement;
    expect(overlay.host.shadowRoot?.querySelectorAll('.seek-buffered')).toHaveLength(2);
    expect(first.style.width).toBe(`${(50 / 2901) * 100}%`);

    Object.defineProperty(video, 'duration', {
      configurable: true,
      get: () => 5802,
    });
    video.dispatchEvent(new Event('durationchange'));
    const updated = overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement;
    expect(updated.style.width).toBe(`${(50 / 5802) * 100}%`);
  });

  it('shows finite current time against an unknown duration and disables the slider', () => {
    const video = timelineVideo({ currentTime: 763, duration: Number.POSITIVE_INFINITY });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(seekReadout(overlay)).toBe('12:43 / --:--');
    expect(seekRange(overlay).disabled).toBe(true);
    const slots = overlay.host.shadowRoot?.querySelectorAll('.seek-time');
    expect(slots?.[0]?.getAttribute('data-reserve')).toBe('00:00');
    expect(slots?.[1]?.getAttribute('data-reserve')).toBe('--:--');
  });

  it('sizes both seek clocks to the duration so later digits do not widen the row', () => {
    const video = timelineVideo({ currentTime: 599, duration: 3723 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(seekReadout(overlay)).toBe('9:59 / 1:02:03');
    expect(seekReserves(overlay)).toEqual(['0:00:00', '0:00:00']);

    video.currentTime = 600;
    video.dispatchEvent(new Event('timeupdate'));
    expect(seekReadout(overlay)).toBe('10:00 / 1:02:03');
    expect(seekReserves(overlay)).toEqual(['0:00:00', '0:00:00']);

    video.currentTime = 3600;
    video.dispatchEvent(new Event('timeupdate'));
    expect(seekReadout(overlay)).toBe('1:00:00 / 1:02:03');
    expect(seekReserves(overlay)).toEqual(['0:00:00', '0:00:00']);
  });

  it('seeks only the owned video through OverlayActions.seek', () => {
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.value = '30';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(30, video);
    expect(video.paused).toBe(true);
    expect(seekReadout(overlay)).toBe('0:30 / 1:00');
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('0:30 / 1:00');
  });

  it('coalesces input seeks and commits once per pointer gesture', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      delete frames[id - 1];
    });
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    range.value = '20';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.value = '35';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seek).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenLastCalledWith(35, video);
    range.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seek).toHaveBeenCalledTimes(2);
    expect(seek).toHaveBeenLastCalledWith(35, video);
    expect(overlay.host.shadowRoot?.activeElement).not.toBe(range);
  });

  it('cancels a pointer gesture without committing and restores actual time', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    range.value = '40';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
    expect(seek).not.toHaveBeenCalled();
    expect(seekReadout(overlay)).toBe('0:10 / 1:00');
    expect(overlay.host.shadowRoot?.querySelector('.controls-seek')?.className).toContain(
      'controls-seek',
    );
  });

  it('ends a pointer scrub that leaves the range exactly once', () => {
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true }));
    expect(
      overlay.host.shadowRoot?.querySelector('.controls-seek')?.hasAttribute('data-scrubbing'),
    ).toBe(true);
    range.value = '22';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
    expect(
      overlay.host.shadowRoot?.querySelector('.controls-seek')?.hasAttribute('data-scrubbing'),
    ).toBe(false);
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seek.mock.calls.filter((call) => call[0] === 22)).toHaveLength(1);
  });

  it('drops document seek listeners when the seek row is removed', () => {
    const hits = countCaptureListeners('pointerup');
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(hits()).toBe(1);

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.layout();
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.layout();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(hits()).toBe(2);

    overlay.destroy();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(hits()).toBe(2);
  });

  it('drops document hold listeners when the navigation row is removed', () => {
    const hits = countCaptureListeners('pointerup');
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(hits()).toBe(2);

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.layout();
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.layout();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(hits()).toBe(4);

    overlay.destroy();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(hits()).toBe(4);
  });

  it('ignores a different pointer ending a live seek scrub', () => {
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true }));
    range.value = '22';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, bubbles: true }));
    expect(seekReadout(overlay)).toBe('0:22 / 1:00');
    video.dispatchEvent(new Event('progress'));
    expect(seekReadout(overlay)).toBe('0:22 / 1:00');
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seek.mock.calls.filter((call) => call[0] === 22)).toHaveLength(1);
  });

  it('does not let progress replace an optimistic thumb during a scrub', () => {
    const seek = vi.fn(() => true);
    const video = timelineVideo({
      currentTime: 10,
      duration: 60,
      buffered: [{ start: 0, end: 20 }],
    });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    range.value = '40';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seekReadout(overlay)).toBe('0:40 / 1:00');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => 10,
    });
    video.dispatchEvent(new Event('progress'));
    video.dispatchEvent(new Event('durationchange'));
    expect(seekReadout(overlay)).toBe('0:40 / 1:00');
    range.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(seekReadout(overlay)).toBe('0:10 / 1:00');
  });

  it('dirties structure from a throttled timeupdate during a pending keyboard seek', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const buffered = [{ start: 0, end: 10 }];
    const video = timelineVideo({ currentTime: 5, duration: 100, buffered });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    range.value = '20';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    buffered[0] = { start: 0, end: 50 };
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.host.shadowRoot?.querySelectorAll('.seek-buffered')).toHaveLength(1);
    expect(
      (overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement).style.width,
    ).toBe('10%');
    frames[0]?.(0);
    expect(
      (overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement).style.width,
    ).toBe('50%');
  });

  it('does not inspect buffered while unowned or overlay-hidden', () => {
    const video = timelineVideo({
      currentTime: 5,
      duration: 60,
      buffered: [{ start: 0, end: 10 }],
    });
    const buffered = vi.spyOn(video, 'buffered', 'get');
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    video.dispatchEvent(new Event('timeupdate'));
    expect(buffered).not.toHaveBeenCalled();

    overlay.setControlled(true);
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true, overlayVisible: false }),
    );
    buffered.mockClear();
    video.dispatchEvent(new Event('timeupdate'));
    expect(buffered).not.toHaveBeenCalled();
  });

  it('does not recreate chrome on timeupdate and restores failed writes immediately', () => {
    const seek = vi.fn(() => false);
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true, overlayNavigationBar: true }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const skip = overlay.host.shadowRoot?.querySelector('[aria-label="Skip forward"]');
    const range = seekRange(overlay);
    range.value = '40';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seekReadout(overlay)).toBe('0:10 / 1:00');
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.host.shadowRoot?.querySelector('[aria-label="Skip forward"]')).toBe(skip);
  });

  it('cancels a queued seek on surrender, hide, row removal, and destroy', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      delete frames[id - 1];
    });
    const seek = vi.fn();

    const surrendered = timelineVideo({ currentTime: 10, duration: 60 });
    const surrenderOverlay = new VideoOverlay(surrendered, () => surrenderOverlay.layout(), {
      adjustSpeed() {},
      seek,
    });
    surrenderOverlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    surrenderOverlay.setControlled(true);
    surrenderOverlay.layout();
    seekRange(surrenderOverlay).value = '40';
    seekRange(surrenderOverlay).dispatchEvent(new Event('input', { bubbles: true }));
    surrenderOverlay.setControlled(false);
    frames.at(-1)?.(0);
    seekRange(surrenderOverlay).value = '50';
    seekRange(surrenderOverlay).dispatchEvent(new Event('input', { bubbles: true }));

    const hidden = timelineVideo({ currentTime: 10, duration: 60 });
    const hiddenOverlay = new VideoOverlay(hidden, () => hiddenOverlay.layout(), {
      adjustSpeed() {},
      seek,
    });
    hiddenOverlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    hiddenOverlay.setControlled(true);
    hiddenOverlay.layout();
    seekRange(hiddenOverlay).value = '40';
    seekRange(hiddenOverlay).dispatchEvent(new Event('input', { bubbles: true }));
    hiddenOverlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true, overlayVisible: false }),
    );
    frames.at(-1)?.(0);

    const removed = timelineVideo({ currentTime: 10, duration: 60 });
    const removedOverlay = new VideoOverlay(removed, () => removedOverlay.layout(), {
      adjustSpeed() {},
      seek,
    });
    removedOverlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    removedOverlay.setControlled(true);
    removedOverlay.layout();
    seekRange(removedOverlay).value = '40';
    seekRange(removedOverlay).dispatchEvent(new Event('input', { bubbles: true }));
    removedOverlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    frames.at(-1)?.(0);

    const destroyed = timelineVideo({ currentTime: 10, duration: 60 });
    const destroyedOverlay = new VideoOverlay(destroyed, () => destroyedOverlay.layout(), {
      adjustSpeed() {},
      seek,
    });
    destroyedOverlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    destroyedOverlay.setControlled(true);
    destroyedOverlay.layout();
    seekRange(destroyedOverlay).value = '40';
    seekRange(destroyedOverlay).dispatchEvent(new Event('input', { bubbles: true }));
    destroyedOverlay.destroy();
    frames.at(-1)?.(0);

    expect(seek).not.toHaveBeenCalled();
  });

  it('reconciles input writes without rereading buffered ranges', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({
      currentTime: 10,
      duration: 60,
      buffered: [{ start: 0, end: 20 }],
    });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const buffered = vi.spyOn(video, 'buffered', 'get');
    buffered.mockClear();
    const range = seekRange(overlay);
    range.value = '30';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    frames[0]?.(0);
    expect(seek).toHaveBeenCalledWith(30, video);
    expect(buffered).not.toHaveBeenCalled();
    expect(seekReadout(overlay)).toBe('0:30 / 1:00');
  });

  it('snapshots immediately when the seek bar becomes usable again', () => {
    const buffered = [{ start: 0, end: 10 }];
    const video = timelineVideo({ currentTime: 5, duration: 100, buffered });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true, overlayVisible: false }),
    );
    buffered[0] = { start: 0, end: 40 };
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.layout();
    expect(
      (overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement).style.width,
    ).toBe('40%');
  });

  it('picks up a durationchange after a pending keyboard seek clears', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({
      currentTime: 5,
      duration: 100,
      buffered: [{ start: 0, end: 50 }],
    });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlaySeekBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    seekRange(overlay).value = '20';
    seekRange(overlay).dispatchEvent(new Event('input', { bubbles: true }));
    Object.defineProperty(video, 'duration', {
      configurable: true,
      get: () => 200,
    });
    video.dispatchEvent(new Event('durationchange'));
    expect(
      (overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement).style.width,
    ).toBe('50%');
    frames[0]?.(0);
    expect(seekReadout(overlay)).toBe('0:20 / 3:20');
    expect(
      (overlay.host.shadowRoot?.querySelector('.seek-buffered') as HTMLElement).style.width,
    ).toBe('25%');
  });

  it('restarts auto-hide after a pointer scrub blurs the range', () => {
    vi.useFakeTimers();
    const seek = vi.fn((seconds: number, video: HTMLVideoElement) => {
      video.currentTime = seconds;
      return true;
    });
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed() {}, seek });
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlaySeekBar: true,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const range = seekRange(overlay);
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    range.setPointerCapture = () => undefined;
    range.focus();
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    range.value = '25';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(overlay.host.shadowRoot?.activeElement).not.toBe(range);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('stays visible while the seek range is keyboard-focused', () => {
    vi.useFakeTimers();
    const video = timelineVideo({ currentTime: 10, duration: 60 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlaySeekBar: true,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    seekRange(overlay).focus();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('places the volume row after seek and navigation whenever they appear', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(rowClasses(overlay)).toEqual(['controls', 'controls controls-volume']);
    expect(overlay.host.shadowRoot?.querySelectorAll('.volume-tick')).toHaveLength(11);
    expect(overlay.host.shadowRoot?.querySelector('.volume-readout')?.textContent).toBe('100%');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true, overlaySeekBar: true }),
    );
    overlay.layout();
    expect(rowClasses(overlay)).toEqual([
      'controls',
      'controls controls-seek',
      'controls controls-volume',
    ]);

    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayVolumeBar: true,
        overlaySeekBar: true,
        overlayNavigationBar: true,
      }),
    );
    overlay.layout();
    expect(rowClasses(overlay)).toEqual([
      'controls',
      'controls controls-nav',
      'controls controls-seek',
      'controls controls-volume',
    ]);

    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayVolumeBar: true,
        overlayNavigationBar: true,
      }),
    );
    overlay.layout();
    expect(rowClasses(overlay)).toEqual([
      'controls',
      'controls controls-nav',
      'controls controls-volume',
    ]);
  });

  it('snapshots volume and muted, and follows a later volumechange', () => {
    const video = sizedVideo();
    video.volume = 0.2;
    video.muted = true;
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const mute = volumeMute(overlay);
    expect(volumeRange(overlay).value).toBe('0.2');
    expect(overlay.host.shadowRoot?.querySelector('.volume-readout')?.textContent).toBe('20%');
    expect(mute.dataset.volumeIcon).toBe('muted');
    expect(mute.getAttribute('aria-label')).toBe('Unmute');

    video.muted = false;
    video.volume = 0;
    video.dispatchEvent(new Event('volumechange'));
    expect(mute.dataset.volumeIcon).toBe('silent');
    expect(mute.getAttribute('aria-label')).toBe('Mute');

    video.volume = 0.9;
    video.dispatchEvent(new Event('volumechange'));
    expect(mute.dataset.volumeIcon).toBe('high');
    video.volume = 0.2;
    video.dispatchEvent(new Event('volumechange'));
    expect(mute.dataset.volumeIcon).toBe('low');
  });

  it('reads the current volume again when the row is re-enabled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    video.volume = 0.9;
    video.muted = false;
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.layout();
    expect(volumeMute(overlay).dataset.volumeIcon).toBe('high');
    expect(volumeRange(overlay).value).toBe('0.9');
  });

  it('toggles mute without changing volume and unmutes only the owned video from the slider', () => {
    const other = sizedVideo();
    other.volume = 1;
    const toggleMute = vi.fn();
    const setVolume = vi.fn((level: number, video: HTMLVideoElement) => {
      video.volume = level;
      if (level > 0) {
        video.muted = false;
      }
      return true;
    });
    const video = sizedVideo();
    video.volume = 0.8;
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction(action, _phase, target) {
        if (action === 'toggleMute') {
          toggleMute();
          target.muted = !target.muted;
          target.dispatchEvent(new Event('volumechange'));
        }
      },
      setVolume,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    volumeMute(overlay).click();
    expect(toggleMute).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0.8);
    expect(volumeMute(overlay).dataset.volumeIcon).toBe('muted');
    expect(other.volume).toBe(1);
    expect(other.muted).toBe(false);

    const range = volumeRange(overlay);
    range.value = '0.4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith(0.4, video);
    expect(video.muted).toBe(false);
    expect(other.volume).toBe(1);
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('Volume 40%');
  });

  it('ends a volume drag outside the range once without another write', () => {
    const setVolume = vi.fn((level: number, video: HTMLVideoElement) => {
      video.volume = level;
      if (level > 0) {
        video.muted = false;
      }
      return true;
    });
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      setVolume,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = volumeRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true }));
    range.value = '0.4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, bubbles: true }));
    expect(volumeBar(overlay).hasAttribute('data-scrubbing')).toBe(true);
    expect(setVolume).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith(0.4, video);
    expect(volumeBar(overlay).hasAttribute('data-scrubbing')).toBe(false);
    expect(overlay.host.shadowRoot?.activeElement).not.toBe(range);
  });

  it('ends a volume drag when the overlay hides and shows the media volume again', () => {
    const setVolume = vi.fn((level: number, video: HTMLVideoElement) => {
      video.volume = level;
      return true;
    });
    const video = sizedVideo();
    video.volume = 0.8;
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      setVolume,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = volumeRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, bubbles: true }));
    range.value = '0.2';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(volumeBar(overlay).hasAttribute('data-scrubbing')).toBe(true);
    expect(range.value).toBe('0.2');

    overlay.setControlled(false);
    expect(volumeBar(overlay).hasAttribute('data-scrubbing')).toBe(false);
    video.volume = 0.8;
    video.dispatchEvent(new Event('volumechange'));

    overlay.setControlled(true);
    expect(range.value).toBe('0.8');
    expect(overlay.host.shadowRoot?.querySelector('.volume-readout')?.textContent).toBe('80%');
    expect(volumeBar(overlay).hasAttribute('data-scrubbing')).toBe(false);
  });

  it('restores the media volume when a keyboard volume write fails', () => {
    const setVolume = vi.fn(() => false);
    const video = sizedVideo();
    video.volume = 0.8;
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      setVolume,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = volumeRange(overlay);
    range.value = '0.3';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(setVolume).toHaveBeenCalledWith(0.3, video);
    expect(video.volume).toBe(0.8);
    expect(range.value).toBe('0.8');
    expect(overlay.host.shadowRoot?.querySelector('.volume-readout')?.textContent).toBe('80%');
    expect(volumeBar(overlay).hasAttribute('data-scrubbing')).toBe(false);
  });

  it('drops document volume listeners when the row is removed during a drag', () => {
    const hits = countCaptureListeners('pointerup');
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayVolumeBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const range = volumeRange(overlay);
    range.setPointerCapture = () => undefined;
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true }));
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.layout();
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3 }));
    expect(hits()).toBe(0);
    expect(overlay.host.shadowRoot?.querySelector('.controls-volume')).toBeNull();
  });

  it('places the extras row after whichever optional rows are already showing', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(rowClasses(overlay)).toEqual(['controls', 'controls controls-extras']);
    expect(loopControlLabels(overlay)).toEqual([
      'Mark A',
      'Clear mark A',
      'Jump to A',
      'Mark B',
      'Clear mark B',
      'Jump to B',
      'Loop',
      'Fullscreen on',
    ]);
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')).toBeNull();
    expect(loopClearButton(overlay, 'a').hidden).toBe(true);
    expect(loopJumpButton(overlay, 'a').hidden).toBe(true);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
    expect(loopToggle(overlay).querySelectorAll('path')).toHaveLength(5);

    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayExtrasBar: true,
        overlayVolumeBar: true,
        overlaySeekBar: true,
        overlayNavigationBar: true,
      }),
    );
    expect(rowClasses(overlay)).toEqual([
      'controls',
      'controls controls-nav',
      'controls controls-seek',
      'controls controls-volume',
      'controls controls-extras',
    ]);
  });

  it('shows a mark on the button, replaces it, and clears it without seeking', () => {
    const media = loopMedia({ currentTime: 65 });
    const overlay = controlledLoop(media.video);
    loopMarkButton(overlay, 'a').click();
    expect(loopMarkButton(overlay, 'a').getAttribute('aria-label')).toBe('Mark A, 1:05.0');
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')?.textContent).toBe('1:05.0');
    expect(loopClearButton(overlay, 'a').hidden).toBe(false);
    expect(loopClearButton(overlay, 'a').textContent).toContain('A');
    expect(loopClearButton(overlay, 'a').querySelector('.loop-slash')).toBeTruthy();
    expect(loopJumpButton(overlay, 'a').hidden).toBe(false);
    expect(loopClearButton(overlay, 'a').hidden).toBe(false);

    media.setCurrentTime(90);
    loopMarkButton(overlay, 'a').click();
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')?.textContent).toBe('1:30.0');
    expect(media.video.currentTime).toBe(90);

    const clear = loopClearButton(overlay, 'a');
    clear.focus();
    clear.click();
    expect(overlay.host.shadowRoot?.activeElement).toBe(loopMarkButton(overlay, 'a'));
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')).toBeNull();
    expect(loopJumpButton(overlay, 'a').hidden).toBe(true);
    expect(clear.hidden).toBe(true);
    expect(media.loopWrites).toEqual([]);
  });

  it('flashes extras-row buttons when button flash is on', () => {
    const media = loopMedia({ currentTime: 65 });
    const overlay = controlledLoop(media.video);
    const flashText = (): string =>
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent ?? '';

    loopMarkButton(overlay, 'a').click();
    expect(flashText()).toBe('Mark A 1:05.0');
    loopJumpButton(overlay, 'a').click();
    expect(flashText()).toBe('Jump to A 1:05.0');
    loopToggle(overlay).click();
    expect(flashText()).toBe('Loop on');
    loopToggle(overlay).click();
    expect(flashText()).toBe('Loop off');
    loopClearButton(overlay, 'a').click();
    expect(flashText()).toBe('Clear mark A');

    const quiet = controlledLoop(loopMedia({ currentTime: 4 }).video);
    quiet.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true, buttonFlash: false }),
    );
    loopMarkButton(quiet, 'a').click();
    expect(document.querySelectorAll(HOTKEY_FLASH_HOST_TAG)).toHaveLength(1);
  });

  it('jumps to the stored mark and leaves that mark unchanged', () => {
    const media = loopMedia({ currentTime: 10 });
    const overlay = controlledLoop(media.video);
    loopMarkButton(overlay, 'b').click();
    media.setCurrentTime(40);
    loopJumpButton(overlay, 'b').click();
    expect(media.video.currentTime).toBe(10);
    expect(loopMarkButton(overlay, 'b').querySelector('.loop-badge')?.textContent).toBe('0:10.0');
    expect(media.play).not.toHaveBeenCalled();
  });

  it('does not write video.loop when marks change while looping is off', () => {
    const media = loopMedia({ loop: true, currentTime: 8 });
    const overlay = controlledLoop(media.video);
    loopMarkButton(overlay, 'a').click();
    loopClearButton(overlay, 'a').click();
    expect(media.loopWrites).toEqual([]);
    expect(media.video.loop).toBe(true);
  });

  it('restores the page loop value when Loop is turned off', () => {
    const media = loopMedia({ loop: true, currentTime: 5, duration: 30 });
    const overlay = controlledLoop(media.video);
    loopToggle(overlay).click();
    expect(media.video.loop).toBe(true);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('true');
    expect(loopToggle(overlay).querySelectorAll('path')).toHaveLength(4);
    loopMarkButton(overlay, 'a').click();
    expect(media.video.loop).toBe(false);
    loopToggle(overlay).click();
    expect(media.video.loop).toBe(true);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')?.textContent).toBe('0:05.0');
  });

  it('keeps the original page loop value across native and custom modes', () => {
    const media = loopMedia({ loop: false, currentTime: 5, duration: 30 });
    const overlay = controlledLoop(media.video);
    loopToggle(overlay).click();
    expect(media.video.loop).toBe(true);
    loopMarkButton(overlay, 'a').click();
    expect(media.video.loop).toBe(false);
    loopClearButton(overlay, 'a').click();
    expect(media.video.loop).toBe(true);
    loopToggle(overlay).click();
    expect(media.video.loop).toBe(false);
    expect(media.loopWrites).toEqual([true, false, true, false]);
  });

  it('stops the loop and keeps marks when the video is no longer controlled', () => {
    const media = loopMedia({ loop: true, currentTime: 8, duration: 30 });
    const overlay = controlledLoop(media.video);
    loopToggle(overlay).click();
    loopMarkButton(overlay, 'a').click();
    expect(media.video.loop).toBe(false);
    overlay.setControlled(false);
    expect(media.video.loop).toBe(true);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')?.textContent).toBe('0:08.0');
    overlay.setControlled(true);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
    expect(media.video.loop).toBe(true);
  });

  it('stops the loop when the overlay or the loop row is turned off, and keeps marks', () => {
    const media = loopMedia({ loop: false, currentTime: 9, duration: 30 });
    const overlay = controlledLoop(media.video);
    loopToggle(overlay).click();
    loopMarkButton(overlay, 'b').click();
    expect(media.video.loop).toBe(false);
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true, overlayVisible: false }),
    );
    expect(media.video.loop).toBe(false);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
    expect(loopMarkButton(overlay, 'b').querySelector('.loop-badge')?.textContent).toBe('0:09.0');

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true }));
    loopToggle(overlay).click();
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('true');
    expect(media.video.loop).toBe(false);
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: false }));
    expect(overlay.host.shadowRoot?.querySelector('.controls-extras')).toBeNull();
    expect(media.video.loop).toBe(false);
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true }));
    expect(loopMarkButton(overlay, 'b').querySelector('.loop-badge')?.textContent).toBe('0:09.0');
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
  });

  it('restarts auto-hide once when an extras-row button is clicked', () => {
    vi.useFakeTimers();
    const media = loopMedia({ currentTime: 5 });
    const overlay = new VideoOverlay(media.video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlayExtrasBar: true,
        buttonFlash: false,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(100);
    const startTimer = vi.spyOn(globalThis, 'setTimeout');

    loopMarkButton(overlay, 'a').click();

    expect(startTimer).toHaveBeenCalledTimes(1);
    expect(startTimer).toHaveBeenCalledWith(expect.any(Function), 200);
    vi.advanceTimersByTime(100);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(100);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('keeps looping while the overlay is only auto-hidden', () => {
    vi.useFakeTimers();
    const media = loopMedia({ loop: false, duration: 30 });
    const overlay = new VideoOverlay(media.video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlayExtrasBar: true,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    loopToggle(overlay).click();
    expect(media.video.loop).toBe(true);
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(media.video.loop).toBe(true);
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('true');
  });

  it('clears marks and loop ownership when the media element is emptied', () => {
    const media = loopMedia({ loop: true, currentTime: 14, duration: 30 });
    const overlay = controlledLoop(media.video);
    loopToggle(overlay).click();
    loopMarkButton(overlay, 'a').click();
    loopMarkButton(overlay, 'b').click();
    expect(media.video.loop).toBe(false);
    media.video.dispatchEvent(new Event('emptied'));
    expect(media.video.loop).toBe(true);
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')).toBeNull();
    expect(loopMarkButton(overlay, 'b').querySelector('.loop-badge')).toBeNull();
    expect(loopToggle(overlay).getAttribute('aria-pressed')).toBe('false');
  });

  it('seeks a paused custom loop back into the span without playing', () => {
    const media = loopMedia({ currentTime: 5, duration: 30, paused: true });
    const overlay = controlledLoop(media.video);
    media.setCurrentTime(1);
    loopMarkButton(overlay, 'a').click();
    media.setCurrentTime(3);
    loopMarkButton(overlay, 'b').click();
    media.setCurrentTime(5);
    loopToggle(overlay).click();
    expect(media.video.currentTime).toBe(1);
    expect(media.play).not.toHaveBeenCalled();
    expect(media.video.loop).toBe(false);
  });

  it('wraps from timeupdate when no animation frame is running', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const media = loopMedia({ currentTime: 2, duration: 30, paused: false });
    const overlay = controlledLoop(media.video);
    media.setCurrentTime(1);
    loopMarkButton(overlay, 'a').click();
    media.setCurrentTime(3);
    loopMarkButton(overlay, 'b').click();
    media.setCurrentTime(2);
    loopToggle(overlay).click();
    media.setCurrentTime(5);
    media.video.dispatchEvent(new Event('timeupdate'));
    expect(media.video.currentTime).toBe(1);
    expect(media.play).not.toHaveBeenCalled();
  });

  it('schedules one animation frame and cancels it on pause', () => {
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    const cancelFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const media = loopMedia({ currentTime: 2, duration: 30, paused: false });
    const overlay = controlledLoop(media.video);
    media.setCurrentTime(1);
    loopMarkButton(overlay, 'a').click();
    media.setCurrentTime(4);
    loopMarkButton(overlay, 'b').click();
    media.setCurrentTime(2);
    loopToggle(overlay).click();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    media.video.dispatchEvent(new Event('play'));
    expect(requestFrame).toHaveBeenCalledTimes(1);
    frames[0]?.(0);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    media.setPaused(true);
    media.video.dispatchEvent(new Event('pause'));
    expect(cancelFrame).toHaveBeenCalled();
    media.setPaused(false);
    media.video.dispatchEvent(new Event('play'));
    expect(requestFrame).toHaveBeenCalledTimes(3);
  });

  it('restarts at the span start when playback ends', () => {
    const media = loopMedia({ currentTime: 2, duration: 10, paused: true });
    const overlay = controlledLoop(media.video);
    media.setCurrentTime(1);
    loopMarkButton(overlay, 'a').click();
    loopToggle(overlay).click();
    media.setCurrentTime(10);
    media.video.dispatchEvent(new Event('ended'));
    expect(media.video.currentTime).toBe(1);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('does not restart playback when ended fires during native loop', () => {
    const media = loopMedia({ duration: 10, paused: true });
    const overlay = controlledLoop(media.video);
    loopToggle(overlay).click();
    expect(media.video.loop).toBe(true);
    media.video.dispatchEvent(new Event('ended'));
    expect(media.play).not.toHaveBeenCalled();
  });

  it('follows a moved DVR window without rewriting the stored mark', () => {
    const media = loopMedia({
      currentTime: 12,
      duration: 40,
      seekable: { start: 0, end: 30 },
    });
    const overlay = controlledLoop(media.video);
    loopMarkButton(overlay, 'a').click();
    media.setCurrentTime(20);
    loopMarkButton(overlay, 'b').click();
    media.setCurrentTime(25);
    loopToggle(overlay).click();
    expect(media.video.currentTime).toBe(12);
    media.setSeekable({ start: 18, end: 30 });
    media.setCurrentTime(25);
    media.video.dispatchEvent(new Event('timeupdate'));
    expect(media.video.currentTime).toBe(18);
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')?.textContent).toBe('0:12.0');
    expect(loopMarkButton(overlay, 'b').querySelector('.loop-badge')?.textContent).toBe('0:20.0');
  });

  it('cancels the animation frame when a DVR window leaves the marks, and starts it when the window returns', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const cancelFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const media = loopMedia({
      currentTime: 15,
      duration: 40,
      paused: false,
      seekable: { start: 0, end: 1 },
    });
    const overlay = controlledLoop(media.video);
    media.setCurrentTime(12);
    loopMarkButton(overlay, 'a').click();
    media.setCurrentTime(20);
    loopMarkButton(overlay, 'b').click();
    media.setCurrentTime(15);
    loopToggle(overlay).click();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(media.video.loop).toBe(false);
    media.setSeekable({ start: 0, end: 30 });
    media.video.dispatchEvent(new Event('timeupdate'));
    expect(requestFrame).toHaveBeenCalledTimes(1);
    media.setSeekable({ start: 0, end: 1 });
    media.video.dispatchEvent(new Event('timeupdate'));
    expect(cancelFrame).toHaveBeenCalled();
    expect(media.video.loop).toBe(false);
    expect(loopMarkButton(overlay, 'a').querySelector('.loop-badge')?.textContent).toBe('0:12.0');
  });

  it('keeps marks and the loop toggle separate for each video', () => {
    const first = loopMedia({ currentTime: 12, duration: 30 });
    const second = loopMedia({ currentTime: 3, duration: 30 });
    const firstOverlay = controlledLoop(first.video);
    const secondOverlay = controlledLoop(second.video);
    loopMarkButton(firstOverlay, 'a').click();
    loopToggle(firstOverlay).click();
    expect(loopMarkButton(firstOverlay, 'a').querySelector('.loop-badge')?.textContent).toBe(
      '0:12.0',
    );
    expect(loopToggle(firstOverlay).getAttribute('aria-pressed')).toBe('true');
    expect(loopMarkButton(secondOverlay, 'a').querySelector('.loop-badge')).toBeNull();
    expect(loopToggle(secondOverlay).getAttribute('aria-pressed')).toBe('false');
    expect(second.video.loop).toBe(false);
  });
});

function loopMedia(options?: {
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  loop?: boolean;
  seekable?: { start: number; end: number } | null;
}): {
  video: HTMLVideoElement;
  play: ReturnType<typeof vi.fn>;
  loopWrites: boolean[];
  setCurrentTime: (value: number) => void;
  setPaused: (value: boolean) => void;
  setSeekable: (range: { start: number; end: number } | null) => void;
} {
  const video = sizedVideo();
  let currentTime = options?.currentTime ?? 0;
  let paused = options?.paused ?? true;
  let loop = options?.loop ?? false;
  let seekable = options?.seekable ?? null;
  const loopWrites: boolean[] = [];
  const play = vi.fn(() => Promise.resolve());
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => options?.duration ?? 60,
  });
  Object.defineProperty(video, 'paused', {
    configurable: true,
    get: () => paused,
  });
  Object.defineProperty(video, 'loop', {
    configurable: true,
    get: () => loop,
    set: (value: boolean) => {
      loopWrites.push(value);
      loop = value;
    },
  });
  Object.defineProperty(video, 'seekable', {
    configurable: true,
    get: () =>
      seekable == null
        ? { length: 0, start: () => 0, end: () => 0 }
        : { length: 1, start: () => seekable?.start ?? 0, end: () => seekable?.end ?? 0 },
  });
  video.play = play as typeof video.play;
  return {
    video,
    play,
    loopWrites,
    setCurrentTime(value: number) {
      currentTime = value;
    },
    setPaused(value: boolean) {
      paused = value;
    },
    setSeekable(range: { start: number; end: number } | null) {
      seekable = range;
    },
  };
}

function controlledLoop(video: HTMLVideoElement): VideoOverlay {
  const overlay = new VideoOverlay(video, () => overlay.layout());
  overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayExtrasBar: true }));
  overlay.setControlled(true);
  return overlay;
}

function loopControlLabels(overlay: VideoOverlay): string[] {
  return [...(overlay.host.shadowRoot?.querySelectorAll('.controls-extras button') ?? [])].map(
    (button) => button.getAttribute('aria-label') ?? '',
  );
}

function loopMarkButton(overlay: VideoOverlay, mark: 'a' | 'b'): HTMLButtonElement {
  const button = overlay.host.shadowRoot?.querySelectorAll('.loop-mark')[mark === 'a' ? 0 : 1];
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing mark ${mark}`);
  }
  return button;
}

function loopClearButton(overlay: VideoOverlay, mark: 'a' | 'b'): HTMLButtonElement {
  const button = overlay.host.shadowRoot?.querySelectorAll('.loop-clear')[mark === 'a' ? 0 : 1];
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing clear ${mark}`);
  }
  return button;
}

function loopJumpButton(overlay: VideoOverlay, mark: 'a' | 'b'): HTMLButtonElement {
  const button = overlay.host.shadowRoot?.querySelectorAll('.loop-jump')[mark === 'a' ? 0 : 1];
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing jump ${mark}`);
  }
  return button;
}

function loopToggle(overlay: VideoOverlay): HTMLButtonElement {
  const button = overlay.host.shadowRoot?.querySelector('.loop-toggle');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Missing loop toggle');
  }
  return button;
}

function timelineVideo(options: {
  currentTime?: number;
  duration?: number;
  buffered?: Array<{ start: number; end: number }>;
}): HTMLVideoElement {
  const video = sizedVideo();
  let currentTime = options.currentTime ?? 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => options.duration ?? Number.NaN,
  });
  const buffered = options.buffered ?? [];
  Object.defineProperty(video, 'buffered', {
    configurable: true,
    get: () => ({
      length: buffered.length,
      start: (index: number) => buffered[index]?.start ?? 0,
      end: (index: number) => buffered[index]?.end ?? 0,
    }),
  });
  return video;
}

function rowClasses(overlay: VideoOverlay): string[] {
  const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
  return [...(shell?.children ?? [])].map((node) => node.className);
}

function seekRange(overlay: VideoOverlay): HTMLInputElement {
  return overlay.host.shadowRoot?.querySelector('.seek-range') as HTMLInputElement;
}

function seekReadout(overlay: VideoOverlay): string {
  return overlay.host.shadowRoot?.querySelector('.seek-readout')?.textContent ?? '';
}

function seekReserves(overlay: VideoOverlay): string[] {
  return [...(overlay.host.shadowRoot?.querySelectorAll('.seek-time') ?? [])].map(
    (slot) => slot.getAttribute('data-reserve') ?? '',
  );
}

function volumeBar(overlay: VideoOverlay): HTMLElement {
  return overlay.host.shadowRoot?.querySelector('.controls-volume') as HTMLElement;
}

function volumeRange(overlay: VideoOverlay): HTMLInputElement {
  return overlay.host.shadowRoot?.querySelector('.volume-range') as HTMLInputElement;
}

function volumeMute(overlay: VideoOverlay): HTMLButtonElement {
  return overlay.host.shadowRoot?.querySelector('.volume-mute') as HTMLButtonElement;
}

function countCaptureListeners(type: string): () => number {
  let calls = 0;
  const original = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((event, listener, options) => {
    const capture =
      typeof options === 'object' &&
      options !== null &&
      'capture' in options &&
      options.capture === true;
    if (event === type && capture && typeof listener === 'function') {
      const wrapped: EventListener = (evt) => {
        calls += 1;
        listener.call(document, evt);
      };
      original(event, wrapped, options);
      return;
    }
    original(event, listener as EventListener, options);
  });
  return () => calls;
}
