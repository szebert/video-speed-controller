// SPDX-License-Identifier: GPL-3.0-only

import type { Page, Worker } from '@playwright/test';
import { CONTENT_SCRIPT_FILE, SHADOW_ATTACH_SCRIPT_ID } from '../src/access/content-registration';
import { SHADOW_ATTACHED_EVENT } from '../src/core/shadow-attach';
import { expect, fixtureOrigin, openPopup, test } from './extension';

declare global {
  interface Window {
    shadowDiscoveryFixture: {
      outer: HTMLElement;
      inner: HTMLElement;
      hookPresentAtParse: boolean;
      innerRoot?: ShadowRoot;
      video?: HTMLVideoElement;
    };
  }
}

async function waitForHookRegistration(serviceWorker: Worker): Promise<void> {
  await expect
    .poll(() =>
      serviceWorker.evaluate(async (id) => {
        const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
        return scripts.length;
      }, SHADOW_ATTACH_SCRIPT_ID),
    )
    .toBe(1);
}

async function expectLateVideo(site: Page, overlayCount = 2): Promise<void> {
  await expect
    .poll(() => site.evaluate(() => window.shadowDiscoveryFixture.video?.playbackRate))
    .toBe(1.25);
  await expect(site.locator('osvsc-overlay')).toHaveCount(overlayCount);
}

for (const mode of ['open', 'closed'] as const) {
  test(`discovers a late ${mode} root on an already-scanned ordinary host`, async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await waitForHookRegistration(serviceWorker);
    const site = await context.newPage();
    await site.goto(`${fixtureOrigin}/shadow-discovery.html`);
    expect(await site.evaluate(() => window.shadowDiscoveryFixture.hookPresentAtParse)).toBe(true);
    const popup = await openPopup(context, extensionId, site, serviceWorker);
    await popup.getByRole('button', { name: 'Faster' }).click();
    await expect
      .poll(() =>
        site
          .locator('#declarative video')
          .evaluate((video: HTMLVideoElement) => video.playbackRate),
      )
      .toBe(1.25);
    await popup.close();

    await site.evaluate((mode) => {
      const host = document.getElementById(`late-${mode}`)!;
      const shadow = host.attachShadow({ mode });
      const video = document.createElement('video');
      video.width = 320;
      video.height = 180;
      window.shadowDiscoveryFixture.video = video;
      shadow.append(video);
    }, mode);
    // No source or playback event: the attach notification must establish
    // observation before the page populates the new root.
    await expectLateVideo(site);
  });
}

test('discovers nested closed roots and resumes discovery after removal and reinsertion', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await waitForHookRegistration(serviceWorker);
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/shadow-discovery.html`);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(site.locator('osvsc-overlay .speed-value')).toHaveText('1.25×');
  await popup.close();

  const documentPathHost = await site.evaluate((eventName) => {
    let seen: string | undefined;
    document.addEventListener(
      eventName,
      (event) => {
        const host = event.composedPath()[0];
        if (host instanceof Element) {
          seen = host.id;
        }
      },
      { capture: true, once: true },
    );
    const fixture = window.shadowDiscoveryFixture;
    fixture.innerRoot = fixture.inner.attachShadow({ mode: 'closed' });
    fixture.video = document.createElement('video');
    fixture.innerRoot.append(fixture.video);
    return seen;
  }, SHADOW_ATTACHED_EVENT);
  expect(documentPathHost).toBe('outer-closed');
  await expectLateVideo(site);

  await site.evaluate(() => window.shadowDiscoveryFixture.outer.remove());
  await expect(site.locator('osvsc-overlay')).toHaveCount(1);
  await site.evaluate(() => document.body.append(window.shadowDiscoveryFixture.outer));
  await expectLateVideo(site);

  await site.evaluate(() => {
    const host = document.createElement('div');
    window.shadowDiscoveryFixture.innerRoot!.append(host);
  });
  await site.evaluate(() => {
    const fixture = window.shadowDiscoveryFixture;
    const host = fixture.innerRoot!.querySelector('div')!;
    const shadow = host.attachShadow({ mode: 'closed' });
    fixture.video = document.createElement('video');
    shadow.append(fixture.video);
  });
  await expectLateVideo(site, 3);
});

test('hooks an existing tab and ignores page overrides of notification primitives', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await waitForHookRegistration(serviceWorker);
  await serviceWorker.evaluate(async (id) => {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }, SHADOW_ATTACH_SCRIPT_ID);
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/shadow-discovery.html`);
  expect(await site.evaluate(() => window.shadowDiscoveryFixture.hookPresentAtParse)).toBe(false);
  const popup = await openPopup(context, extensionId, site, serviceWorker);
  await popup.getByRole('button', { name: 'Faster' }).click();
  await expect(site.locator('osvsc-overlay .speed-value')).toHaveText('1.25×');
  await popup.close();

  await site.evaluate(() => {
    const host = document.getElementById('late-open')!;
    host.dispatchEvent = () => {
      throw new Error('component dispatch override');
    };
    Object.defineProperty(window, 'CustomEvent', {
      configurable: true,
      value: class {
        constructor() {
          throw new Error('page replaced CustomEvent');
        }
      },
    });
    const shadow = host.attachShadow({ mode: 'open' });
    const video = document.createElement('video');
    window.shadowDiscoveryFixture.video = video;
    shadow.append(video);
  });
  await expectLateVideo(site);

  // Restart the real content entrypoint after teardown. Its listeners must
  // belong to the new registry, including roots that already contain videos.
  await serviceWorker.evaluate(
    async ({ url, file }) => {
      const [tab] = await chrome.tabs.query({ url });
      if (tab?.id == null) {
        throw new Error('Fixture tab is missing');
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Runtime inspection only; no WXT-only modules in the test runner.
          const engine: unknown = Reflect.get(globalThis, '__OSVSC_ENGINE__');
          if (
            engine &&
            typeof engine === 'object' &&
            'destroy' in engine &&
            typeof engine.destroy === 'function'
          ) {
            engine.destroy();
          }
        },
      });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
    },
    { url: site.url(), file: CONTENT_SCRIPT_FILE },
  );
  await expectLateVideo(site);
});
