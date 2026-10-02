// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SPEED_POLICY, SPEED_MIN_SETTING_MIN } from '../core/speed';
import { speedControls } from '../ui/speed-controls';

describe('SpeedControls preview vs persist', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 10,
      right: 100,
      width: 100,
      height: 10,
      toJSON() {
        return this;
      },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('previews slider movement without committing until change end', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    container.append(
      speedControls({
        displaySpeed: 1,
        disabled: false,
        onAdjust: () => undefined,
        onReset: () => undefined,
        onPreviewSlider: onPreview,
        onCommitSlider: onCommit,
      }),
    );
    const slider =
      container.querySelector('[role="slider"]') ??
      container.querySelector('[data-slot="slider-thumb"]');
    expect(slider).toBeTruthy();
    slider?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(onPreview).toHaveBeenCalledWith(1.01);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1.01);
  });

  it('reaches policy max when min is the playbackRate floor', () => {
    const onCommit = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    container.append(
      speedControls({
        displaySpeed: 3.99,
        disabled: false,
        policy: { ...DEFAULT_SPEED_POLICY, min: SPEED_MIN_SETTING_MIN, max: 4 },
        onAdjust: () => undefined,
        onReset: () => undefined,
        onCommitSlider: onCommit,
      }),
    );
    const slider =
      container.querySelector('[role="slider"]') ??
      container.querySelector('[data-slot="slider-thumb"]');
    expect(slider).toBeTruthy();
    slider?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(onCommit).toHaveBeenCalledWith(4);
  });

  it('disables minus and plus at the policy bounds', () => {
    const container = document.createElement('div');
    document.body.append(container);
    container.append(
      speedControls({
        displaySpeed: 0.25,
        disabled: false,
        policy: DEFAULT_SPEED_POLICY,
        onAdjust: () => undefined,
        onReset: () => undefined,
        onCommitSlider: () => undefined,
      }),
    );
    const slower = container.querySelector('[aria-label="Slower"]');
    const faster = container.querySelector('[aria-label="Faster"]');
    expect(slower).toBeInstanceOf(HTMLButtonElement);
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    expect(slower?.querySelector('svg')).not.toBeNull();
    expect(faster?.querySelector('svg')).not.toBeNull();
    expect((slower as HTMLButtonElement).disabled).toBe(true);
    expect((faster as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the slider and both ticks when min and max are 1×', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    container.append(
      speedControls({
        displaySpeed: 1,
        disabled: false,
        policy: { ...DEFAULT_SPEED_POLICY, min: 1, max: 1 },
        onAdjust: () => undefined,
        onReset: () => undefined,
        onPreviewSlider: onPreview,
        onCommitSlider: onCommit,
      }),
    );
    const group = container.querySelector('[data-slot="slider"]');
    const thumb = container.querySelector('[data-slot="slider-thumb"]');
    const slower = container.querySelector('[aria-label="Slower"]');
    const faster = container.querySelector('[aria-label="Faster"]');
    expect(container.querySelector('[role="slider"]')).toBeNull();
    expect(container.querySelector('[aria-valuemax]')).toBeNull();
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    expect(group?.getAttribute('data-disabled')).toBe('true');
    expect(thumb).toBeInstanceOf(HTMLElement);
    expect((slower as HTMLButtonElement).disabled).toBe(true);
    expect((faster as HTMLButtonElement).disabled).toBe(true);
    thumb?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range readout and disables ticks when the policy is fixed', () => {
    const container = document.createElement('div');
    document.body.append(container);
    container.append(
      speedControls({
        displaySpeed: 2.25,
        disabled: false,
        policy: { ...DEFAULT_SPEED_POLICY, min: 1, max: 1 },
        onAdjust: () => undefined,
        onReset: () => undefined,
        onCommitSlider: () => undefined,
      }),
    );
    expect(container.textContent).toContain('1.00×');
    expect(container.textContent).not.toContain('2.25×');
    const slower = container.querySelector('[aria-label="Slower"]');
    const faster = container.querySelector('[aria-label="Faster"]');
    expect((slower as HTMLButtonElement).disabled).toBe(true);
    expect((faster as HTMLButtonElement).disabled).toBe(true);
  });
});
