// SPDX-License-Identifier: GPL-3.0-only

import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import {
  E2E_POPUP_TARGET_TAB_ID_KEY,
  E2E_POPUP_TARGET_URL_KEY,
} from '../src/access/popup-target-tab';
import { assertE2eExtensionBuild, extensionPath } from './extension-build';

export { extensionPath };
export const fixtureOrigin = 'http://127.0.0.1:4173';

export async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers()[0];
  if (existing) {
    return existing;
  }
  return context.waitForEvent('serviceworker');
}

export async function pointPopupAtSite(serviceWorker: Worker, site: Page): Promise<void> {
  await site.bringToFront();
  const url = site.url();
  const tabId = await serviceWorker.evaluate(
    async ({ url, urlKey, tabIdKey }) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id == null) {
        throw new Error('Could not resolve the current tab id for the popup');
      }
      await chrome.storage.session.set({
        [urlKey]: url,
        [tabIdKey]: tab.id,
      });
      return tab.id;
    },
    {
      url,
      urlKey: E2E_POPUP_TARGET_URL_KEY,
      tabIdKey: E2E_POPUP_TARGET_TAB_ID_KEY,
    },
  );
  if (tabId == null) {
    throw new Error('Could not store an e2e popup target tab');
  }
}

export async function openOptions(
  context: BrowserContext,
  extensionId: string,
  hostname?: string,
): Promise<Page> {
  const options = await context.newPage();
  const query = hostname ? `?site=${encodeURIComponent(hostname)}` : '';
  await options.goto(`chrome-extension://${extensionId}/options.html${query}`);
  await options.getByRole('button', { name: 'Global defaults', exact: true }).waitFor();
  return options;
}

export async function clickOptionsSwitch(page: Page, name: string): Promise<void> {
  await page
    .locator('[data-slot="switch"]')
    .filter({ has: page.getByRole('switch', { name }) })
    .click();
}

export async function confirmAlertDialog(page: Page, action: string): Promise<void> {
  await page.getByRole('alertdialog').getByRole('button', { name: action, exact: true }).click();
}

export async function openPopup(
  context: BrowserContext,
  extensionId: string,
  site: Page,
  serviceWorker: Worker,
): Promise<Page> {
  await pointPopupAtSite(serviceWorker, site);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('heading', { name: 'OS Video Speed Controller' }).waitFor();
  await popup.getByRole('switch', { name: 'Enabled on this site' }).waitFor({ timeout: 10_000 });
  return popup;
}

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  site: Page;
  openExtensionPopup: () => Promise<Page>;
};

export const test = base.extend<ExtensionFixtures>({
  context: async (
    // Playwright 1.62+ requires object destructuring here.
    // eslint-disable-next-line no-empty-pattern -- no parent fixtures
    {},
    use,
    testInfo,
  ) => {
    assertE2eExtensionBuild();
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: testInfo.project.use.headless !== false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    await use(await waitForServiceWorker(context));
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(serviceWorker.url().split('/')[2] ?? '');
  },
  site: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto(`${fixtureOrigin}/multi-video.html`);
    await use(page);
  },
  openExtensionPopup: async ({ context, extensionId, site, serviceWorker }, use) => {
    await use(() => openPopup(context, extensionId, site, serviceWorker));
  },
});

export const expect = test.expect;
