// SPDX-License-Identifier: GPL-3.0-only

import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, fixtureOrigin, openPopup, test } from './extension';

const OVERLAY_COUNT = 6;

type OverlayStackSample = {
  osvscIsInteractiveTarget: boolean;
  osvscIsPageTarget: boolean;
  occluderAboveVideoAfterIgnoringOsvsc: boolean;
  pageStackTopId: string | null;
};

type FullscreenHosting = {
  fullscreenId: string | null;
  overlayHostCount: number;
  overlayInsideFullscreen: boolean;
  overlayIsInteractiveTarget: boolean;
  hitId: string | null;
};

async function overlayBadgeTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('osvsc-overlay')].map(
      (host) => host.shadowRoot?.querySelector('.speed')?.textContent ?? '',
    ),
  );
}

async function applyOverlayEngine(popup: Page, site: Page): Promise<void> {
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await expect
    .poll(async () => overlayBadgeTexts(site))
    .toEqual(Array.from({ length: OVERLAY_COUNT }, () => '1.00×'));
}

async function openStackingSite(
  context: BrowserContext,
  extensionId: string,
  serviceWorker: Worker,
): Promise<Page> {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/overlay-stacking.html`);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await applyOverlayEngine(popup, site);
  await popup.close();
  await site.bringToFront();
  return site;
}

async function overlayVisibilityForVideo(page: Page, videoId: string): Promise<string> {
  return page.evaluate((id) => {
    const video = document.getElementById(id);
    if (!(video instanceof HTMLVideoElement)) {
      return 'missing-video';
    }
    const videoRect = video.getBoundingClientRect();
    for (const host of document.querySelectorAll('osvsc-overlay')) {
      if (!(host instanceof HTMLElement)) {
        continue;
      }
      const rect = host.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (
        x >= videoRect.left &&
        x <= videoRect.right &&
        y >= videoRect.top &&
        y <= videoRect.bottom
      ) {
        return host.style.visibility || 'missing-visibility';
      }
    }
    return 'missing-host';
  }, videoId);
}

async function revealOverlay(
  page: Page,
  videoId: string,
  options: { scroll?: boolean } = {},
): Promise<void> {
  if (options.scroll !== false) {
    await page.locator(`#${videoId}`).scrollIntoViewIfNeeded();
  }
  const box = await page.locator(`#${videoId}`).boundingBox();
  if (!box) {
    throw new Error(`Missing ${videoId} bounds`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => overlayVisibilityForVideo(page, videoId)).toBe('visible');
}

// Hit-test stack, not paint order: pointer-events:none paint-only nodes may be absent.
async function sampleOverlayStack(
  page: Page,
  videoId: string,
  occluderId: string,
  options: { scroll?: boolean } = {},
): Promise<OverlayStackSample> {
  await revealOverlay(page, videoId, options);
  return page.evaluate(
    ({ id, occluder }) => {
      const video = document.getElementById(id);
      const occluderNode = document.getElementById(occluder);
      if (!(video instanceof HTMLVideoElement) || !(occluderNode instanceof HTMLElement)) {
        throw new Error(`Missing stacking nodes for ${id} / ${occluder}`);
      }

      const videoRect = video.getBoundingClientRect();
      let host: HTMLElement | null = null;
      for (const candidate of document.querySelectorAll('osvsc-overlay')) {
        if (!(candidate instanceof HTMLElement)) {
          continue;
        }
        const rect = candidate.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (
          cx >= videoRect.left &&
          cx <= videoRect.right &&
          cy >= videoRect.top &&
          cy <= videoRect.bottom
        ) {
          host = candidate;
          break;
        }
      }
      if (!host?.shadowRoot) {
        throw new Error(`Missing overlay host for ${id}`);
      }

      const control = host.shadowRoot.querySelector('[aria-label="Faster"]');
      if (!(control instanceof HTMLElement)) {
        throw new Error(`Missing Faster control for ${id}`);
      }
      const box = control.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const shadowHit = host.shadowRoot.elementFromPoint(x, y);
      const osvscIsInteractiveTarget =
        shadowHit === control ||
        (shadowHit instanceof Node && control.contains(shadowHit)) ||
        (shadowHit instanceof Element && shadowHit.closest('.controls-shell') != null);
      const osvscIsPageTarget = document.elementFromPoint(x, y) === host;

      const hosts = [...document.querySelectorAll('osvsc-overlay')].filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      );
      const previous = hosts.map((node) => node.style.visibility);
      for (const node of hosts) {
        node.style.setProperty('visibility', 'hidden', 'important');
      }
      try {
        const stack = document.elementsFromPoint(x, y);
        const occluderIndex = stack.findIndex(
          (node) => node === occluderNode || occluderNode.contains(node),
        );
        const videoIndex = stack.findIndex((node) => node === video);
        return {
          osvscIsInteractiveTarget,
          osvscIsPageTarget,
          occluderAboveVideoAfterIgnoringOsvsc:
            occluderIndex >= 0 && videoIndex >= 0 && occluderIndex < videoIndex,
          pageStackTopId:
            stack[0] instanceof Element ? stack[0].id || stack[0].tagName.toLowerCase() : null,
        };
      } finally {
        hosts.forEach((node, index) => {
          node.style.setProperty('visibility', previous[index] || 'visible', 'important');
        });
      }
    },
    { id: videoId, occluder: occluderId },
  );
}

async function overlapStickyHeader(page: Page): Promise<void> {
  await page.locator('#section-sticky').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const scroller = document.getElementById('sticky-scroller');
    const video = document.getElementById('video-sticky');
    const header = document.getElementById('sticky-header');
    if (
      !(scroller instanceof HTMLElement) ||
      !(video instanceof HTMLVideoElement) ||
      !(header instanceof HTMLElement)
    ) {
      throw new Error('Missing sticky-header fixture nodes');
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const headerHeight = header.getBoundingClientRect().height;
    const desiredVideoTop = scrollerRect.top + headerHeight - 24;
    scroller.scrollTop += videoRect.top - desiredVideoTop;
  });
}

test('sticky header keeps the max-z overlay as the interactive target', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await openStackingSite(context, extensionId, serviceWorker);
  await overlapStickyHeader(site);
  const sample = await sampleOverlayStack(site, 'video-sticky', 'sticky-header', {
    scroll: false,
  });
  expect(sample.osvscIsInteractiveTarget).toBe(true);
  expect(sample.osvscIsPageTarget).toBe(true);
  expect(sample.occluderAboveVideoAfterIgnoringOsvsc).toBe(true);
});

test('ordinary modal keeps the max-z overlay as the interactive target', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await openStackingSite(context, extensionId, serviceWorker);
  await site.getByRole('button', { name: 'Open modal' }).click();
  await expect(site.locator('#ordinary-modal')).toBeVisible();
  const sample = await sampleOverlayStack(site, 'video-modal', 'ordinary-modal');
  expect(sample.osvscIsInteractiveTarget).toBe(true);
  expect(sample.osvscIsPageTarget).toBe(true);
  expect(sample.occluderAboveVideoAfterIgnoringOsvsc).toBe(true);
});

test('player chrome keeps the max-z overlay as the interactive target', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await openStackingSite(context, extensionId, serviceWorker);
  const sample = await sampleOverlayStack(site, 'video-chrome', 'player-chrome');
  expect(sample.osvscIsInteractiveTarget).toBe(true);
  expect(sample.osvscIsPageTarget).toBe(true);
  expect(sample.occluderAboveVideoAfterIgnoringOsvsc).toBe(true);
});

test('dropdown menu keeps the max-z overlay as the interactive target', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await openStackingSite(context, extensionId, serviceWorker);
  await site.getByRole('button', { name: 'Open menu' }).click();
  await expect(site.locator('#dropdown-menu')).toBeVisible();
  const sample = await sampleOverlayStack(site, 'video-menu', 'dropdown-menu');
  expect(sample.osvscIsInteractiveTarget).toBe(true);
  expect(sample.osvscIsPageTarget).toBe(true);
  expect(sample.occluderAboveVideoAfterIgnoringOsvsc).toBe(true);
});

test('transparent click-capture is a hit-test false positive above the video', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await openStackingSite(context, extensionId, serviceWorker);
  const sample = await sampleOverlayStack(site, 'video-trap', 'click-trap');
  expect(sample.osvscIsInteractiveTarget).toBe(true);
  expect(sample.osvscIsPageTarget).toBe(true);
  expect(sample.occluderAboveVideoAfterIgnoringOsvsc).toBe(true);
});

test('wrapper fullscreen is a hosting question, not an occlusion input', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await openStackingSite(context, extensionId, serviceWorker);
  await revealOverlay(site, 'video-fullscreen');
  await site.bringToFront();
  await site.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect
    .poll(async () =>
      site.evaluate(() => ({
        fullscreenId: document.fullscreenElement?.id ?? null,
        error: document.getElementById('enter-fullscreen')?.dataset.error ?? null,
      })),
    )
    .toEqual({ fullscreenId: 'fullscreen-wrapper', error: null });

  const hosting = await site.evaluate((): FullscreenHosting => {
    const wrapper = document.getElementById('fullscreen-wrapper');
    const video = document.getElementById('video-fullscreen');
    if (!(wrapper instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
      throw new Error('Missing wrapper-fullscreen fixture nodes');
    }
    const hosts = [...document.querySelectorAll('osvsc-overlay')];
    const rect = video.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + 20;
    const hit = document.elementFromPoint(x, y);
    return {
      fullscreenId: document.fullscreenElement?.id ?? null,
      overlayHostCount: hosts.length,
      overlayInsideFullscreen: hosts.some((host) => wrapper.contains(host)),
      overlayIsInteractiveTarget: hit instanceof Element && hit.closest('osvsc-overlay') != null,
      hitId: hit instanceof Element ? hit.id || hit.tagName.toLowerCase() : null,
    };
  });

  expect(hosting.fullscreenId).toBe('fullscreen-wrapper');
  expect(hosting.overlayHostCount).toBe(OVERLAY_COUNT);
  expect(hosting.overlayInsideFullscreen).toBe(false);
  expect(hosting.overlayIsInteractiveTarget).toBe(false);
});
