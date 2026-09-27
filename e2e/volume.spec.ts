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

test('volume bar drags the level and mute toggles', async ({
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
  await clickOptionsSwitch(options, 'Show volume bar');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await site.bringToFront();

  const overlay = site.locator('osvsc-overlay').first();
  await site.locator('#v1').evaluate((node) => {
    const video = node as HTMLVideoElement;
    video.muted = false;
    video.volume = 1;
  });
  await site.locator('#v1').hover();
  await expect(overlay.locator('.controls-volume')).toBeVisible();
  await expect(overlay.locator('.volume-mute')).toHaveAttribute('aria-label', 'Mute');

  const range = overlay.locator('.volume-range');
  const box = await range.boundingBox();
  if (!box) {
    throw new Error('Missing volume range bounds');
  }
  const y = box.y + box.height / 2;
  await site.mouse.move(box.x + box.width * 0.2, y);
  await site.mouse.down();
  await site.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
  await site.mouse.up();

  await expect
    .poll(async () => site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).volume))
    .toBeGreaterThan(0.5);

  await overlay.locator('.volume-mute').click();
  await expect
    .poll(async () => site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).muted))
    .toBe(true);
  await expect(overlay.locator('.volume-mute')).toHaveAttribute('aria-label', 'Unmute');
});
