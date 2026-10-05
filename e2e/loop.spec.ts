// SPDX-License-Identifier: GPL-3.0-only

import {
  clickOptionsSwitch,
  expect,
  fixtureOrigin,
  openOptions,
  openPopup,
  selectOptionsTab,
  test,
} from './extension';

test('loop bar marks, jumps, and wraps A/B playback through timeupdate and animation frames', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/rewind.html`);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(async () => site.locator('osvsc-overlay').count()).toBe(1);

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Show extras bar');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await site.bringToFront();

  const overlay = site.locator('osvsc-overlay').first();
  await site.locator('#v1').hover();
  await expect(overlay.locator('.controls-loop')).toBeVisible();

  await expect
    .poll(async () =>
      site
        .locator('#v1')
        .evaluate((video) => Number.isFinite((video as HTMLVideoElement).duration)),
    )
    .toBe(true);

  const duration = await site
    .locator('#v1')
    .evaluate((video) => (video as HTMLVideoElement).duration);
  const markA = duration * 0.2;
  const markB = duration * 0.5;

  const seekTo = async (seconds: number): Promise<void> => {
    await site.locator('#v1').evaluate((node, target) => {
      const video = node as HTMLVideoElement;
      video.pause();
      if (Math.abs(video.currentTime - target) < 0.01) {
        return undefined;
      }
      return new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        video.currentTime = target;
      });
    }, seconds);
  };

  await seekTo(markA);
  await overlay.getByRole('button', { name: 'Mark A', exact: true }).click();
  const firstBadge = overlay.locator('.loop-mark').first().locator('.loop-badge');
  await expect(firstBadge).toBeVisible();
  const firstText = await firstBadge.textContent();

  await seekTo(markB);
  await overlay.getByRole('button', { name: /^Mark A,/ }).click();
  await expect(firstBadge).not.toHaveText(firstText ?? '');

  await overlay.getByRole('button', { name: 'Clear mark A', exact: true }).click();
  await expect(firstBadge).toHaveCount(0);

  await seekTo(markA);
  await overlay.getByRole('button', { name: 'Mark A', exact: true }).click();
  await seekTo(markB);
  await overlay.getByRole('button', { name: 'Jump to A', exact: true }).click();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(markA, 1);

  await overlay.getByRole('button', { name: 'Clear mark A', exact: true }).click();
  await overlay.getByRole('button', { name: 'Loop', exact: true }).click();
  await expect
    .poll(async () => site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).loop))
    .toBe(true);

  await seekTo(markA);
  await overlay.getByRole('button', { name: 'Mark A', exact: true }).click();
  await seekTo(markB);
  await overlay.getByRole('button', { name: 'Mark B', exact: true }).click();
  await expect
    .poll(async () => site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).loop))
    .toBe(false);

  await site.locator('#v1').evaluate((node, seconds) => {
    const video = node as HTMLVideoElement;
    video.pause();
    const fire = (): void => {
      video.dispatchEvent(new Event('timeupdate'));
    };
    if (video.currentTime >= seconds - 0.05) {
      fire();
      return undefined;
    }
    return new Promise<void>((resolve) => {
      video.addEventListener(
        'seeked',
        () => {
          fire();
          resolve();
        },
        { once: true },
      );
      video.currentTime = seconds;
    });
  }, duration * 0.8);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(markA, 1);

  const frameState = await site.locator('#v1').evaluate(async (node, beyondB) => {
    const video = node as HTMLVideoElement;
    // Keep the event fallback from masking a broken production RAF loop.
    const suppressTimeUpdate = (event: Event): void => event.stopImmediatePropagation();
    video.addEventListener('timeupdate', suppressTimeUpdate, { capture: true });
    try {
      await video.play();
      video.currentTime = beyondB;
      const beforeFrame = video.currentTime;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return { beforeFrame, currentTime: video.currentTime, paused: video.paused };
    } finally {
      video.pause();
      video.removeEventListener('timeupdate', suppressTimeUpdate, { capture: true });
    }
  }, duration * 0.8);
  expect(frameState.beforeFrame).toBeGreaterThan(markB);
  expect(frameState.paused).toBe(false);
  expect(frameState.currentTime).toBeGreaterThanOrEqual(markA - 0.01);
  expect(frameState.currentTime).toBeLessThan(markA + 0.25);
});
