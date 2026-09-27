// SPDX-License-Identifier: GPL-3.0-only

import type { Page, Worker } from '@playwright/test';
import {
  clickOptionsSwitch,
  expect,
  fixtureOrigin,
  openOptions,
  openPopup,
  selectOptionsTab,
  test,
} from './extension';

async function overlaySpeeds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('osvsc-overlay')].map(
      (host) => host.shadowRoot?.querySelector('.speed-value')?.textContent ?? '',
    ),
  );
}

async function pageKeyCodes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as Window & { __osvscPageKeydowns?: string[] }).__osvscPageKeydowns ?? [],
  );
}

async function playbackRate(page: Page): Promise<number> {
  return page.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate);
}

async function appliedConsumeFlags(serviceWorker: Worker): Promise<boolean[]> {
  return serviceWorker.evaluate(async () => {
    const items = await chrome.storage.session.get(null);
    const values: boolean[] = [];
    for (const [key, value] of Object.entries(items)) {
      if (!key.startsWith('tab:') || !value || typeof value !== 'object') {
        continue;
      }
      const current = (value as Record<string, unknown>).hotkeyConsumeMatchedKeys;
      if (typeof current === 'boolean') {
        values.push(current);
      }
    }
    return values;
  });
}

test('matched shortcuts block the page handler until Block native controls is off', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/hotkey-consume.html`);
  await openPopup(context, extensionId, site, serviceWorker);
  await expect.poll(async () => overlaySpeeds(site)).toEqual(['1.00×']);

  await site.bringToFront();
  await site.keyboard.press('a');
  await expect.poll(async () => pageKeyCodes(site)).toContain('KeyA');

  await site.keyboard.press(']');
  await expect.poll(async () => playbackRate(site)).toBe(1.25);
  expect(await pageKeyCodes(site)).not.toContain('BracketRight');

  const options = await openOptions(context, extensionId);
  await expect(
    options.getByRole('button', { name: 'Global Defaults', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await selectOptionsTab(options, 'Hotkeys');
  const blockNative = options.getByRole('switch', { name: 'Block native controls' });
  await expect(blockNative).toBeChecked();
  await clickOptionsSwitch(options, 'Block native controls');
  await expect(blockNative).not.toBeChecked();
  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(options.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
  await expect.poll(async () => appliedConsumeFlags(serviceWorker)).toContain(false);

  await site.bringToFront();
  await site.keyboard.press(']');
  await expect.poll(async () => playbackRate(site)).toBe(1.5);
  await expect.poll(async () => pageKeyCodes(site)).toContain('BracketRight');
});
