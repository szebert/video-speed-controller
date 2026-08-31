// SPDX-License-Identifier: GPL-3.0-only

import type { Page } from '@playwright/test';
import { expect, fixtureOrigin, openPopup, pointPopupAtSite, test } from './extension';

test.describe.configure({ mode: 'serial' });

async function overlayBadgeTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('osvsc-overlay')].map(
      (host) => host.shadowRoot?.querySelector('[aria-live]')?.textContent ?? '',
    ),
  );
}

async function clickOverlayControl(page: Page, label: 'Faster' | 'Slower'): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate((name) => {
        for (const host of document.querySelectorAll('osvsc-overlay')) {
          if (host.shadowRoot?.querySelector(`[aria-label="${name}"]`) instanceof HTMLElement) {
            return true;
          }
        }
        return false;
      }, label),
    )
    .toBe(true);
  await page.evaluate((name) => {
    for (const host of document.querySelectorAll('osvsc-overlay')) {
      const button = host.shadowRoot?.querySelector(`[aria-label="${name}"]`);
      if (button instanceof HTMLElement) {
        button.click();
        return;
      }
    }
    throw new Error(`Missing ${name} overlay control`);
  }, label);
}

async function clickOverlayFaster(page: Page): Promise<void> {
  await clickOverlayControl(page, 'Faster');
}

async function clickOverlaySlower(page: Page): Promise<void> {
  await clickOverlayControl(page, 'Slower');
}

test('Enable is available on the fixture site and Faster applies to every video', async ({
  site,
  openExtensionPopup,
}) => {
  const popup = await openExtensionPopup();

  await expect(popup.getByRole('heading', { name: 'OS Video Speed Controller' })).toBeVisible();
  await expect(popup.getByText('127.0.0.1')).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Site speed' })).toBeVisible();
  await expect(popup.getByText('Changes apply to this site')).toBeVisible();
  const enable = popup.getByRole('switch', { name: 'Enabled on this site' });
  await expect(enable).toBeEnabled();
  await expect(enable).toBeChecked();

  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(popup.getByText('1.25×')).toBeVisible();
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);

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

  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect(popup.getByText('1.00×')).toBeVisible();
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.00×', '1.00×', '1.00×']);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);

  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(popup.getByText('1.25×')).toBeVisible();

  await site.getByRole('button', { name: 'Add fourth' }).click();
  await expect
    .poll(async () =>
      site.locator('#v4').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect
    .poll(async () => overlayBadgeTexts(site))
    .toEqual(['1.25×', '1.25×', '1.25×', '1.25×']);
});

test('reconcile teardown restores the captured baseline and removes overlays', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/restore-baseline.html`);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  const tabId = await serviceWorker.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    if (tab?.id == null) {
      throw new Error('Could not resolve the restore-baseline tab');
    }
    return tab.id;
  }, site.url());

  const response = await popup.evaluate(
    async ({ tabId: id, url }) =>
      chrome.runtime.sendMessage({ type: 'SET_SPEED', tabId: id, url, speed: 3 }),
    { tabId, url: site.url() },
  );
  expect(response).toEqual({ ok: true, targetSpeed: 3 });

  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(3);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['3.00×']);

  await serviceWorker.evaluate(async (id) => {
    try {
      await chrome.tabs.sendMessage(id, {
        type: 'RECONCILE_ACCESS',
        allowedHostPatterns: [],
      });
    } catch {
      // Content acknowledges by tearing down rather than sending a response.
    }
  }, tabId);

  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual([]);
});

async function applyOverlayEngine(popup: Page, site: Page): Promise<void> {
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.00×', '1.00×', '1.00×']);
}

test('overlay plus and minus update every video and the popup', async ({
  site,
  openExtensionPopup,
}) => {
  const popup = await openExtensionPopup();
  await applyOverlayEngine(popup, site);
  await clickOverlayFaster(site);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
  await popup.reload();
  await expect(popup.getByText('1.25×')).toBeVisible();
  await clickOverlaySlower(site);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.00×', '1.00×', '1.00×']);
  await popup.reload();
  await expect(popup.getByText('1.00×')).toBeVisible();
});

test('rapid overlay plus clicks accumulate', async ({ site, openExtensionPopup }) => {
  const popup = await openExtensionPopup();
  await applyOverlayEngine(popup, site);
  await expect
    .poll(async () =>
      site.evaluate(() =>
        [...document.querySelectorAll('osvsc-overlay')].some(
          (host) => host.shadowRoot?.querySelector('[aria-label="Faster"]') instanceof HTMLElement,
        ),
      ),
    )
    .toBe(true);
  await site.evaluate(() => {
    for (const host of document.querySelectorAll('osvsc-overlay')) {
      const button = host.shadowRoot?.querySelector('[aria-label="Faster"]');
      if (button instanceof HTMLElement) {
        button.click();
        button.click();
        return;
      }
    }
    throw new Error('Missing Faster overlay control');
  });
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.50×', '1.50×', '1.50×']);
});

test('overlay auto-hides and returns when the pointer moves over a video', async ({
  site,
  openExtensionPopup,
}) => {
  const popup = await openExtensionPopup();
  await applyOverlayEngine(popup, site);
  await clickOverlayFaster(site);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
  await expect
    .poll(async () =>
      site
        .locator('osvsc-overlay')
        .first()
        .evaluate((host) => (host as HTMLElement).style.visibility),
    )
    .toBe('visible');
  await expect
    .poll(
      async () =>
        site
          .locator('osvsc-overlay')
          .first()
          .evaluate((host) => (host as HTMLElement).style.visibility),
      { timeout: 5_000 },
    )
    .toBe('hidden');
  await site.locator('#v1').hover();
  await expect
    .poll(async () =>
      site
        .locator('osvsc-overlay')
        .first()
        .evaluate((host) => (host as HTMLElement).style.visibility),
    )
    .toBe('visible');
});

test('slider keyboard changes site speed', async ({ site, openExtensionPopup }) => {
  const popup = await openExtensionPopup();
  const slider = popup.getByRole('slider', { name: 'Site speed' });
  await expect(slider).toBeEnabled();
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(popup.getByText('1.05×')).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.05);

  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect(popup.getByText('1.00×')).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);
});

test('Reset wins when clicked immediately after Faster', async ({ site, openExtensionPopup }) => {
  const popup = await openExtensionPopup();
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect(popup.getByText('1.00×')).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);
});

test('theme toggle switches the popup color scheme', async ({ site, openExtensionPopup }) => {
  const popup = await openExtensionPopup();
  await expect(popup.locator('html')).toHaveClass(/dark/);
  await popup.getByRole('button', { name: 'Change theme' }).click();
  await popup.getByRole('menuitemradio', { name: 'Light' }).click();
  await expect(popup.locator('html')).toHaveClass(/light/);
  await expect(popup.locator('html')).not.toHaveClass(/dark/);

  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(popup.getByText('1.25×')).toBeVisible();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect(popup.getByText('1.00×')).toBeVisible();
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);
});

test('unsupported pages keep Enable disabled', async ({ context, extensionId, serviceWorker }) => {
  const page = await context.newPage();
  await page.goto('chrome://version/');
  await pointPopupAtSite(serviceWorker, page);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByText('OS VSC isn’t available on this page')).toBeVisible();
  await expect(popup.getByRole('switch', { name: 'Enabled on this site' })).toBeDisabled();
  await expect(popup.getByRole('button', { name: 'Faster' })).toBeDisabled();
  await expect(popup.getByText('1.00×')).toBeVisible();
  await expect(popup.getByText('Disabled')).toHaveCount(0);
});
