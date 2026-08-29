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

test('iframe fixture has a top video, same-origin iframe, and ungranted embed', async ({
  page,
}) => {
  await page.goto('/iframes.html');
  await expect(page.locator('#top-video')).toHaveCount(1);
  await expect(page.locator('#same-origin')).toHaveCount(1);
  await expect(page.locator('#cross-origin')).toHaveCount(1);
});
