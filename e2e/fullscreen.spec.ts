// SPDX-License-Identifier: GPL-3.0-only

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

async function setupFullscreen(
  context: BrowserContext,
  extensionId: string,
  serviceWorker: Worker,
  site: Page,
): Promise<void> {
  await site.goto(`${fixtureOrigin}/rewind.html`);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await popup.getByRole('button', { name: 'Reset' }).click();
  await popup.close();
  const options = await openOptions(context, extensionId, '127.0.0.1');
  await selectOptionsTab(options, 'Overlay');
  await clickOptionsSwitch(options, 'Show extras bar');
  await clickOptionsSwitch(options, 'Auto-hide overlay');
  await selectOptionsTab(options, 'Hotkeys');
  await options.getByRole('button', { name: 'Record shortcut: Fullscreen', exact: true }).click();
  await options.keyboard.press('f');
  await expect(
    options.getByRole('button', { name: 'Record shortcut: Fullscreen', exact: true }),
  ).toHaveText('F');
  // The hint also proves that the new binding has reached the content script.
  await expect(site.locator('osvsc-overlay .fullscreen-toggle .hotkey-hint')).toHaveText('F');
  await options.close();
  await site.bringToFront();
  await site.locator('#v1').hover();
}

test('fullscreen button and hotkey enter and exit with native video fullscreen and feedback', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await setupFullscreen(context, extensionId, serviceWorker, site);
  const overlay = site.locator('osvsc-overlay');
  const enter = overlay.getByRole('button', { name: 'Fullscreen on', exact: true });
  await expect(enter).toBeEnabled();
  expect(
    await enter.evaluate((button) => button.previousElementSibling?.getAttribute('aria-label')),
  ).toBe('Loop');
  await enter.click();
  await expect.poll(() => site.evaluate(() => document.fullscreenElement?.id)).toBe('v1');
  await expect(overlay.locator('.fullscreen-toggle')).toHaveAttribute(
    'aria-label',
    'Fullscreen off',
  );
  await expect(site.locator('osvsc-hotkey-flash .hotkey-flash-label')).toHaveText('Fullscreen on');
  await expect(site.locator('osvsc-hotkey-flash')).toHaveAttribute('popover', 'manual');
  await expect(site.locator('osvsc-hotkey-flash')).toBeVisible();
  await expect(overlay).toBeHidden();
  await site.keyboard.press('f');
  await expect.poll(() => site.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(enter).toBeVisible();
  await site.keyboard.press('f');
  await expect.poll(() => site.evaluate(() => document.fullscreenElement?.id)).toBe('v1');
  await site.keyboard.press('f');
  await expect.poll(() => site.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(site.locator('osvsc-hotkey-flash .hotkey-flash-label')).toHaveText('Fullscreen off');
  await enter.click();
  await site.evaluate(() => document.exitFullscreen());
  await expect(enter).toHaveAttribute('aria-pressed', 'false');
});

test('a fullscreen Permissions Policy disables the button and flashes the bound hotkey failure', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.route(`${fixtureOrigin}/rewind.html`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'permissions-policy': 'fullscreen=()' },
    });
  });
  await setupFullscreen(context, extensionId, serviceWorker, site);
  expect(await site.evaluate(() => document.fullscreenEnabled)).toBe(false);
  await expect(
    site.locator('osvsc-overlay').getByRole('button', { name: 'Fullscreen on', exact: true }),
  ).toBeDisabled();
  await site.keyboard.press('f');
  await expect(site.locator('osvsc-hotkey-flash .hotkey-flash-label')).toHaveText(
    'Fullscreen unavailable for this video',
  );
  expect(await site.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('fullscreen follows an adopted video across nested foreign shadow roots', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await setupFullscreen(context, extensionId, serviceWorker, site);
  await site.evaluate(() => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const foreign = frame.contentDocument;
    if (!foreign) {
      throw new Error('Expected an iframe document');
    }
    const player = foreign.createElement('div');
    player.id = 'adopted-fullscreen-player';
    const outerShadow = player.attachShadow({ mode: 'open' });
    const innerHost = foreign.createElement('section');
    innerHost.id = 'adopted-inner-host';
    const innerShadow = innerHost.attachShadow({ mode: 'open' });
    const video = foreign.createElement('video');
    video.id = 'adopted-fullscreen-video';
    video.tabIndex = 0;
    video.width = 320;
    video.height = 180;
    video.src = new URL('/rewind.webm', location.href).href;
    innerShadow.append(video);
    outerShadow.append(innerHost);
    const enter = document.createElement('button');
    enter.textContent = 'Fullscreen adopted player';
    enter.addEventListener('click', () => {
      void player.requestFullscreen();
      video.focus();
    });
    document.body.append(enter, document.adoptNode(player));
    frame.remove();
  });
  await expect(site.locator('osvsc-overlay')).toHaveCount(2);
  await site.getByRole('button', { name: 'Fullscreen adopted player', exact: true }).click();
  await expect
    .poll(() => site.evaluate(() => document.fullscreenElement?.id))
    .toBe('adopted-fullscreen-player');
  const overlay = site.locator('#adopted-fullscreen-player osvsc-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.fullscreen-toggle')).toHaveAttribute(
    'aria-label',
    'Fullscreen off',
  );
  await site.keyboard.press('f');
  await expect.poll(() => site.evaluate(() => document.fullscreenElement)).toBeNull();
  await site.keyboard.press('f');
  await expect
    .poll(() =>
      site.evaluate(
        () =>
          document
            .getElementById('adopted-fullscreen-player')
            ?.shadowRoot?.getElementById('adopted-inner-host')?.shadowRoot?.fullscreenElement?.id,
      ),
    )
    .toBe('adopted-fullscreen-video');
  await expect(
    site.locator('osvsc-overlay .fullscreen-toggle[aria-label="Fullscreen off"]'),
  ).toHaveCount(1);
  await site.keyboard.press('f');
  await expect.poll(() => site.evaluate(() => document.fullscreenElement)).toBeNull();
});
