// SPDX-License-Identifier: GPL-3.0-only

import { expect, openOptions, test } from './extension';

test('theme menu follows the menu-button keyboard and dismissal contract', async ({
  openExtensionPopup,
}) => {
  const popup = await openExtensionPopup();
  const trigger = popup.getByRole('button', { name: 'Change theme' });

  await trigger.focus();
  await popup.keyboard.press('ArrowDown');
  const dark = popup.getByRole('menuitemradio', { name: 'Dark' });
  await expect(dark).toBeFocused();
  await popup.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(popup.getByRole('menu')).toBeHidden();

  await trigger.click();
  await expect(popup.getByRole('menuitemradio', { name: 'System' })).toBeVisible();
  await trigger.click();
  await expect(popup.getByRole('menu')).toBeHidden();

  await trigger.focus();
  await popup.keyboard.press('ArrowUp');
  await expect(popup.getByRole('menuitemradio', { name: 'System' })).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('menu')).toBeHidden();
});

test('options tabs use automatic activation and arrow keys', async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  const playback = options.getByRole('tab', { name: 'Playback', exact: true });
  await playback.focus();
  await options.keyboard.press('ArrowRight');
  const overlay = options.getByRole('tab', { name: 'Overlay', exact: true });
  await expect(overlay).toHaveAttribute('aria-selected', 'true');
  await expect(overlay).toBeFocused();
  await options.keyboard.press('End');
  await expect(options.getByRole('tab', { name: 'Hotkeys', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await options.keyboard.press('Home');
  await expect(playback).toHaveAttribute('aria-selected', 'true');
  await expect(options.getByRole('tabpanel', { name: 'Playback' })).toBeVisible();
});

test('dragging a default-speed slider keeps that range through the gesture', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  const slider = options.getByRole('slider', { name: 'Default speed', exact: true });
  await slider.scrollIntoViewIfNeeded();
  await slider.evaluate((element) => {
    (globalThis as { __optionsSlider?: Element }).__optionsSlider = element;
  });
  const box = await slider.boundingBox();
  if (!box) {
    throw new Error('Default speed slider has no box');
  }
  const y = box.y + box.height / 2;
  await options.mouse.move(box.x + Math.min(8, box.width / 10), y);
  await options.mouse.down();
  await options.mouse.move(box.x + box.width * 0.8, y, { steps: 12 });
  await options.mouse.up();
  const moved = await slider.evaluate((element) => ({
    same: element === (globalThis as { __optionsSlider?: Element }).__optionsSlider,
    value: Number((element as HTMLInputElement).value),
  }));
  expect(moved.same).toBe(true);
  expect(moved.value).toBeGreaterThan(2);
});

test('a destructive confirm focuses Cancel and backdrop dismiss returns focus', async ({
  context,
  extensionId,
}) => {
  const options = await openOptions(context, extensionId);
  const reset = options.getByRole('button', { name: 'Reset defaults', exact: true });
  await reset.click();
  const dialog = options.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await options.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
  await expect(reset).toBeFocused();
});
