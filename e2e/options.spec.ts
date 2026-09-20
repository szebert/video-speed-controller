// SPDX-License-Identifier: GPL-3.0-only

import type { Page, Worker } from '@playwright/test';
import { OVERLAY_POSITION } from '../src/settings/site-behavior';
import {
  clickOptionsSwitch,
  confirmDialog,
  selectOptionsTab,
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
      (host) => host.shadowRoot?.querySelector('.speed-value')?.textContent ?? '',
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

async function appliedTabField<
  K extends 'hotkeyFlash' | 'flashDelayMs' | 'hotkeyRepeat' | 'overlayPosition',
>(serviceWorker: Worker, field: K): Promise<Array<boolean | number>> {
  return serviceWorker.evaluate(async (name) => {
    const items = await chrome.storage.session.get(null);
    const values: Array<boolean | number> = [];
    for (const [key, value] of Object.entries(items)) {
      if (!key.startsWith('tab:') || !value || typeof value !== 'object') {
        continue;
      }
      const current = (value as Record<string, unknown>)[name];
      if (typeof current === 'boolean' || typeof current === 'number') {
        values.push(current);
      }
    }
    return values;
  }, field);
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
  await expect(options.getByRole('heading', { name: 'OS Video Speed Controller' })).toBeVisible();
  await expect(options.locator('header img')).toBeVisible();
  await expect(options.getByRole('heading', { name: 'Global defaults' })).toBeVisible();
  await expect(
    options.getByRole('button', { name: 'Global defaults', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(options.getByText('Sites use these values until you change them.')).toBeVisible();
  await expect(options.getByText('No site settings yet.')).toBeVisible();
  await expect(options.getByText('Built-in')).toHaveCount(0);
  await expect(options.getByRole('tab', { name: 'Playback' })).toBeVisible();
  await expect(
    options.getByText('Customize current speed, default speed, and the allowed range.'),
  ).toBeVisible();
  await expect(options.getByRole('heading', { name: 'Current default speed' })).toBeVisible();
  await expect(options.getByRole('slider', { name: 'Current default speed' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Reset to 1.00×' })).toBeVisible();
  await expect(options.getByRole('slider', { name: 'Default speed', exact: true })).toBeVisible();
  await expect(
    options.getByRole('switch', { name: 'Use last used speed on new windows' }),
  ).toBeChecked();
  await expect(options.getByRole('button', { name: 'Reset defaults' })).toBeEnabled();
  await selectOptionsTab(options, 'Overlay');
  await expect(options.getByText('Customize how the overlay appears on videos.')).toBeVisible();
  await expect(options.getByRole('switch', { name: 'Prevent auto-hide on hover' })).toBeEnabled();
  await expect(options.getByRole('slider', { name: 'Opacity', exact: true })).toBeVisible();
  await expect(options.getByRole('slider', { name: 'Overlay size' })).toBeVisible();
  await expect(options.getByRole('slider', { name: 'Flash opacity' })).toBeVisible();
  await expect(options.getByRole('slider', { name: 'Flash size' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Reset ALL Settings' })).toHaveCount(0);

  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(options.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(options.getByRole('tab')).toHaveCount(0);
  await expect(
    options.locator('[data-slot="card-title"]').filter({ hasText: /^Enable on all sites$/ }),
  ).toBeVisible();
  await expect(options.getByRole('switch', { name: 'Enable on all sites' })).toBeVisible();
  await expect(options.getByText('Requires broader site access')).toBeVisible();
  await expect(options.getByRole('button', { name: 'Reset ALL Settings' })).toBeVisible();
  await expect(options.getByText('Restore settings to defaults')).toBeVisible();
  await expect(options.getByRole('button', { name: 'Export' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
  await expect(options.getByText('No file selected')).toBeVisible();
  await expect(options.getByRole('button', { name: 'Import (merge)' })).toBeDisabled();
  await expect(options.getByRole('button', { name: 'Import (replace)' })).toBeDisabled();
});

test('options.html?site=127.0.0.1 selects Site', async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await expect(options.getByRole('heading', { name: '127.0.0.1' })).toBeVisible();
  await expect(options.getByRole('heading', { name: 'Current site speed' })).toBeVisible();
  await expect(options.getByRole('slider', { name: 'Default speed', exact: true })).toBeVisible();
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
  await selectOptionsTab(options, 'Overlay');
  await options.getByText('Bottom right', { exact: true }).click();
  await expect.poll(async () => overlayTransform(site)).toBe('translate(-100%, -100%)');
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.25×', '1.25×', '1.25×']);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
});

test('300% bottom-right scale keeps the anchor and overflow hits', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await options.getByText('Bottom right', { exact: true }).click();
  await expect.poll(async () => overlayTransform(site)).toBe('translate(-100%, -100%)');
  await expect.poll(async () => overlayVisibility(site)).toBe('visible');

  await site.locator('#v1').evaluate((video) => {
    (video as HTMLElement).style.marginLeft = '400px';
  });
  await site.locator('#v1').hover();
  const baseline = await site.locator('#v1').evaluate((video) => {
    const rect = video.getBoundingClientRect();
    const host = [...document.querySelectorAll('osvsc-overlay')].find((candidate) => {
      const shell = candidate.shadowRoot?.querySelector('.controls-shell');
      if (!(shell instanceof HTMLElement)) {
        return false;
      }
      const box = shell.getBoundingClientRect();
      return (
        Math.abs(box.right - (rect.right - 8)) < 24 && Math.abs(box.bottom - (rect.bottom - 8)) < 24
      );
    });
    const shell = host?.shadowRoot?.querySelector('.controls-shell');
    const slower = host?.shadowRoot?.querySelector('[aria-label="Slower"]');
    if (
      !(host instanceof HTMLElement) ||
      !(shell instanceof HTMLElement) ||
      !(slower instanceof HTMLElement)
    ) {
      throw new Error('Missing #v1 overlay chrome');
    }
    const shellRect = shell.getBoundingClientRect();
    const slowerRect = slower.getBoundingClientRect();
    return {
      scale: host.style.getPropertyValue('--overlay-scale'),
      shell: {
        right: shellRect.right,
        bottom: shellRect.bottom,
        width: shellRect.width,
        height: shellRect.height,
      },
      slowerLeft: slowerRect.left,
    };
  });

  const sizeInput = options.locator(
    '[data-slot="slider"][aria-label="Overlay size"] input[type="range"]',
  );
  await sizeInput.fill('300');
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => {
        const rect = video.getBoundingClientRect();
        const host = [...document.querySelectorAll('osvsc-overlay')].find((candidate) => {
          const shell = candidate.shadowRoot?.querySelector('.controls-shell');
          if (!(shell instanceof HTMLElement)) {
            return false;
          }
          const box = shell.getBoundingClientRect();
          return (
            Math.abs(box.right - (rect.right - 8)) < 24 &&
            Math.abs(box.bottom - (rect.bottom - 8)) < 24
          );
        });
        return host instanceof HTMLElement ? host.style.getPropertyValue('--overlay-scale') : '';
      }),
    )
    .toBe('3');
  await expect.poll(async () => overlayTransform(site)).toBe('translate(-100%, -100%)');

  await site.locator('#v1').hover();
  const scaled = await site.locator('#v1').evaluate((video, slowerLeft) => {
    const rect = video.getBoundingClientRect();
    const host = [...document.querySelectorAll('osvsc-overlay')].find((candidate) => {
      const shell = candidate.shadowRoot?.querySelector('.controls-shell');
      if (!(shell instanceof HTMLElement)) {
        return false;
      }
      const box = shell.getBoundingClientRect();
      return (
        Math.abs(box.right - (rect.right - 8)) < 24 && Math.abs(box.bottom - (rect.bottom - 8)) < 24
      );
    });
    const shell = host?.shadowRoot?.querySelector('.controls-shell');
    const slower = host?.shadowRoot?.querySelector('[aria-label="Slower"]');
    if (
      !(host instanceof HTMLElement) ||
      !(shell instanceof HTMLElement) ||
      !(slower instanceof HTMLElement)
    ) {
      throw new Error('Missing #v1 overlay chrome');
    }
    const shellRect = shell.getBoundingClientRect();
    const slowerRect = slower.getBoundingClientRect();
    const overflowLeft = Math.max(slowerRect.left, 0);
    const overflowRight = Math.min(slowerRect.right, slowerLeft);
    if (overflowRight - overflowLeft < 2) {
      throw new Error('Scaled Slower overflow is not visible');
    }
    const point = {
      x: (overflowLeft + overflowRight) / 2,
      y: slowerRect.top + slowerRect.height / 2,
    };
    const root = slower.getRootNode() as ShadowRoot;
    const hit = root.elementFromPoint(point.x, point.y);
    const fromDocument = document.elementsFromPoint(point.x, point.y);
    return {
      shell: {
        right: shellRect.right,
        bottom: shellRect.bottom,
        width: shellRect.width,
        height: shellRect.height,
      },
      point,
      hitSlower: hit === slower || (hit instanceof Node && slower.contains(hit)),
      documentHitHost: fromDocument.some((node) => node === host),
    };
  }, baseline.slowerLeft);

  expect(scaled.shell.right).toBeCloseTo(baseline.shell.right, 0);
  expect(scaled.shell.bottom).toBeCloseTo(baseline.shell.bottom, 0);
  expect(scaled.shell.width).toBeGreaterThan(baseline.shell.width * 2.7);
  expect(scaled.shell.height).toBeGreaterThan(baseline.shell.height * 2.7);
  expect(scaled.point.x).toBeLessThan(baseline.slowerLeft);
  expect(scaled.hitSlower || scaled.documentHitHost).toBe(true);

  await site.mouse.click(scaled.point.x, scaled.point.y);
  await expect
    .poll(async () =>
      site.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1);
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
  await selectOptionsTab(options, 'Overlay');
  await expect(options.getByRole('switch', { name: 'Prevent auto-hide on hover' })).toBeEnabled();
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await expect(options.getByRole('switch', { name: 'Prevent auto-hide on hover' })).toBeDisabled();
  await site.locator('#v1').hover();
  await expect.poll(async () => overlayVisibility(site)).toBe('visible');
  await site.waitForTimeout(2500);
  await expect.poll(async () => overlayVisibility(site)).toBe('visible');

  await options.getByRole('button', { name: 'Delete site settings' }).click();
  await confirmDialog(options, 'Delete');
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
  await selectOptionsTab(options, 'Overlay');
  await options.getByText('Bottom left', { exact: true }).click();
  await expect
    .poll(async () => appliedTabField(serviceWorker, 'overlayPosition'))
    .toContain(OVERLAY_POSITION.BOTTOM_LEFT);
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
  await expect(options.getByRole('heading', { name: 'Current default speed' })).toBeVisible();
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

  await options.getByRole('button', { name: 'Delete site settings' }).click();
  await confirmDialog(options, 'Delete');
  await expect(options.getByText('1.00×', { exact: true }).first()).toBeVisible();
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
    .toEqual(['Move overlay', 'Slower', 'Reset to default speed', 'Faster', 'Open settings']);

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Show position button');
  await clickOptionsSwitch(options, 'Show settings button');
  await site.locator('#v1').hover();
  await expect
    .poll(async () => overlayButtonLabels(site))
    .toEqual(['Slower', 'Reset to default speed', 'Faster']);
});

async function overlayHotkeyHints(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('osvsc-overlay')].flatMap((host) =>
      [...(host.shadowRoot?.querySelectorAll('.hotkey-hint') ?? [])].map(
        (hint) => hint.textContent ?? '',
      ),
    ),
  );
}

test('hiding shortcut hints removes captions from the overlay', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  await site.locator('#v1').hover();
  await expect
    .poll(async () => overlayHotkeyHints(site))
    .toEqual(['[', '\\', ']', '[', '\\', ']', '[', '\\', ']']);

  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Show shortcut hints');
  await site.locator('#v1').hover();
  await expect.poll(async () => overlayHotkeyHints(site)).toEqual([]);
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
          { overrides?: { speed?: { value?: number } } } | undefined;
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
  await selectOptionsTab(options, 'Overlay');
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

async function hotkeyFlashCopy(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('osvsc-hotkey-flash')].map(
      (host) => host.shadowRoot?.querySelector('.hotkey-flash')?.textContent ?? '',
    ),
  );
}

async function pressIncreaseSpeedHotkey(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ']',
        code: 'BracketRight',
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  });
}

test('hotkey flash shows the new speed then hides', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  const delay = options.locator('#flash-delay');
  await delay.fill('1');
  await delay.press('Enter');
  await expect(delay).toHaveValue('1');
  await expect.poll(async () => appliedTabField(serviceWorker, 'flashDelayMs')).toContain(1000);
  await site.bringToFront();
  await expect.poll(async () => overlayVisibility(site), { timeout: 5_000 }).toBe('hidden');
  await pressIncreaseSpeedHotkey(site);
  await expect
    .poll(async () => hotkeyFlashCopy(site))
    .toEqual(['1.50× (+0.25×)]', '1.50× (+0.25×)]', '1.50× (+0.25×)]']);
  expect(await overlayVisibility(site)).toBe('hidden');
  await expect.poll(async () => hotkeyFlashCopy(site)).toEqual([]);

  await options.bringToFront();
  await clickOptionsSwitch(options, 'Show hotkey flash');
  await expect(options.getByRole('switch', { name: 'Show hotkey flash' })).not.toBeChecked();
  await expect.poll(async () => appliedTabField(serviceWorker, 'hotkeyFlash')).toContain(false);
  await site.bringToFront();
  await pressIncreaseSpeedHotkey(site);
  await expect.poll(async () => overlayBadgeTexts(site)).toEqual(['1.75×', '1.75×', '1.75×']);
  expect(await hotkeyFlashCopy(site)).toEqual([]);
});

test('options persist Enable key repeat to the tab', async ({
  context,
  extensionId,
  serviceWorker,
  site,
}) => {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await enableSiteAt(popup, site, 1.25);
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Hotkeys');
  await clickOptionsSwitch(options, 'Enable key repeat');
  await expect(options.getByRole('switch', { name: 'Enable key repeat' })).toBeChecked();
  await expect.poll(async () => appliedTabField(serviceWorker, 'hotkeyRepeat')).toContain(true);
});
