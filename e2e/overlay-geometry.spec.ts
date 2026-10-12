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

// OVERLAY_INSET_PX in src/core/video-overlay.ts. Importing that runtime also
// loads WXT-only i18n modules, which are unavailable in the Playwright runner.
const OVERLAY_INSET_PX = 8;

async function geometry(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('video')!;
    const host = document.querySelector<HTMLElement>('osvsc-overlay')!;
    const rect = video.getBoundingClientRect();
    return {
      videoLeft: rect.left,
      videoTop: rect.top,
      videoWidth: rect.width,
      videoHeight: rect.height,
      hostLeft: Number.parseFloat(host.style.left),
      hostTop: Number.parseFloat(host.style.top),
    };
  });
}

test('follows a watched ancestor class change without pointer, scroll, or resize signals', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/overlay-geometry.html`);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(site.locator('osvsc-overlay .speed-value')).toHaveText('1.25×');
  await popup.close();
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await options.getByText('Top left', { exact: true }).click();
  // Wait for the position to reach the content script before closing the
  // settings page; a click alone does not await its asynchronous save.
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host: HTMLElement) => host.style.transform))
    .toMatch(/translate\(0(px)?, 0(px)?\)/);
  await options.close();
  await site.bringToFront();
  await expect(site.locator('osvsc-overlay')).toBeVisible();
  const alignment = async () => {
    const box = await geometry(site);
    return [box.hostLeft - box.videoLeft, box.hostTop - box.videoTop];
  };
  await expect.poll(alignment).toEqual([OVERLAY_INSET_PX, OVERLAY_INSET_PX]);
  // Let initial ResizeObserver delivery and its scheduled layout finish.
  await site.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const before = await geometry(site);
  await site.evaluate(() => document.getElementById('player')!.classList.add('shifted'));
  const moved = await geometry(site);
  expect(moved.videoLeft - before.videoLeft).toBe(120);
  expect(moved.videoTop - before.videoTop).toBe(70);
  expect([moved.videoWidth, moved.videoHeight]).toEqual([before.videoWidth, before.videoHeight]);
  await expect.poll(alignment).toEqual([OVERLAY_INSET_PX, OVERLAY_INSET_PX]);
});
