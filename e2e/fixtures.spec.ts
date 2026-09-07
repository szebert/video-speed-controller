// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from '@playwright/test';

test('multi-video fixture exposes three videos and can add a fourth', async ({ page }) => {
  await page.goto('/multi-video.html');
  await expect(page.locator('video')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add fourth' }).click();
  await expect(page.locator('video')).toHaveCount(4);
});

test('shadow fixture keeps an open-root video', async ({ page }) => {
  await page.goto('/shadow.html');
  const count = await page
    .locator('#host')
    .evaluate((host) => host.shadowRoot?.querySelectorAll('video').length ?? 0);
  expect(count).toBe(1);
});

test('feed fixture reparents the same video node', async ({ page }) => {
  await page.goto('/feed.html');
  const idBefore = await page.locator('#recycled').evaluate((node) => node);
  await page.getByRole('button', { name: 'Reparent' }).click();
  const stillSame = await page.locator('#b video').evaluate((node) => node.id);
  expect(stillSame).toBe('recycled');
  expect(idBefore).toBeTruthy();
});

test('restore-baseline fixture starts at 1.25×', async ({ page }) => {
  await page.goto('/restore-baseline.html');
  await expect
    .poll(async () =>
      page.locator('#v1').evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.25);
  await expect
    .poll(async () =>
      page.locator('#v1').evaluate((video) => (video as HTMLVideoElement).defaultPlaybackRate),
    )
    .toBe(1.25);
});

test('iframe fixture has a top video, same-origin iframe, and ungranted embed', async ({
  page,
}) => {
  await page.goto('/iframes.html');
  await expect(page.locator('#top-video')).toHaveCount(1);
  await expect(page.locator('#same-origin')).toHaveCount(1);
  await expect(page.locator('#cross-origin')).toHaveCount(1);
});

test('overlay-stacking fixture exposes six labeled cases', async ({ page }) => {
  await page.goto('/overlay-stacking.html');
  await expect(page.getByRole('heading', { name: 'Sticky header' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ordinary modal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Player chrome' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dropdown / menu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wrapper fullscreen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Transparent click-capture' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(6);
  await expect(page.locator('#sticky-header')).toBeVisible();
  await expect(page.locator('#ordinary-modal')).toBeHidden();
  await expect(page.locator('#player-chrome')).toBeVisible();
  await expect(page.locator('#dropdown-menu')).toBeHidden();
  await expect(page.locator('#fullscreen-wrapper')).toBeVisible();
  await expect(page.locator('#click-trap')).toBeVisible();
  await expect
    .poll(async () =>
      page.locator('#click-trap').evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .toBe('rgba(0, 0, 0, 0)');
});
