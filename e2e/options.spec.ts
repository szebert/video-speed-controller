// SPDX-License-Identifier: GPL-3.0-only

import type { Page } from '@playwright/test';
import {
  clickOptionsSwitch,
  confirmAlertDialog,
  expect,
  openOptions,
  openPopup,
  pointPopupAtSite,
  test,
} from './extension';

test.describe.configure({ mode: 'serial' });

async function overlayBadgeTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('osvsc-overlay')].map(
      (host) => host.shadowRoot?.querySelector('.speed')?.textContent ?? '',
    ),
  );
}

async function overlayTransform(page: Page): Promise<string> {
  return page
    .locator('osvsc-overlay')
    .first()
    .evaluate((host) => (host as HTMLElement).style.transform);
}

async function overlayVisibility(page: Page): Promise<string> {
  return page
    .locator('osvsc-overlay')
    .first()
    .evaluate((host) => (host as HTMLElement).style.visibility);
}

async function enableSiteAt(popup: Page, site: Page, speed: number): Promise<void> {
  await expect(popup.getByRole('switch', { name: 'Enabled on this site' })).toBeChecked();
  const clicks = Math.round((speed - 1) / 0.25);
  for (let i = 0; i < clicks; i += 1) {
    await popup.getByRole('button', { name: 'Faster' }).click();
  }
  await expect(popup.getByText(`${speed.toFixed(2)}×`)).toBeVisible();
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
}

test('options.html shows Global defaults', async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await expect(options).toHaveTitle('Settings');
  await expect(options.getByRole('heading', { name: 'Global defaults' })).toBeVisible();
  await expect(
    options.getByRole('button', { name: 'Global defaults', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(options.getByText('Sites use these values until you change them.')).toBeVisible();
  await expect(options.getByText('No site settings yet.')).toBeVisible();
  await expect(options.getByText('Built-in')).toHaveCount(0);
  await expect(options.getByRole('tab')).toHaveCount(0);
  await expect(options.getByRole('button', { name: 'Reset defaults' })).toBeEnabled();
  await expect(options.getByRole('switch', { name: 'Prevent auto-hide on hover' })).toBeEnabled();
  await expect(options.getByRole('button', { name: 'Reset ALL Settings' })).toHaveCount(0);

  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(options.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Reset ALL Settings' })).toBeVisible();
  await expect(options.getByText('Restore settings to defaults')).toBeVisible();
});

test('options.html?site=127.0.0.1 selects Site', async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await expect(options.getByRole('heading', { name: '127.0.0.1' })).toBeVisible();
  await expect(
    options.getByRole('button', { name: 'Global defaults', exact: true }),
  ).not.toHaveAttribute('aria-current', 'page');
});

test('site position moves the overlay and keeps speed 1.25', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const before = await overlayTransform(site);
  expect(before).toContain('-50%');

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await options.getByText('Bottom right', { exact: true }).click();
  await expect.poll(async () => overlayTransform(site)).toBe('translate(-100%, -100%)');
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
});

test('site auto-hide off stays visible and deleting the site restores the timeout', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  await expect.poll(async () => overlayVisibility(site), { timeout: 5_000 }).toBe('hidden');

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await expect(options.getByRole('switch', { name: 'Prevent auto-hide on hover' })).toBeEnabled();
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await expect(options.getByRole('switch', { name: 'Prevent auto-hide on hover' })).toBeDisabled();
  await site.locator('#v1').hover();
  await expect.poll(async () => overlayVisibility(site)).toBe('visible');
  await site.waitForTimeout(2500);
  await expect.poll(async () => overlayVisibility(site)).toBe('visible');

  await options.getByRole('button', { name: 'Delete site settings: 127.0.0.1' }).click();
  await confirmAlertDialog(options, 'Delete');
  await expect.poll(async () => overlayVisibility(site), { timeout: 5_000 }).toBe('hidden');
});

test('global position applies on a site with no position override', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await options.getByRole('button', { name: 'Global defaults', exact: true }).click();
  await options.getByText('Bottom left', { exact: true }).click();
  await expect.poll(async () => overlayTransform(site)).toMatch(/translate\(0(px)?, -100%\)/);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
});

test('global speed 1.5 does not jump an active 1.25 tab', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await options.getByRole('button', { name: 'Global defaults', exact: true }).click();
  await options.getByRole('button', { name: 'Faster' }).click();
  await options.getByRole('button', { name: 'Faster' }).click();
  await expect(options.getByText('1.50×')).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
  await pointPopupAtSite(serviceWorker, site);
  await popup.reload();
  await popup.getByRole('switch', { name: 'Enabled on this site' }).waitFor({ timeout: 10_000 });
  await expect(popup.getByText('1.25×')).toBeVisible();
});

test('site speed 1.5 updates videos overlay and popup, then delete restores 1.00', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await options.getByRole('button', { name: 'Faster' }).click();
  await expect(options.getByText('1.50×')).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.50×', '1.50×', '1.50×']);
  await pointPopupAtSite(serviceWorker, site);
  await popup.reload();
  await popup.getByRole('switch', { name: 'Enabled on this site' }).waitFor({ timeout: 10_000 });
  await expect(popup.getByText('1.50×')).toBeVisible();

  await options.getByRole('button', { name: 'Delete site settings: 127.0.0.1' }).click();
  await confirmAlertDialog(options, 'Delete');
  await expect(options.getByText('1.00×', { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.00×', '1.00×', '1.00×']);
});

async function overlayButtonLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const host = document.querySelector('osvsc-overlay');
    return [...(host?.shadowRoot?.querySelectorAll('button') ?? [])].map(
      (button) => button.getAttribute('aria-label') ?? '',
    );
  });
}

test('hiding overlay chrome buttons removes them from the badge', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  await site.locator('#v1').hover();
  await expect
    .poll(async () => overlayButtonLabels(site))
    .toEqual(['Move overlay', 'Slower', 'Faster', 'Open settings']);

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await clickOptionsSwitch(options, 'Show position button');
  await clickOptionsSwitch(options, 'Show settings button');
  await site.locator('#v1').hover();
  await expect.poll(async () => overlayButtonLabels(site)).toEqual(['Slower', 'Faster']);
});

test('hiding the options page flushes a trailing speed change', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const options = await openOptions(context, extensionId);
  await options.getByRole('button', { name: 'Faster' }).click();
  await options.getByRole('button', { name: 'Faster' }).click();
  await expect(options.getByText('1.50×')).toBeVisible();
  await options.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async () => {
        const key = 'defaults:site-behavior';
        const [local, sync] = await Promise.all([
          chrome.storage.local.get(key),
          chrome.storage.sync.get(key),
        ]);
        const record = (sync[key] ?? local[key]) as
          | { overrides?: { speed?: { value?: number } } }
          | undefined;
        return record?.overrides?.speed?.value ?? null;
      }),
    )
    .toBe(1.5);
  await options.close();
  const reopened = await openOptions(context, extensionId);
  await expect(reopened.getByText('1.50×')).toBeVisible();
});

test('hiding the overlay keeps videos playing at the current speed', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await clickOptionsSwitch(options, 'Show overlay');
  await expect.poll(async () => overlayVisibility(site)).toBe('hidden');
  await site.locator('#v1').hover();
  await expect.poll(async () => overlayVisibility(site)).toBe('hidden');
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
});
