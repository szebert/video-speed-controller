// SPDX-License-Identifier: GPL-3.0-only

import type { BrowserContext, Page } from '@playwright/test';
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

async function enableSeekOverlay(
  site: Page,
  extensionId: string,
  context: BrowserContext,
): Promise<void> {
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Show seek bar');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await site.bringToFront();
}

async function setOptionsSwitch(options: Page, name: string, checked: boolean): Promise<void> {
  const control = options.getByRole('switch', { name });
  if ((await control.isChecked()) === checked) {
    return;
  }
  await clickOptionsSwitch(options, name);
}

test('seek bar stays off until enabled and can scrub currentTime', async ({
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
  await expect(site.locator('osvsc-overlay').first().locator('.controls-seek')).toHaveCount(0);

  await enableSeekOverlay(site, extensionId, context);
  const overlay = site.locator('osvsc-overlay').first();
  await expect(overlay.locator('.controls-seek')).toBeVisible();
  await expect.poll(async () => overlay.locator('.controls').count()).toBe(2);

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Show navigation bar');
  await site.bringToFront();
  await expect
    .poll(async () =>
      overlay.evaluate((host) => {
        const root = host.shadowRoot;
        return [...(root?.querySelector('.controls-shell')?.children ?? [])].map(
          (node) => node.className,
        );
      }),
    )
    .toEqual(['controls', 'controls controls-nav', 'controls controls-seek']);

  await expect
    .poll(async () =>
      site
        .locator('#v1')
        .evaluate((video) => Number.isFinite((video as HTMLVideoElement).duration)),
    )
    .toBe(true);

  await site.locator('#v1').evaluate((node) => {
    const video = node as HTMLVideoElement;
    video.pause();
    video.currentTime = 1;
  });

  await overlay.locator('.seek-range').evaluate((node) => {
    const range = node as HTMLInputElement;
    range.value = '4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(3);
  await expect(overlay.locator('.seek-readout')).toContainText('/');
  await expect(overlay.locator('.seek-track')).toBeVisible();
  await expect(overlay.locator('.seek-buffered').first()).toBeVisible();
});

test('pointer drag commits after release away from the range', async ({
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

  const overlay = site.locator('osvsc-overlay').first();
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await setOptionsSwitch(options, 'Show seek bar', true);
  await setOptionsSwitch(options, 'Auto-hide overlay', true);
  await expect(options.getByRole('switch', { name: 'Auto-hide overlay' })).toBeChecked();
  await site.bringToFront();
  await site.locator('#v1').hover();
  await expect(overlay.locator('.controls-seek')).toBeVisible();
  await expect
    .poll(async () =>
      site
        .locator('#v1')
        .evaluate((video) => Number.isFinite((video as HTMLVideoElement).duration)),
    )
    .toBe(true);

  await site.mouse.move(500, 400);
  await expect
    .poll(async () => overlay.evaluate((host) => (host as HTMLElement).style.visibility), {
      timeout: 5_000,
    })
    .toBe('hidden');

  await site.locator('#v1').evaluate((node) => {
    const video = node as HTMLVideoElement;
    video.pause();
    video.currentTime = 1;
  });
  await site.locator('#v1').hover();
  await expect(overlay).toHaveCSS('visibility', 'visible');

  const range = overlay.locator('.seek-range');
  const box = await range.boundingBox();
  if (!box) {
    throw new Error('Missing seek range bounds');
  }
  const y = box.y + box.height / 2;
  await site.mouse.move(box.x + box.width * 0.15, y);
  await site.mouse.down();
  await site.mouse.move(box.x + box.width * 0.75, y, { steps: 12 });
  await site.mouse.move(box.x + box.width * 0.75, box.y + box.height + 80, { steps: 4 });
  await site.mouse.up();

  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(3);
  await expect
    .poll(async () =>
      overlay.evaluate(
        (host) => host.shadowRoot?.activeElement?.classList.contains('seek-range') === true,
      ),
    )
    .toBe(false);

  // Leave the 320×180 fixture video so auto-hide can expire.
  await site.mouse.move(500, 400);
  await expect
    .poll(async () => overlay.evaluate((host) => (host as HTMLElement).style.visibility), {
      timeout: 5_000,
    })
    .toBe('hidden');
});
