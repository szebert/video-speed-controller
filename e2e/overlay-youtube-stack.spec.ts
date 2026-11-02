// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import {
  clickOptionsSwitch,
  expect,
  fixtureOrigin,
  openOptions,
  openPopup,
  selectOptionsTab,
  test,
} from './extension';

const WATCH_URL = 'https://www.youtube.com/watch?v=osvsc-stack';
const FIXTURE_HTML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'youtube-stack.html'),
);

test.beforeEach(async ({ context }) => {
  await context.route('https://www.youtube.com/**', (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.abort();
    }
    return route.fulfill({ body: FIXTURE_HTML, contentType: 'text/html' });
  });
});

async function enableOverlay(
  context: BrowserContext,
  extensionId: string,
  serviceWorker: Worker,
  site: Page,
  hostname: string,
): Promise<void> {
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.close();
  const options = await openOptions(context, extensionId, hostname);
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await options.getByText('Top left', { exact: true }).click();
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host: HTMLElement) => host.style.transform))
    .toMatch(/^translate\(0(?:px)?, 0(?:px)?\)$/);
  await options.close();
  await site.bringToFront();
}

test('keeps other pages on the fixed root portal', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/youtube-stack.html`);
  await enableOverlay(context, extensionId, serviceWorker, site, '127.0.0.1');
  await expect
    .poll(() =>
      site.locator('osvsc-overlay').evaluate((host: HTMLElement) => ({
        root: host.parentElement === document.documentElement,
        position: host.style.position,
        zIndex: host.style.zIndex,
      })),
    )
    .toEqual({ root: true, position: 'fixed', zIndex: '2147483647' });
});

test('mounts a watch page under the player and lets the header and menu win', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(WATCH_URL);
  await enableOverlay(context, extensionId, serviceWorker, site, 'www.youtube.com');
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host) => host.parentElement?.id ?? null))
    .toBe('movie_player');

  const hits = await site.evaluate(() => {
    const host = document.querySelector('osvsc-overlay') as HTMLElement;
    const headerBottom = document
      .getElementById('masthead-container')!
      .getBoundingClientRect().bottom;
    const button = [...(host.shadowRoot?.querySelectorAll('button') ?? [])].find((node) => {
      const box = node.getBoundingClientRect();
      return box.top + box.height / 2 > headerBottom;
    });
    const buttonBox = button!.getBoundingClientRect();
    const search = document.getElementById('search')!.getBoundingClientRect();
    const gap = document.getElementById('native-gap')!.getBoundingClientRect();
    return {
      search: document.elementFromPoint(search.left + 8, search.top + 8)?.id,
      button: document.elementFromPoint(
        buttonBox.left + buttonBox.width / 2,
        buttonBox.top + buttonBox.height / 2,
      )?.localName,
      gap: document.elementFromPoint(gap.left + 4, gap.top + 4)?.id,
    };
  });
  expect(hits.search).toBe('search');
  expect(hits.button === 'button' || hits.button === 'osvsc-overlay').toBe(true);
  expect(hits.gap).toBe('native-gap');

  const clicksBefore = await site.evaluate(
    () => (window as Window & { __playerClicks?: number }).__playerClicks ?? 0,
  );
  await site.evaluate(() => {
    document.querySelector('osvsc-overlay')!.shadowRoot!.querySelector('button')!.click();
  });
  expect(
    await site.evaluate(() => (window as Window & { __playerClicks?: number }).__playerClicks ?? 0),
  ).toBe(clicksBefore);

  await site.evaluate(() => {
    document.getElementById('native-menu')!.hidden = false;
  });
  expect(
    await site.evaluate(() => {
      const host = document.querySelector('osvsc-overlay') as HTMLElement;
      const headerBottom = document
        .getElementById('masthead-container')!
        .getBoundingClientRect().bottom;
      const button = [...(host.shadowRoot?.querySelectorAll('button') ?? [])].find((node) => {
        const box = node.getBoundingClientRect();
        return box.top + box.height / 2 > headerBottom;
      })!;
      const box = button.getBoundingClientRect();
      return (
        document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.closest('#native-menu') != null
      );
    }),
  ).toBe(true);
});

test('restores the portal when the watch mount no longer applies', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(WATCH_URL);
  await enableOverlay(context, extensionId, serviceWorker, site, 'www.youtube.com');
  await site.locator('osvsc-overlay').evaluate((node) => node.setAttribute('data-same', '1'));

  await site.evaluate(() => {
    history.pushState({}, '', '/shorts/abc');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host: HTMLElement) => host.style.position))
    .toBe('fixed');

  await site.evaluate(() => {
    history.pushState({}, '', '/watch?v=osvsc-stack');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host) => host.parentElement?.id ?? null))
    .toBe('movie_player');

  await site.evaluate(() => {
    document.getElementById('movie_player')!.style.transform = 'scale(1.05)';
  });
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host: HTMLElement) => host.style.position))
    .toBe('fixed');

  await site.evaluate(() => {
    const video = document.querySelector('video')!;
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    elsewhere.append(video);
  });
  await expect
    .poll(() =>
      site.locator('osvsc-overlay').evaluate((host: HTMLElement) => host.getAttribute('data-same')),
    )
    .toBe('1');

  await site.evaluate(() => {
    document.querySelector('video')!.remove();
  });
  await expect(site.locator('osvsc-overlay')).toHaveCount(0);
});
