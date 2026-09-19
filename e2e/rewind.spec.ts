// SPDX-License-Identifier: GPL-3.0-only

import type { Page } from '@playwright/test';
import {
  clickOptionsSwitch,
  expect,
  fixtureOrigin,
  openOptions,
  openPopup,
  selectOptionsTab,
  test,
} from './extension';

test.describe.configure({ mode: 'serial' });

async function videoState(page: Page): Promise<{ currentTime: number; paused: boolean }> {
  return page.locator('#v1').evaluate((node) => {
    const video = node as HTMLVideoElement;
    return { currentTime: video.currentTime, paused: video.paused };
  });
}

async function holdOverlayRewind(page: Page, ms: number): Promise<void> {
  await page.locator('#v1').hover();
  const control = page.locator('osvsc-overlay').first().getByRole('button', { name: 'Rewind' });
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  if (!box) {
    throw new Error('Missing Rewind overlay control bounds');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await expect
    .poll(() =>
      control.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const root = button.getRootNode() as ShadowRoot;
        const hit = root.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === button || (hit instanceof Node && button.contains(hit));
      }),
    )
    .toBe(true);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('overlay rewind seeks backward and restores play/pause', async ({
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
  await clickOptionsSwitch(options, 'Show navigation bar');
  await clickOptionsSwitch(options, 'Auto-hide overlay');

  await expect
    .poll(async () =>
      site
        .locator('#v1')
        .evaluate((video) => Number.isFinite((video as HTMLVideoElement).duration)),
    )
    .toBe(true);

  await site.locator('#v1').evaluate((node) => {
    const video = node as HTMLVideoElement;
    video.currentTime = 5;
  });
  await site.locator('#v1').evaluate((node) => (node as HTMLVideoElement).play());
  await expect.poll(async () => (await videoState(site)).paused).toBe(false);
  await expect.poll(async () => (await videoState(site)).currentTime).toBeGreaterThan(4);

  const playingBefore = (await videoState(site)).currentTime;
  await holdOverlayRewind(site, 1200);
  const playingAfter = await videoState(site);
  expect(playingAfter.currentTime).toBeLessThan(playingBefore - 0.3);
  expect(playingAfter.currentTime).toBeGreaterThan(playingBefore - 3);
  expect(playingAfter.paused).toBe(false);

  await site.locator('#v1').evaluate((node) => {
    const video = node as HTMLVideoElement;
    video.pause();
    video.currentTime = 5;
  });
  await expect.poll(async () => (await videoState(site)).paused).toBe(true);
  const pausedBefore = (await videoState(site)).currentTime;
  await holdOverlayRewind(site, 1200);
  const pausedAfter = await videoState(site);
  expect(pausedAfter.currentTime).toBeLessThan(pausedBefore - 0.3);
  expect(pausedAfter.paused).toBe(true);
});
