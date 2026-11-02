// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
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
const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_HTML = readFileSync(join(FIXTURE_DIR, 'fixtures', 'youtube-stack.html'));
const REWIND_WEBM = readFileSync(join(FIXTURE_DIR, 'fixtures', 'rewind.webm'));

test.beforeEach(async ({ context }) => {
  await context.route('https://www.youtube.com/**', async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/rewind.webm') {
      const size = REWIND_WEBM.length;
      const range = request.headers().range;
      const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (match) {
        const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1]);
        const end = match[2] === '' || match[1] === '' ? size - 1 : Number(match[2]);
        const slice = REWIND_WEBM.subarray(start, end + 1);
        return route.fulfill({
          status: 206,
          contentType: 'video/webm',
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(slice.length),
          },
          body: slice,
        });
      }
      return route.fulfill({
        contentType: 'video/webm',
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size),
        },
        body: REWIND_WEBM,
      });
    }
    if (request.resourceType() !== 'document') {
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

async function playerActivity(site: Page): Promise<{ clicks: number; presses: number }> {
  return site.evaluate(() => ({
    clicks: (window as Window & { __playerClicks?: number }).__playerClicks ?? 0,
    presses: (window as Window & { __playerPresses?: number }).__playerPresses ?? 0,
  }));
}

async function controlBox(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Missing overlay control bounds');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('drives a mounted watch overlay with real pointer input', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(WATCH_URL);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await popup.close();
  const options = await openOptions(context, extensionId, 'www.youtube.com');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await clickOptionsSwitch(options, 'Show navigation bar');
  await clickOptionsSwitch(options, 'Show volume bar');
  await clickOptionsSwitch(options, 'Show extras bar');
  await options.getByText('Bottom left', { exact: true }).click();
  await expect
    .poll(() => site.locator('osvsc-overlay').evaluate((host: HTMLElement) => host.style.transform))
    .toMatch(/^translate\(0(?:px)?, -100%\)$/);
  await options.close();
  await site.bringToFront();
  const overlay = site.locator('osvsc-overlay');
  await expect
    .poll(() => overlay.evaluate((host) => host.parentElement?.id ?? null))
    .toBe('movie_player');
  const before = await playerActivity(site);

  const faster = overlay.getByRole('button', { name: 'Faster', exact: true });
  await expect(faster).toBeVisible();
  const fasterPoint = await controlBox(faster);
  await site.mouse.click(fasterPoint.x, fasterPoint.y);
  await expect(overlay.locator('.speed-value')).toHaveText('1.25×');
  await expect
    .poll(() => site.locator('#main').evaluate((video) => (video as HTMLVideoElement).playbackRate))
    .toBe(1.25);
  expect(await playerActivity(site)).toEqual(before);

  await site.locator('#main').evaluate((node) => {
    const video = node as HTMLVideoElement;
    video.muted = false;
    video.volume = 0;
  });
  const range = overlay.locator('.volume-range');
  await expect(range).toBeVisible();
  const rangeBox = await range.boundingBox();
  if (!rangeBox) {
    throw new Error('Missing volume range bounds');
  }
  const rangeY = rangeBox.y + rangeBox.height / 2;
  await site.mouse.move(rangeBox.x + rangeBox.width * 0.2, rangeY);
  await site.mouse.down();
  await site.mouse.move(rangeBox.x + rangeBox.width * 0.8, rangeY, { steps: 8 });
  await site.mouse.up();
  await expect
    .poll(() => site.locator('#main').evaluate((video) => (video as HTMLVideoElement).volume))
    .toBeGreaterThan(0.5);
  expect(await playerActivity(site)).toEqual(before);

  await expect
    .poll(() =>
      site
        .locator('#main')
        .evaluate((video) => Number.isFinite((video as HTMLVideoElement).duration)),
    )
    .toBe(true);
  await site.locator('#main').evaluate(async (node, time) => {
    const video = node as HTMLVideoElement;
    video.pause();
    if (Math.abs(video.currentTime - time) < 0.05) {
      return;
    }
    const seeked = new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
    });
    video.currentTime = time;
    await seeked;
  }, 5);
  await expect
    .poll(() => site.locator('#main').evaluate((video) => (video as HTMLVideoElement).currentTime))
    .toBeGreaterThan(4);
  const rewind = overlay.getByRole('button', { name: 'Rewind', exact: true });
  await expect(rewind).toBeEnabled();
  const rewindPoint = await controlBox(rewind);
  const timeBefore = await site
    .locator('#main')
    .evaluate((video) => (video as HTMLVideoElement).currentTime);
  await site.mouse.move(rewindPoint.x, rewindPoint.y);
  await site.mouse.down();
  await site.waitForTimeout(1200);
  await site.mouse.up();
  const timeHeld = await site
    .locator('#main')
    .evaluate((video) => (video as HTMLVideoElement).currentTime);
  expect(timeHeld).toBeLessThan(timeBefore - 0.3);
  await site.waitForTimeout(500);
  const timeReleased = await site
    .locator('#main')
    .evaluate((video) => (video as HTMLVideoElement).currentTime);
  expect(Math.abs(timeReleased - timeHeld)).toBeLessThan(0.2);
  expect(await playerActivity(site)).toEqual(before);

  const fullscreen = overlay.getByRole('button', { name: 'Fullscreen on', exact: true });
  await expect(fullscreen).toBeEnabled();
  const fullscreenPoint = await controlBox(fullscreen);
  await site.mouse.click(fullscreenPoint.x, fullscreenPoint.y);
  await expect.poll(() => site.evaluate(() => document.fullscreenElement?.id ?? null)).toBe('main');
  expect(await playerActivity(site)).toEqual(before);
  await site.evaluate(() => document.exitFullscreen());
  await expect.poll(() => site.evaluate(() => document.fullscreenElement)).toBeNull();

  const gap = await site.locator('#native-gap').boundingBox();
  if (!gap) {
    throw new Error('Missing native gap bounds');
  }
  await site.mouse.click(gap.x + gap.width / 2, gap.y + gap.height / 2);
  await expect
    .poll(() => playerActivity(site))
    .toEqual({
      clicks: before.clicks + 1,
      presses: before.presses + 1,
    });
});

test('restores fixed placement when a hidden watch overlay leaves the player', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(WATCH_URL);
  await enableOverlay(context, extensionId, serviceWorker, site, 'www.youtube.com');
  const options = await openOptions(context, extensionId, 'www.youtube.com');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await options.close();
  await site.bringToFront();
  const overlay = site.locator('osvsc-overlay');
  await expect
    .poll(() => overlay.evaluate((host: HTMLElement) => host.style.visibility))
    .toBe('hidden');
  await expect
    .poll(() =>
      overlay.evaluate((host: HTMLElement) => ({
        parent: host.parentElement?.id ?? null,
        position: host.style.position,
        zIndex: host.style.zIndex,
      })),
    )
    .toEqual({ parent: 'movie_player', position: 'absolute', zIndex: '60' });

  await site.locator('#enter-fullscreen').click();
  await expect
    .poll(() => site.evaluate(() => document.fullscreenElement?.id ?? null))
    .toBe('fs-wrap');
  await expect
    .poll(() =>
      overlay.evaluate((host: HTMLElement) => ({
        parent: host.parentElement?.id ?? null,
        position: host.style.position,
        zIndex: host.style.zIndex,
        visibility: host.style.visibility,
      })),
    )
    .toEqual({ parent: 'fs-wrap', position: 'fixed', zIndex: '2147483647', visibility: 'hidden' });
  await site.evaluate(() => document.exitFullscreen());
  await expect
    .poll(() =>
      overlay.evaluate((host: HTMLElement) => ({
        position: host.style.position,
        zIndex: host.style.zIndex,
        visibility: host.style.visibility,
      })),
    )
    .toEqual({ position: 'fixed', zIndex: '2147483647', visibility: 'hidden' });

  await site.evaluate(() => {
    history.pushState({}, '', '/shorts/abc');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect
    .poll(() =>
      overlay.evaluate((host: HTMLElement) => ({
        root: host.parentElement === document.documentElement,
        position: host.style.position,
        zIndex: host.style.zIndex,
        visibility: host.style.visibility,
      })),
    )
    .toEqual({ root: true, position: 'fixed', zIndex: '2147483647', visibility: 'hidden' });
});
