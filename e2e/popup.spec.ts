// SPDX-License-Identifier: GPL-3.0-only

import { expect, pointPopupAtSite, test } from './extension';

test.describe.configure({ mode: 'serial' });

test('Enable is available on the fixture site and Faster applies to every video', async ({
  site,
  openExtensionPopup,
}) => {
  const popup = await openExtensionPopup();

  await expect(popup.getByRole('heading', { name: 'OS Video Speed Controller' })).toBeVisible();
  const enable = popup.getByRole('checkbox', { name: 'Enabled on this site' });
  await expect(enable).toBeEnabled();
  await expect(enable).toBeChecked();

  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(popup.locator('.speed-readout')).toHaveText('1.25×');

  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect
    .poll(async () =>
      site.locator('#v2').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect
    .poll(async () =>
      site.locator('#v3').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);

  await site.getByRole('button', { name: 'Add fourth' }).click();
  await expect
    .poll(async () =>
      site.locator('#v4').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
});

test('unsupported pages keep Enable disabled', async ({ context, extensionId, serviceWorker }) => {
  const page = await context.newPage();
  await page.goto('chrome://version/');
  await pointPopupAtSite(serviceWorker, page);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByText('OS VSC isn’t available on this page')).toBeVisible();
  await expect(popup.getByRole('checkbox', { name: 'Enabled on this site' })).toBeDisabled();
  await expect(popup.getByRole('button', { name: 'Faster' })).toBeDisabled();
  await expect(popup.locator('.speed-readout')).toHaveText('1.00×');
  await expect(popup.locator('.speed-badge')).toHaveCount(0);
});
