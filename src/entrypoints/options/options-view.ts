// SPDX-License-Identifier: GPL-3.0-only

import {
  containsAllSitesAccess,
  removeAllSitesAccess,
  requestAllSitesAccess,
} from '@/access/site-access';
import {
  isJumpPercentAction,
  JUMP_PERCENT_ACTIONS,
  JUMP_PERCENT_BY_ACTION,
  type JumpPercentAction,
} from '@/core/controller-action';
import { readKeyboardLayoutMap, visualHotkeyParts } from '@/core/hotkey-format';
import {
  canAdjustSpeed,
  formatSpeed,
  isFixedSpeedPolicy,
  sliderBounds,
  sliderValue,
  snapSliderSpeed,
  SPEED_MAX_SETTING_MAX,
  SPEED_MAX_SETTING_MIN,
  SPEED_MIN_SETTING_MAX,
  SPEED_MIN_SETTING_MIN,
  SPEED_SLIDER_STEP,
  SPEED_STEP_SETTING_MAX,
  SPEED_STEP_SETTING_MIN,
} from '@/core/speed';
import { t, type MessageKey } from '@/i18n/t';
import logoUrl from '@/assets/logo.svg';
import { hotkeyBindingFromEvent, type HotkeyBinding } from '@/settings/hotkey-binding';
import {
  canonicalizeFlashOpacity,
  canonicalizeFlashScale,
  canonicalizeHotkeyRepeatRate,
  canonicalizeOverlayOpacity,
  canonicalizeOverlayScale,
  findSameSourceHotkeyConflict,
  findShadowedHotkey,
  FLASH_DELAY_MS_MAX,
  FLASH_DELAY_MS_MIN,
  FLASH_OPACITY_MAX,
  FLASH_OPACITY_MIN,
  FLASH_SCALE_MAX,
  FLASH_SCALE_MIN,
  HOTKEY_REPEAT_DELAY_MS_MAX,
  HOTKEY_REPEAT_DELAY_MS_MIN,
  HOTKEY_REPEAT_RATE_MAX,
  HOTKEY_REPEAT_RATE_MIN,
  OVERLAY_AUTO_HIDE_DELAY_MS_MAX,
  OVERLAY_AUTO_HIDE_DELAY_MS_MIN,
  OVERLAY_OPACITY_MAX,
  OVERLAY_OPACITY_MIN,
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_MIN,
  overlayPositionToGrid,
  SKIP_SECONDS_MAX,
  SKIP_SECONDS_MIN,
  TRANSPORT_RATE_MAGNITUDE_MAX,
  TRANSPORT_RATE_MAGNITUDE_MIN,
  type EditableBehaviorField,
  type OverlayPosition,
  type SettingSource,
  type SiteHotkeyAction,
} from '@/settings/site-behavior';
import type { ThemePreference } from '@/settings/theme';
import { classes, el } from '@/ui/dom';
import type { IconName } from '@/ui/icons';
import { icon } from '@/ui/icons';
import type { ThemeController } from '@/ui/theme-controller';
import {
  button,
  createMenuButton,
  createTabs,
  fieldGroup,
  openConfirmDialog,
  rangeControl,
  switchControl,
} from '@/ui/widgets';
import { formatBackupFileSize, readAndParseBackupFile, type StagedBackupFile } from './backup-file';
import type { OptionsController } from './options-controller';
import {
  handleNumberInputKeyDown,
  numberInputDraftAfterChange,
  numberInputMin,
  ownsOverride,
  POSITION_OPTIONS,
  resetFieldLabel,
  resetToSpeedLabel,
  showsInherited,
  type BooleanBehaviorFieldName,
  type DraftKey,
  type Selection,
} from './options-model';
import {
  nextSiteListSort,
  readStoredSiteListSort,
  sortCustomSites,
  writeStoredSiteListSort,
  type SiteListSort,
} from './site-list-sort';

const FIELD_SPAN = 'lg:col-span-2';
const SITES_HEADING_ID = 'sites-heading';
const ALL_SITES_ID = 'all-sites-access';
const ALL_SITES_HELP = `${ALL_SITES_ID}-help`;
const ALL_SITES_ERROR = `${ALL_SITES_ID}-error`;

const THEME_ICONS = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
} as const satisfies Record<ThemePreference, IconName>;

const AXIS = [4, 8.5, 13] as const;
const POSITION_BOX = 7;
const FRAME_DOTS = [
  [4, 4],
  [9, 4],
  [15, 4],
  [20, 4],
  [20, 9],
  [20, 15],
  [20, 20],
  [15, 20],
  [9, 20],
  [4, 20],
  [4, 15],
  [4, 9],
] as const;

type OptionsTab = 'playback' | 'overlay' | 'navigation' | 'hotkeys';
type OptionsSnapshotState = ReturnType<OptionsController['getState']>;
type ReadyState = OptionsSnapshotState & {
  snapshot: NonNullable<OptionsSnapshotState['snapshot']>;
  behavior: NonNullable<OptionsSnapshotState['behavior']>;
  hotkeys: NonNullable<OptionsSnapshotState['hotkeys']>;
  policy: NonNullable<OptionsSnapshotState['policy']>;
};
type DecimalDraft = Exclude<DraftKey, 'delay' | 'flashDelay' | 'hotkeyRepeatDelay'>;
type SecondsDraft = 'delay' | 'flashDelay' | 'hotkeyRepeatDelay';
type RecordingEnd = 'assign' | 'cancel' | 'unbind' | 'takeover';

const ACTION_LABEL: Record<Exclude<SiteHotkeyAction, JumpPercentAction>, MessageKey> = {
  decreaseSpeed: 'hotkeyDecreaseSpeed',
  increaseSpeed: 'hotkeyIncreaseSpeed',
  resetSpeed: 'hotkeyResetSpeed',
  resetSpeedToOne: 'hotkeyResetSpeedToOne',
  jumpToStart: 'hotkeyJumpToStart',
  rewind: 'hotkeyRewind',
  skipBack: 'hotkeySkipBack',
  playPause: 'hotkeyPlayPause',
  skipForward: 'hotkeySkipForward',
  fastForward: 'hotkeyFastForward',
  jumpToEnd: 'hotkeyJumpToEnd',
};

const HOTKEY_ROWS: readonly { action: SiteHotkeyAction; description: MessageKey }[] = [
  { action: 'decreaseSpeed', description: 'hotkeyDecreaseSpeedDescription' },
  { action: 'increaseSpeed', description: 'hotkeyIncreaseSpeedDescription' },
  { action: 'resetSpeed', description: 'hotkeyResetSpeedDescription' },
  { action: 'resetSpeedToOne', description: 'hotkeyResetSpeedToOneDescription' },
  { action: 'jumpToStart', description: 'hotkeyJumpToStartDescription' },
  { action: 'rewind', description: 'hotkeyRewindDescription' },
  { action: 'skipBack', description: 'hotkeySkipBackDescription' },
  { action: 'playPause', description: 'hotkeyPlayPauseDescription' },
  { action: 'skipForward', description: 'hotkeySkipForwardDescription' },
  { action: 'fastForward', description: 'hotkeyFastForwardDescription' },
  { action: 'jumpToEnd', description: 'hotkeyJumpToEndDescription' },
  ...JUMP_PERCENT_ACTIONS.map((action) => ({
    action,
    description: 'hotkeyJumpToPercentDescription' as const,
  })),
];

function themeLabel(key: ThemePreference): string {
  if (key === 'dark') {
    return t('themeDark');
  }
  if (key === 'light') {
    return t('themeLight');
  }
  return t('themeSystem');
}

function hotkeyActionLabel(action: SiteHotkeyAction): string {
  if (isJumpPercentAction(action)) {
    return t('hotkeyJumpToPercent', [String(JUMP_PERCENT_BY_ACTION[action])]);
  }
  return t(ACTION_LABEL[action]);
}

export function hotkeyConflictMessage(action: SiteHotkeyAction): string {
  return `${t('hotkeyAlreadyUsed')} ${hotkeyActionLabel(action)}.`;
}

export function hotkeyShadowedMessage(action: SiteHotkeyAction): string {
  return `${t('hotkeyShadowed')} ${hotkeyActionLabel(action)}.`;
}

function isOptionsTab(id: string | undefined): id is OptionsTab {
  return id === 'playback' || id === 'overlay' || id === 'navigation' || id === 'hotkeys';
}

function isReady(state: OptionsSnapshotState): state is ReadyState {
  return Boolean(state.ready && state.snapshot && state.behavior && state.hotkeys && state.policy);
}

function formatActivity(lastUsedAt: number): string | undefined {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(lastUsedAt);
  } catch {
    return undefined;
  }
}

function separator(): HTMLElement {
  return el('hr', {
    class: 'shrink-0 border-border',
    attrs: { 'data-slot': 'separator' },
  });
}

function card(title: string, description: string, ...children: Array<Node | null>): HTMLElement {
  return el(
    'div',
    {
      class:
        'flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10',
      attrs: { 'data-slot': 'card' },
    },
    el(
      'div',
      { class: 'grid gap-1 px-4', attrs: { 'data-slot': 'card-header' } },
      el('div', {
        class: 'text-base leading-snug font-medium',
        attrs: { 'data-slot': 'card-title' },
        text: title,
      }),
      el('div', {
        class: 'text-sm text-muted-foreground',
        attrs: { 'data-slot': 'card-description' },
        text: description,
      }),
    ),
    el(
      'div',
      { class: 'flex flex-col gap-4 px-4', attrs: { 'data-slot': 'card-content' } },
      ...children,
    ),
  );
}

function fieldSet(legend: string, ...children: Array<Node | null>): HTMLFieldSetElement {
  return el(
    'fieldset',
    { class: 'flex flex-col gap-4', attrs: { 'data-slot': 'field-set' } },
    el('legend', {
      class: 'sr-only',
      attrs: { 'data-slot': 'field-legend' },
      text: legend,
    }),
    ...children,
  );
}

function optionsFieldGroup(...children: Array<Node | null>): HTMLDivElement {
  const group = fieldGroup(...children);
  group.classList.add('lg:grid', 'lg:grid-cols-2', 'lg:items-start');
  return group;
}

function infoAlert(title: string, description: string): HTMLElement {
  return el(
    'div',
    {
      class: 'grid grid-cols-[auto_1fr] gap-x-2 rounded-lg border bg-card px-2.5 py-2 text-sm',
      attrs: { role: 'alert', 'data-slot': 'alert' },
    },
    icon('info'),
    el('div', { class: 'font-medium', attrs: { 'data-slot': 'alert-title' }, text: title }),
    el('div', {
      class: 'text-sm text-muted-foreground',
      attrs: { 'data-slot': 'alert-description' },
      text: description,
    }),
  );
}

function destructiveAlert(title: string, description: string): HTMLElement {
  return el(
    'div',
    {
      class:
        'grid grid-cols-[auto_1fr] gap-x-2 rounded-lg border bg-card px-2.5 py-2 text-sm text-destructive',
      attrs: { role: 'alert', 'data-slot': 'alert' },
    },
    icon('circle-alert'),
    el('div', { class: 'font-medium', attrs: { 'data-slot': 'alert-title' }, text: title }),
    el('div', { attrs: { 'data-slot': 'alert-description' }, text: description }),
  );
}

function fieldError(id: string, message: string): HTMLElement {
  return el('div', {
    class: 'text-sm font-normal text-destructive',
    attrs: { id, role: 'alert', 'data-slot': 'field-error' },
    text: message,
  });
}

function fieldWarning(message: string): HTMLElement {
  return el('div', {
    class: 'text-sm font-normal text-warning',
    attrs: { role: 'status', 'data-slot': 'field-warning' },
    text: message,
  });
}

function bindSliderKeys(root: HTMLElement): void {
  const input = root.querySelector('input[type="range"]');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  root.addEventListener('keydown', (event) => {
    if (event.target === input) {
      return;
    }
    event.preventDefault();
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: event.key,
        bubbles: false,
        cancelable: true,
      }),
    );
  });
}

function fixedSpeedTrack(): HTMLElement {
  return el(
    'div',
    {
      class: 'relative flex w-full items-center opacity-50',
      attrs: { 'data-slot': 'slider', 'data-disabled': 'true', 'aria-hidden': 'true' },
    },
    el(
      'div',
      {
        class: 'relative h-1 w-full grow overflow-hidden rounded-full bg-muted',
        attrs: { 'data-slot': 'slider-track' },
      },
      el('div', {
        class: 'absolute inset-y-0 start-0 end-0 bg-primary',
        attrs: { 'data-slot': 'slider-range' },
      }),
    ),
    el('div', {
      class:
        'pointer-events-none absolute end-0 top-1/2 size-3 -translate-y-1/2 rounded-full border border-ring bg-white',
      attrs: { 'data-slot': 'slider-thumb' },
    }),
  );
}

export function overlayPositionIcon(
  position: OverlayPosition,
  className = 'size-6 shrink-0',
): SVGSVGElement {
  const { row, column } = overlayPositionToGrid(position);
  const x = AXIS[column];
  const y = AXIS[row];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (x == null || y == null) {
    return svg;
  }
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(POSITION_BOX));
  rect.setAttribute('height', String(POSITION_BOX));
  rect.setAttribute('rx', '1');
  svg.append(rect);
  for (const [dotX, dotY] of FRAME_DOTS) {
    if (dotX < x || dotX > x + POSITION_BOX || dotY < y || dotY > y + POSITION_BOX) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${dotX} ${dotY}h-.01`);
      svg.append(path);
    }
  }
  return svg;
}

function shortcutKeys(parts: readonly string[], muted: boolean): HTMLElement {
  return el(
    'span',
    { class: 'inline-flex items-center gap-1', attrs: { 'data-slot': 'kbd-group' } },
    ...parts.map((part) =>
      el('kbd', {
        class: classes(
          'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground',
          muted && 'opacity-70',
        ),
        attrs: { 'data-slot': 'kbd' },
        text: part,
      }),
    ),
  );
}

export class OptionsView {
  private readonly abort = new AbortController();
  private unsubscribeController: (() => void) | null = null;
  private unsubscribeTheme: (() => void) | null = null;
  private started = false;
  private destroyed = false;
  private rendering = false;
  private sort: SiteListSort = readStoredSiteListSort();
  private activeTab: OptionsTab = 'playback';
  private paneMode: 'settings' | 'behavior' | null = null;
  private recordingAction: SiteHotkeyAction | null = null;
  private recordingFromKeyboard = false;
  private recordingArmed = true;
  private recordingAbort: AbortController | null = null;
  private conflictAction: Partial<Record<SiteHotkeyAction, string>> = {};
  private takeoverAction: SiteHotkeyAction | null = null;
  private layoutMap: ReadonlyMap<string, string> | undefined;
  private staged: StagedBackupFile | null = null;
  private stageRequest = 0;
  private accessStarted = false;
  private accessGeneration = 0;
  private hasAllSitesAccess: boolean | null = null;
  private accessPending = false;
  private accessError: string | null = null;
  private toast: HTMLElement | null = null;
  private toastToken = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: OptionsController,
    private readonly theme: ThemeController,
  ) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.unsubscribeController = this.controller.subscribe(() => {
      this.render();
    });
    this.unsubscribeTheme = this.theme.subscribe(() => {
      this.render();
    });
    void readKeyboardLayoutMap().then((map) => {
      if (this.destroyed || !map) {
        return;
      }
      this.layoutMap = map;
      this.render();
    });
    this.render();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.unsubscribeController?.();
    this.unsubscribeTheme?.();
    this.abort.abort();
    this.stopRecordingListeners();
    if (this.accessStarted) {
      chrome.permissions.onAdded.removeListener(this.onAccessExternal);
      chrome.permissions.onRemoved.removeListener(this.onAccessExternal);
    }
    this.accessGeneration += 1;
    this.toast?.remove();
    this.toast = null;
    this.root.replaceChildren();
  }

  mountResetBadge(spec: {
    active: boolean;
    disabled?: boolean;
    text: string;
    label: string;
    onReset: () => void;
  }): void {
    this.root.replaceChildren(
      this.resetBadge({
        active: spec.active,
        disabled: Boolean(spec.disabled),
        text: spec.text,
        label: spec.label,
        onReset: spec.onReset,
      }),
    );
  }

  /** Mounts only the hotkeys card so shortcut tests can drive it without the page shell. */
  mountHotkeysFixture(state: ReadyState): void {
    this.stopRecordingListeners();
    this.root.replaceChildren(this.hotkeysCard(state));
  }

  private readonly onAccessExternal = (): void => {
    void this.refreshAccess();
  };

  private readonly onAccessVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      void this.refreshAccess();
    }
  };

  private render(): void {
    if (this.destroyed) {
      return;
    }
    const state = this.controller.getState();
    this.notePane(state.selection);
    const active = document.activeElement;
    const activeId =
      active instanceof HTMLElement && active.id && this.root.contains(active) ? active.id : '';
    this.rendering = true;
    this.root.replaceChildren(this.page(state));
    this.rendering = false;
    if (activeId) {
      const next = this.root.querySelector(`#${CSS.escape(activeId)}`);
      if (next instanceof HTMLElement) {
        next.focus({ preventScroll: true });
      }
    }
    this.scrollSelectedSite(state);
    this.syncToast(state);
    this.syncRecording();
  }

  private notePane(selection: Selection): void {
    const mode = selection.kind === 'settings' ? 'settings' : 'behavior';
    if (this.paneMode === 'settings' && mode === 'behavior') {
      this.activeTab = 'playback';
    }
    if (this.paneMode === 'behavior' && mode === 'settings') {
      this.recordingAction = null;
      this.conflictAction = {};
      this.takeoverAction = null;
    }
    this.paneMode = mode;
  }

  private page(state: OptionsSnapshotState): HTMLElement {
    if (!isReady(state)) {
      return el(
        'div',
        { class: 'mx-auto flex max-w-xl flex-col gap-4 p-6' },
        state.error
          ? destructiveAlert(t('settingsLoadError'), state.error)
          : el('p', { text: t('settingsLoading') }),
      );
    }
    const main = el('main', {
      class:
        'min-h-0 min-w-0 w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-none p-6 md:min-w-md md:shrink-0 lg:min-w-0 lg:w-full lg:max-w-4xl lg:shrink',
    });
    main.append(
      el(
        'div',
        { class: 'flex w-full flex-col gap-6' },
        state.selection.kind === 'settings' ? this.settingsPane(state) : this.behaviorPane(state),
      ),
    );
    return el(
      'div',
      { class: 'flex h-full w-full justify-center overflow-hidden overscroll-none' },
      el(
        'div',
        {
          class:
            'flex h-full w-full min-w-0 max-w-md flex-col overflow-hidden md:w-fit md:max-w-none lg:w-full lg:max-w-6xl',
        },
        this.header(),
        separator(),
        el(
          'div',
          {
            class:
              'grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[auto_auto] md:grid-rows-none lg:grid-cols-[auto_minmax(0,1fr)]',
          },
          this.sidebar(state),
          main,
        ),
      ),
    );
  }

  private header(): HTMLElement {
    const theme = this.theme.getState().theme;
    return el(
      'header',
      { class: 'flex shrink-0 items-center justify-between gap-3 p-3' },
      this.title(),
      createMenuButton({
        label: t('changeTheme'),
        icon: THEME_ICONS[theme],
        items: () =>
          (['dark', 'light', 'system'] as const).map((key) => ({
            id: key,
            label: themeLabel(key),
            icon: THEME_ICONS[key],
            checked: this.theme.getState().theme === key,
          })),
        onSelect: (id) => {
          if (id === 'dark' || id === 'light' || id === 'system') {
            this.theme.setTheme(id);
          }
        },
      }),
    );
  }

  private title(): HTMLElement {
    const image = document.createElement('img');
    image.src = logoUrl;
    image.alt = '';
    image.width = 24;
    image.height = 24;
    image.className = 'size-6 shrink-0';
    image.setAttribute('aria-hidden', 'true');
    return el(
      'div',
      { class: 'flex min-w-0 items-center gap-2' },
      image,
      el('h1', {
        class: 'text-sm font-semibold [text-box:trim-both_cap_alphabetic]',
        text: t('popupTitle'),
      }),
    );
  }

  private sidebar(state: ReadyState): HTMLElement {
    const sites = sortCustomSites(state.customSites, this.sort);
    const nameLabel =
      this.sort.mode === 'name' && this.sort.direction === 'desc'
        ? t('settingsSortNameDesc')
        : t('settingsSortNameAsc');
    const recentLabel =
      this.sort.mode === 'recent' && this.sort.direction === 'oldest'
        ? t('settingsSortRecentOldest')
        : t('settingsSortRecentNewest');
    const list =
      sites.length === 0
        ? el('p', {
            class: 'px-2 text-xs text-muted-foreground',
            text: t('settingsNoSites'),
          })
        : el(
            'ul',
            { class: 'flex flex-col gap-1' },
            ...sites.map((site) => {
              const selected =
                state.selection.kind === 'site' && state.selection.hostname === site.hostname;
              return el(
                'li',
                {},
                button(site.hostname, {
                  size: 'sm',
                  variant: selected ? 'default' : 'ghost',
                  class: 'w-full justify-start',
                  disabled: state.pending,
                  attrs: {
                    'aria-current': selected ? 'page' : null,
                    title: formatActivity(site.lastUsedAt),
                  },
                  onClick: () => {
                    void this.controller.selectSite(site.hostname);
                  },
                }),
              );
            }),
          );
    return el(
      'aside',
      {
        class:
          'flex min-h-0 min-w-0 flex-col border-b md:h-full md:w-64 md:shrink-0 md:border-e md:border-b-0',
      },
      el(
        'nav',
        {
          class: 'flex min-h-0 flex-col gap-3 p-3 md:flex-1',
          attrs: { 'aria-label': t('settingsTitle') },
        },
        el(
          'div',
          { class: 'flex shrink-0 flex-col gap-1.5' },
          this.paneButton(t('settingsTitle'), 'settings', state, { kind: 'settings' }),
          this.paneButton(t('settingsDefaults'), 'globe', state, { kind: 'global' }),
        ),
        separator(),
        el(
          'div',
          { class: 'flex min-h-0 flex-col gap-2 md:flex-1' },
          el(
            'div',
            { class: 'flex shrink-0 items-center justify-between gap-1' },
            el(
              'p',
              {
                class: 'flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground',
                attrs: { id: SITES_HEADING_ID },
              },
              icon('list', 'size-3.5'),
              t('settingsSites'),
            ),
            el(
              'div',
              {
                class: 'flex w-fit',
                attrs: { role: 'group', 'aria-label': t('settingsSortSites') },
              },
              button(null, {
                size: 'icon-xs',
                variant: this.sort.mode === 'name' ? 'default' : 'outline',
                icon:
                  this.sort.mode === 'name' && this.sort.direction === 'desc'
                    ? 'arrow-up-z-a'
                    : 'arrow-down-a-z',
                disabled: state.pending,
                attrs: {
                  'aria-label': nameLabel,
                  'aria-pressed': this.sort.mode === 'name' ? 'true' : 'false',
                },
                onClick: () => {
                  this.cycleSort('name');
                },
              }),
              button(null, {
                size: 'icon-xs',
                variant: this.sort.mode === 'recent' ? 'default' : 'outline',
                icon:
                  this.sort.mode === 'recent' && this.sort.direction === 'oldest'
                    ? 'clock-arrow-up'
                    : 'clock-arrow-down',
                disabled: state.pending,
                attrs: {
                  'aria-label': recentLabel,
                  'aria-pressed': this.sort.mode === 'recent' ? 'true' : 'false',
                },
                onClick: () => {
                  this.cycleSort('recent');
                },
              }),
            ),
          ),
          el(
            'div',
            {
              class:
                'max-h-[min(12rem,40svh)] min-h-0 overflow-y-auto overscroll-y-contain md:max-h-none md:flex-1',
              attrs: { role: 'region', 'aria-labelledby': SITES_HEADING_ID },
            },
            list,
          ),
        ),
      ),
    );
  }

  private paneButton(
    label: string,
    iconName: IconName,
    state: ReadyState,
    selection: Selection,
  ): HTMLButtonElement {
    const selected =
      (selection.kind === 'settings' && state.selection.kind === 'settings') ||
      (selection.kind === 'global' && state.selection.kind === 'global');
    return button(label, {
      variant: selected ? 'default' : 'outline',
      icon: iconName,
      class: 'justify-start',
      disabled: state.pending,
      attrs: { 'aria-current': selected ? 'page' : null },
      onClick: () => {
        this.controller.selectPane(selection);
      },
    });
  }

  private cycleSort(mode: SiteListSort['mode']): void {
    this.sort = nextSiteListSort(this.sort, mode);
    writeStoredSiteListSort(this.sort);
    this.render();
  }

  private scrollSelectedSite(state: OptionsSnapshotState): void {
    if (state.selection.kind !== 'site') {
      return;
    }
    const hostname = state.selection.hostname;
    for (const buttonNode of this.root.querySelectorAll('button')) {
      if (buttonNode.textContent === hostname) {
        buttonNode.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return;
      }
    }
  }

  private settingsPane(state: ReadyState): HTMLElement {
    this.ensureAccess();
    return el(
      'div',
      { class: 'flex flex-col gap-6' },
      el(
        'div',
        { class: 'flex flex-col gap-1' },
        el('h2', { class: 'text-lg font-semibold', text: t('settingsTitle') }),
        el('p', {
          class: 'text-sm text-muted-foreground',
          text: t('settingsPageDescription'),
        }),
      ),
      this.allSitesCard(),
      this.backupCards(state),
      card(
        t('resetAllSettings'),
        t('restoreSettingsToDefaults'),
        button(t('resetAllSettings'), {
          variant: 'destructive',
          disabled: state.pending,
          onClick: () => {
            openConfirmDialog({
              title: t('resetAllSettings'),
              description: t('resetAllConfirm'),
              cancelLabel: t('cancel'),
              confirmLabel: t('confirmReset'),
              onConfirm: () => {
                void this.controller.resetAll();
              },
            });
          },
        }),
      ),
    );
  }

  private behaviorPane(state: ReadyState): HTMLElement {
    const selection = state.selection;
    const title = selection.kind === 'site' ? selection.hostname : t('settingsDefaults');
    const description =
      selection.kind === 'site' ? t('settingsSiteDescription') : t('settingsDefaultsDescription');
    const action =
      selection.kind === 'site'
        ? this.confirmIcon(
            t('deleteSiteSettings'),
            t('deleteSiteConfirm'),
            t('confirmDelete'),
            () => {
              void this.controller.deleteSite(selection.hostname);
            },
            state.pending,
          )
        : this.confirmIcon(
            t('resetDefaults'),
            t('resetDefaultsConfirm'),
            t('confirmReset'),
            () => {
              void this.controller.resetDefaults();
            },
            state.pending,
          );
    const form = el(
      'form',
      {
        class: 'flex flex-col gap-6',
        on: {
          submit: (event) => {
            event.preventDefault();
          },
        },
      },
      el(
        'div',
        { class: 'flex flex-col gap-1' },
        el(
          'div',
          { class: 'flex items-center justify-between gap-3' },
          el('h2', { class: 'text-lg font-semibold', text: title }),
          action,
        ),
        el('p', { class: 'text-sm text-muted-foreground', text: description }),
      ),
      this.behaviorTabs(state),
    );
    return form;
  }

  private confirmIcon(
    label: string,
    description: string,
    confirm: string,
    onConfirm: () => void,
    pending: boolean,
  ): HTMLButtonElement {
    return button(null, {
      variant: 'destructive',
      size: 'icon',
      icon: 'trash-2',
      disabled: pending,
      attrs: { 'aria-label': label },
      onClick: () => {
        openConfirmDialog({
          title: label,
          description,
          cancelLabel: t('cancel'),
          confirmLabel: confirm,
          onConfirm,
        });
      },
    });
  }

  private behaviorTabs(state: ReadyState): HTMLElement {
    const tabs = createTabs({
      label: state.selection.kind === 'site' ? t('settingsSite') : t('settingsDefaults'),
      initialId: this.activeTab,
      tabs: [
        {
          id: 'playback',
          label: t('settingsPlayback'),
          icon: 'gauge',
          panel: this.playbackCard(state),
        },
        {
          id: 'overlay',
          label: t('settingsOverlay'),
          icon: 'layers',
          panel: this.overlayCard(state),
        },
        {
          id: 'navigation',
          label: t('settingsNavigation'),
          icon: 'skip-forward',
          panel: this.navigationCard(state),
        },
        {
          id: 'hotkeys',
          label: t('settingsHotkeys'),
          icon: 'keyboard',
          panel: this.hotkeysCard(state),
        },
      ],
    });
    const list = tabs.querySelector('[role="tablist"]');
    const sync = (): void => {
      const selected = list?.querySelector('[role="tab"][aria-selected="true"]');
      const id = selected?.getAttribute('aria-controls')?.replace(/^panel-/, '');
      if (isOptionsTab(id)) {
        this.activeTab = id;
      }
    };
    list?.addEventListener('click', sync);
    list?.addEventListener('keydown', sync);
    return tabs;
  }

  private playbackCard(state: ReadyState): HTMLElement {
    const { behavior, selection } = state;
    return card(
      t('settingsPlayback'),
      t('settingsPlaybackDescription'),
      fieldSet(
        t('settingsPlayback'),
        optionsFieldGroup(
          el(
            'div',
            { class: FIELD_SPAN },
            this.speedControls(state),
            el('p', {
              class: 'mt-2 text-sm text-muted-foreground',
              text: t('currentSpeedResetHint'),
            }),
          ),
          this.sliderField({
            className: FIELD_SPAN,
            label: t('defaultSpeed'),
            description: t('defaultSpeedDescription'),
            labelId: 'default-speed-label',
            helpId: 'default-speed-help',
            ariaLabel: t('defaultSpeed'),
            min: sliderBounds(state.policy).minValue,
            max: sliderBounds(state.policy).maxValue,
            step: SPEED_SLIDER_STEP,
            value: sliderValue(state.defaultSpeed, state.policy),
            disabled: state.pending || isFixedSpeedPolicy(state.policy),
            muted: showsInherited(selection, behavior.defaultSpeed.source),
            readout: formatSpeed(state.defaultSpeed),
            readoutClass: 'w-14',
            resetActive: ownsOverride(selection, behavior.defaultSpeed.source),
            resetText: state.resetBadgeText,
            onReset: () => {
              this.inherit('defaultSpeed');
            },
            onInput: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'defaultSpeed',
                value: snapSliderSpeed(value, state.policy),
              });
            },
            onCommit: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'defaultSpeed',
                value: snapSliderSpeed(value, state.policy),
              });
            },
          }),
          this.boolSwitch(
            state,
            'remember-last-speed',
            'rememberLastSpeed',
            state.pending,
            FIELD_SPAN,
          ),
          this.decimalField(state, {
            id: 'speed-min',
            name: 'speedMin',
            label: t('speedMin'),
            description: t('speedMinDescription'),
            min: SPEED_MIN_SETTING_MIN,
            max: SPEED_MIN_SETTING_MAX,
            step: SPEED_STEP_SETTING_MIN,
            draft: 'speedMin',
            disabled: state.pending,
          }),
          this.decimalField(state, {
            id: 'decrease-speed-step',
            name: 'decreaseSpeedStep',
            label: t('decreaseSpeedStep'),
            description: t('decreaseSpeedStepDescription'),
            min: SPEED_STEP_SETTING_MIN,
            max: SPEED_STEP_SETTING_MAX,
            step: SPEED_STEP_SETTING_MIN,
            draft: 'decreaseSpeedStep',
            disabled: state.pending,
          }),
          this.decimalField(state, {
            id: 'speed-max',
            name: 'speedMax',
            label: t('speedMax'),
            description: t('speedMaxDescription'),
            min: SPEED_MAX_SETTING_MIN,
            max: SPEED_MAX_SETTING_MAX,
            step: 0.05,
            draft: 'speedMax',
            disabled: state.pending,
          }),
          this.decimalField(state, {
            id: 'increase-speed-step',
            name: 'increaseSpeedStep',
            label: t('increaseSpeedStep'),
            description: t('increaseSpeedStepDescription'),
            min: SPEED_STEP_SETTING_MIN,
            max: SPEED_STEP_SETTING_MAX,
            step: SPEED_STEP_SETTING_MIN,
            draft: 'increaseSpeedStep',
            disabled: state.pending,
          }),
        ),
      ),
    );
  }

  private speedControls(state: ReadyState): HTMLElement {
    const policy = state.policy;
    const shown = state.currentSpeed;
    const bounds = sliderBounds(policy);
    const fixed = isFixedSpeedPolicy(policy);
    const locked = state.pending;
    const heading =
      state.selection.kind === 'global' ? t('currentDefaultSpeed') : t('currentSiteSpeed');
    const resetDisabled = !ownsOverride(state.selection, state.behavior.speed.source);
    const slider = fixed
      ? fixedSpeedTrack()
      : rangeControl({
          label: heading,
          min: bounds.minValue,
          max: bounds.maxValue,
          step: SPEED_SLIDER_STEP,
          value: sliderValue(shown, policy),
          disabled: locked,
          onInput: (value) => {
            this.controller.setSpeedPreview(snapSliderSpeed(value, policy));
          },
          onCommit: (value) => {
            this.controller.mutate({
              kind: 'value',
              field: 'speed',
              value: snapSliderSpeed(value, policy),
            });
          },
        });
    if (!fixed) {
      bindSliderKeys(slider);
    }
    return el(
      'div',
      { class: 'flex flex-col gap-3' },
      el(
        'div',
        { class: 'flex items-center justify-between gap-3' },
        el('h2', { class: 'text-sm font-medium', text: heading }),
      ),
      el('div', {
        class: classes(
          'text-center text-3xl font-semibold tabular-nums',
          state.currentSpeedMuted && 'text-muted-foreground',
        ),
        attrs: { 'aria-live': 'polite' },
        text: formatSpeed(shown),
      }),
      el(
        'div',
        { class: 'flex w-full [&>[data-slot=button]]:flex-1' },
        button(null, {
          variant: 'outline',
          icon: 'minus',
          class: 'flex-1',
          disabled: locked || fixed || !canAdjustSpeed(shown, -1, policy),
          attrs: { 'aria-label': t('slower') },
          onClick: () => {
            this.controller.adjustDisplayedSpeed(-1);
          },
        }),
        button(resetToSpeedLabel(state.defaultSpeed), {
          variant: 'outline',
          class: 'flex-1',
          disabled: locked || resetDisabled,
          onClick: () => {
            this.inherit('speed');
          },
        }),
        button(null, {
          variant: 'outline',
          icon: 'plus',
          class: 'flex-1',
          disabled: locked || fixed || !canAdjustSpeed(shown, 1, policy),
          attrs: { 'aria-label': t('faster') },
          onClick: () => {
            this.controller.adjustDisplayedSpeed(1);
          },
        }),
      ),
      el(
        'div',
        { class: 'flex items-center gap-2 text-xs text-muted-foreground' },
        el('span', { text: formatSpeed(policy.min) }),
        slider,
        el('span', { text: formatSpeed(policy.max) }),
      ),
    );
  }

  private overlayCard(state: ReadyState): HTMLElement {
    const { behavior } = state;
    return card(
      t('settingsOverlay'),
      t('settingsOverlayDescription'),
      fieldSet(
        t('settingsOverlay'),
        optionsFieldGroup(
          this.boolSwitch(state, 'overlay-visible', 'overlayVisible', state.pending),
          this.boolSwitch(
            state,
            'overlay-navigation-bar',
            'overlayNavigationBar',
            state.overlayLocked,
          ),
          this.boolSwitch(state, 'overlay-seek-bar', 'overlaySeekBar', state.overlayLocked),
          this.boolSwitch(state, 'overlay-volume-bar', 'overlayVolumeBar', state.overlayLocked),
          this.percentSlider(state, {
            label: t('overlayOpacity'),
            description: t('overlayOpacityDescription'),
            labelId: 'overlay-opacity-label',
            helpId: 'overlay-opacity-help',
            min: OVERLAY_OPACITY_MIN,
            max: OVERLAY_OPACITY_MAX,
            value: behavior.overlayOpacity.value,
            source: behavior.overlayOpacity.source,
            disabled: state.overlayLocked,
            readoutClass: 'w-10',
            onValue: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'overlayOpacity',
                value: canonicalizeOverlayOpacity(value),
              });
            },
            onReset: () => {
              this.inherit('overlayOpacity');
            },
          }),
          this.percentSlider(state, {
            label: t('overlayScale'),
            description: t('overlayScaleDescription'),
            labelId: 'overlay-scale-label',
            helpId: 'overlay-scale-help',
            min: OVERLAY_SCALE_MIN,
            max: OVERLAY_SCALE_MAX,
            value: behavior.overlayScale.value,
            source: behavior.overlayScale.source,
            disabled: state.overlayLocked,
            readoutClass: 'w-12',
            onValue: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'overlayScale',
                value: canonicalizeOverlayScale(value),
              });
            },
            onReset: () => {
              this.inherit('overlayScale');
            },
          }),
          this.positionField(state),
          this.boolSwitch(
            state,
            'overlay-position-button',
            'overlayPositionButton',
            state.overlayLocked,
          ),
          this.boolSwitch(
            state,
            'overlay-settings-button',
            'overlaySettingsButton',
            state.overlayLocked,
          ),
          this.boolSwitch(state, 'overlay-hotkey-hints', 'overlayHotkeyHints', state.overlayLocked),
          this.boolSwitch(state, 'overlay-auto-hide', 'overlayAutoHide', state.overlayLocked),
          this.secondsField(state, {
            id: 'overlay-auto-hide-delay',
            name: 'overlayAutoHideDelay',
            label: t('overlayAutoHideDelay'),
            description: t('overlayAutoHideDelayDescription'),
            min: OVERLAY_AUTO_HIDE_DELAY_MS_MIN / 1000,
            max: OVERLAY_AUTO_HIDE_DELAY_MS_MAX / 1000,
            step: 0.1,
            draft: 'delay',
            fallback: state.delaySeconds,
            source: behavior.overlayAutoHideDelayMs.source,
            disabled: state.delayLocked,
            resetField: 'overlayAutoHideDelayMs',
            onCommit: () => {
              this.controller.commitDelay();
            },
          }),
          this.boolSwitch(state, 'overlay-hover-hold', 'overlayHoverHold', state.delayLocked),
          this.boolSwitch(state, 'button-flash', 'buttonFlash', state.pending),
          this.boolSwitch(state, 'hotkey-flash', 'hotkeyFlash', state.pending),
          this.percentSlider(state, {
            label: t('flashOpacity'),
            description: t('flashOpacityDescription'),
            labelId: 'flash-opacity-label',
            helpId: 'flash-opacity-help',
            min: FLASH_OPACITY_MIN,
            max: FLASH_OPACITY_MAX,
            value: behavior.flashOpacity.value,
            source: behavior.flashOpacity.source,
            disabled: state.flashLocked,
            readoutClass: 'w-10',
            onValue: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'flashOpacity',
                value: canonicalizeFlashOpacity(value),
              });
            },
            onReset: () => {
              this.inherit('flashOpacity');
            },
          }),
          this.percentSlider(state, {
            label: t('flashScale'),
            description: t('flashScaleDescription'),
            labelId: 'flash-scale-label',
            helpId: 'flash-scale-help',
            min: FLASH_SCALE_MIN,
            max: FLASH_SCALE_MAX,
            value: behavior.flashScale.value,
            source: behavior.flashScale.source,
            disabled: state.flashLocked,
            readoutClass: 'w-12',
            onValue: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'flashScale',
                value: canonicalizeFlashScale(value),
              });
            },
            onReset: () => {
              this.inherit('flashScale');
            },
          }),
        ),
        this.secondsField(state, {
          id: 'flash-delay',
          name: 'flashDelay',
          label: t('flashDelay'),
          description: t('flashDelayDescription'),
          min: FLASH_DELAY_MS_MIN / 1000,
          max: FLASH_DELAY_MS_MAX / 1000,
          step: 0.1,
          draft: 'flashDelay',
          fallback: state.flashDelaySeconds,
          source: behavior.flashDelayMs.source,
          disabled: state.flashLocked,
          resetField: 'flashDelayMs',
          onCommit: () => {
            this.controller.commitFlashDelay();
          },
        }),
      ),
    );
  }

  private navigationCard(state: ReadyState): HTMLElement {
    return card(
      t('settingsNavigation'),
      t('settingsNavigationDescription'),
      fieldSet(
        t('settingsNavigation'),
        optionsFieldGroup(
          this.decimalField(state, {
            id: 'skip-back-seconds',
            name: 'skipBackSeconds',
            label: t('skipBackSeconds'),
            description: t('skipBackSecondsDescription'),
            min: SKIP_SECONDS_MIN,
            max: SKIP_SECONDS_MAX,
            step: 0.5,
            draft: 'skipBackSeconds',
            disabled: state.pending,
          }),
          this.decimalField(state, {
            id: 'skip-forward-seconds',
            name: 'skipForwardSeconds',
            label: t('skipForwardSeconds'),
            description: t('skipForwardSecondsDescription'),
            min: SKIP_SECONDS_MIN,
            max: SKIP_SECONDS_MAX,
            step: 0.5,
            draft: 'skipForwardSeconds',
            disabled: state.pending,
          }),
          this.boolSwitch(
            state,
            'skip-scale-with-playback-rate',
            'skipScaleWithPlaybackRate',
            state.pending,
            FIELD_SPAN,
          ),
          this.decimalField(state, {
            id: 'fast-forward-speed',
            name: 'fastForwardSpeed',
            label: t('fastForwardSpeed'),
            description: t('fastForwardSpeedDescription'),
            min: TRANSPORT_RATE_MAGNITUDE_MIN,
            max: TRANSPORT_RATE_MAGNITUDE_MAX,
            step: 0.25,
            draft: 'fastForwardSpeed',
            disabled: state.pending,
          }),
          this.decimalField(state, {
            id: 'rewind-speed',
            name: 'rewindSpeed',
            label: t('rewindSpeed'),
            description: t('rewindSpeedDescription'),
            min: TRANSPORT_RATE_MAGNITUDE_MIN,
            max: TRANSPORT_RATE_MAGNITUDE_MAX,
            step: 0.25,
            draft: 'rewindSpeed',
            disabled: state.pending,
            absolute: true,
          }),
        ),
      ),
    );
  }

  private hotkeysCard(state: ReadyState): HTMLElement {
    return card(
      t('settingsHotkeys'),
      t('settingsHotkeysDescription'),
      fieldSet(
        t('settingsHotkeys'),
        optionsFieldGroup(
          this.boolSwitch(
            state,
            'hotkey-consume-matched-keys',
            'hotkeyConsumeMatchedKeys',
            state.pending,
            FIELD_SPAN,
          ),
          this.boolSwitch(state, 'hotkey-repeat', 'hotkeyRepeat', state.pending, FIELD_SPAN),
          this.secondsField(state, {
            id: 'hotkey-repeat-delay',
            name: 'hotkeyRepeatDelay',
            label: t('hotkeyRepeatDelay'),
            description: t('hotkeyRepeatDelayDescription'),
            min: HOTKEY_REPEAT_DELAY_MS_MIN / 1000,
            max: HOTKEY_REPEAT_DELAY_MS_MAX / 1000,
            step: 0.1,
            draft: 'hotkeyRepeatDelay',
            fallback: state.hotkeyRepeatDelaySeconds,
            source: state.behavior.hotkeyRepeatDelayMs.source,
            disabled: state.hotkeyRepeatLocked,
            resetField: 'hotkeyRepeatDelayMs',
            onCommit: () => {
              this.controller.commitHotkeyRepeatDelay();
            },
          }),
          this.sliderField({
            label: t('hotkeyRepeatRate'),
            description: t('hotkeyRepeatRateDescription'),
            labelId: 'hotkey-repeat-rate-label',
            helpId: 'hotkey-repeat-rate-help',
            ariaLabel: t('hotkeyRepeatRate'),
            min: HOTKEY_REPEAT_RATE_MIN,
            max: HOTKEY_REPEAT_RATE_MAX,
            step: 0.5,
            value: state.behavior.hotkeyRepeatRate.value,
            disabled: state.hotkeyRepeatLocked,
            muted: showsInherited(state.selection, state.behavior.hotkeyRepeatRate.source),
            readout: `${state.behavior.hotkeyRepeatRate.value}/sec`,
            readoutClass: 'w-14',
            resetActive: ownsOverride(state.selection, state.behavior.hotkeyRepeatRate.source),
            resetText: state.resetBadgeText,
            onReset: () => {
              this.inherit('hotkeyRepeatRate');
            },
            onInput: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'hotkeyRepeatRate',
                value: canonicalizeHotkeyRepeatRate(value),
              });
            },
            onCommit: (value) => {
              this.controller.mutate({
                kind: 'value',
                field: 'hotkeyRepeatRate',
                value: canonicalizeHotkeyRepeatRate(value),
              });
            },
          }),
          ...HOTKEY_ROWS.map((row) => this.hotkeyRow(state, row.action, row.description)),
        ),
      ),
    );
  }

  private hotkeyRow(
    state: ReadyState,
    action: SiteHotkeyAction,
    description: MessageKey,
  ): HTMLElement {
    const setting = state.hotkeys[action];
    const label = hotkeyActionLabel(action);
    const conflict = this.conflictAction[action];
    const shadowedBy = findShadowedHotkey(state.hotkeys, action);
    const takeover = this.takeoverAction === action;
    const helpId = `hotkey-${action}-help`;
    return el(
      'div',
      {
        class: classes('flex w-full min-w-0 flex-row items-start gap-2', FIELD_SPAN),
        attrs: {
          role: 'group',
          'data-slot': 'field',
          'data-orientation': 'horizontal',
          'data-disabled': state.pending ? 'true' : null,
          'data-invalid': conflict ? 'true' : null,
          'data-warning': !conflict && (shadowedBy || takeover) ? 'true' : null,
        },
      },
      el(
        'div',
        {
          class: 'flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5',
          attrs: { 'data-slot': 'field-content' },
        },
        el('label', {
          class: 'text-sm font-medium',
          attrs: { for: `hotkey-${action}`, 'data-slot': 'field-label' },
          text: label,
        }),
        el('p', {
          class: 'text-sm text-muted-foreground',
          attrs: { id: helpId, 'data-slot': 'field-description' },
          text: t(description),
        }),
        conflict ? fieldError(`${helpId}-error`, conflict) : null,
        !conflict && shadowedBy ? fieldWarning(hotkeyShadowedMessage(shadowedBy)) : null,
        takeover && !conflict && !shadowedBy ? fieldWarning(t('hotkeyBrowserTookShortcut')) : null,
      ),
      el(
        'div',
        { class: 'flex max-w-full flex-wrap-reverse items-center justify-end gap-2' },
        this.resetBadge({
          active: ownsOverride(state.selection, setting.source),
          disabled: state.pending,
          text: state.resetBadgeText,
          label: resetFieldLabel(label),
          onReset: () => {
            this.clearRowStatus(action);
            this.controller.mutateHotkey({ kind: 'hotkey-inherit', action });
          },
        }),
        this.shortcutRecorder(
          state,
          action,
          label,
          setting.value,
          showsInherited(state.selection, setting.source),
        ),
      ),
    );
  }

  private shortcutRecorder(
    state: ReadyState,
    action: SiteHotkeyAction,
    label: string,
    binding: HotkeyBinding | null,
    muted: boolean,
  ): HTMLElement {
    const recording = this.recordingAction === action;
    const record = button(recording ? t('hotkeyPressShortcut') : null, {
      variant: 'outline',
      size: 'sm',
      class: 'min-w-40 justify-center',
      disabled: state.pending,
      attrs: {
        id: `hotkey-${action}`,
        'aria-label': `${t('hotkeyRecord')}: ${label}`,
        'aria-pressed': recording ? 'true' : 'false',
        'data-recording': recording ? 'true' : null,
      },
      onClick: () => {
        if (this.recordingAction === action || record.disabled) {
          return;
        }
        this.recordingFromKeyboard = false;
        this.beginRecording(action);
      },
    });
    if (!recording && binding) {
      record.append(shortcutKeys(visualHotkeyParts(binding, { layoutMap: this.layoutMap }), muted));
    } else if (!recording) {
      record.append(el('span', { class: 'text-muted-foreground', text: t('hotkeyNone') }));
    }
    record.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      if (this.recordingAction === action || record.disabled) {
        return;
      }
      event.preventDefault();
      this.recordingFromKeyboard = true;
      this.beginRecording(action);
    });
    const remove = button(null, {
      variant: 'outline',
      size: 'icon-sm',
      icon: 'trash-2',
      disabled: state.pending || !binding,
      attrs: { 'aria-label': `${t('hotkeyRemove')}: ${label}` },
      onClick: () => {
        this.clearRowStatus(action);
        if (this.recordingAction === action) {
          this.recordingAction = null;
        }
        this.controller.mutateHotkey({ kind: 'hotkey-value', action, value: null });
        this.render();
      },
    });
    return el(
      'div',
      { class: 'flex w-fit', attrs: { 'data-shortcut-group': action } },
      record,
      remove,
    );
  }

  private beginRecording(action: SiteHotkeyAction): void {
    this.clearRowStatus(action);
    this.recordingAction = action;
    const current = document.getElementById(`hotkey-${action}`);
    if (current instanceof HTMLElement) {
      current.dataset.recording = 'true';
      current.setAttribute('aria-pressed', 'true');
    }
    this.render();
  }

  private syncRecording(): void {
    if (!this.recordingAction) {
      this.stopRecordingListeners();
      return;
    }
    if (this.recordingAbort) {
      return;
    }
    this.bindRecording(this.recordingAction);
  }

  private stopRecordingListeners(): void {
    this.recordingAbort?.abort();
    this.recordingAbort = null;
  }

  private bindRecording(action: SiteHotkeyAction): void {
    this.stopRecordingListeners();
    const abort = new AbortController();
    this.recordingAbort = abort;
    const { signal } = abort;
    this.recordingArmed = !this.recordingFromKeyboard;
    const timer = window.setTimeout(() => {
      this.recordingArmed = true;
    }, 0);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
    });
    const groupOf = (): Element | null =>
      document.querySelector(`[data-shortcut-group="${action}"]`);
    const insideGroup = (target: EventTarget | null): boolean =>
      target instanceof Node && Boolean(groupOf()?.contains(target));
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'Tab') {
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.finishRecording(action, 'cancel');
          return;
        }
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        if (!this.recordingArmed && (event.code === 'Enter' || event.code === 'Space')) {
          event.preventDefault();
          return;
        }
        if (event.code === 'Backspace' || event.code === 'Delete') {
          event.preventDefault();
          event.stopPropagation();
          this.finishRecording(action, 'unbind');
          return;
        }
        const next = hotkeyBindingFromEvent(event);
        if (!next) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.finishRecording(action, 'assign', next);
      },
      { capture: true, signal },
    );
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.code === 'Enter' || event.code === 'Space') {
          this.recordingArmed = true;
        }
      },
      { capture: true, signal },
    );
    window.addEventListener(
      'blur',
      (event) => {
        if (event.target instanceof Element) {
          return;
        }
        this.finishRecording(action, 'takeover');
      },
      { signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          this.finishRecording(action, 'takeover');
        }
      },
      { signal },
    );
    document.addEventListener(
      'focusout',
      (event) => {
        if (!insideGroup(event.target)) {
          return;
        }
        if (document.visibilityState !== 'visible' || insideGroup(event.relatedTarget)) {
          return;
        }
        this.finishRecording(action, 'cancel');
      },
      { capture: true, signal },
    );
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (insideGroup(event.target) || document.visibilityState !== 'visible') {
          return;
        }
        this.finishRecording(action, 'cancel');
      },
      { capture: true, signal },
    );
  }

  private finishRecording(
    action: SiteHotkeyAction,
    kind: RecordingEnd,
    binding?: HotkeyBinding,
  ): void {
    if (this.recordingAction === action) {
      this.recordingAction = null;
    }
    if (kind === 'assign' && binding) {
      this.assignHotkey(action, binding);
    } else if (kind === 'cancel') {
      this.clearRowStatus(action);
    } else if (kind === 'unbind') {
      this.clearRowStatus(action);
      this.controller.mutateHotkey({ kind: 'hotkey-value', action, value: null });
    } else if (kind === 'takeover') {
      if (Object.prototype.hasOwnProperty.call(this.conflictAction, action)) {
        const next = { ...this.conflictAction };
        delete next[action];
        this.conflictAction = next;
      }
      this.takeoverAction = action;
    }
    this.render();
  }

  private assignHotkey(action: SiteHotkeyAction, binding: HotkeyBinding): void {
    const state = this.controller.getState();
    if (!state.hotkeys) {
      return;
    }
    const source = state.selection.kind === 'site' ? 'site' : 'global';
    const conflict = findSameSourceHotkeyConflict(state.hotkeys, action, binding, source);
    if (conflict) {
      this.conflictAction = { ...this.conflictAction, [action]: hotkeyConflictMessage(conflict) };
      if (this.takeoverAction === action) {
        this.takeoverAction = null;
      }
      return;
    }
    this.clearRowStatus(action);
    this.controller.mutateHotkey({ kind: 'hotkey-value', action, value: binding });
  }

  private clearRowStatus(action: SiteHotkeyAction): void {
    if (Object.prototype.hasOwnProperty.call(this.conflictAction, action)) {
      const next = { ...this.conflictAction };
      delete next[action];
      this.conflictAction = next;
    }
    if (this.takeoverAction === action) {
      this.takeoverAction = null;
    }
  }

  private boolSwitch(
    state: ReadyState,
    id: string,
    field: BooleanBehaviorFieldName,
    disabled: boolean,
    className?: string,
  ): HTMLElement {
    const setting = state.behavior[field];
    return this.switchField({
      id,
      name: field,
      label: t(field),
      description: t(`${field}Description` as MessageKey),
      checked: setting.value,
      source: setting.source,
      disabled,
      selection: state.selection,
      resetText: state.resetBadgeText,
      className,
      onChange: (selected) => {
        this.controller.mutate({ kind: 'value', field, value: selected });
      },
      onReset: () => {
        this.inherit(field);
      },
    });
  }

  private switchField(spec: {
    id: string;
    name: string;
    label: string;
    description: string;
    checked: boolean;
    source: SettingSource;
    disabled: boolean;
    selection: Selection;
    resetText: string;
    className?: string;
    onChange: (checked: boolean) => void;
    onReset: () => void;
  }): HTMLElement {
    const helpId = `${spec.id}-help`;
    const input = switchControl({
      id: spec.id,
      name: spec.name,
      describedBy: helpId,
      checked: spec.checked,
      disabled: spec.disabled,
      onChange: spec.onChange,
    });
    const shell = input.parentElement;
    if (shell && showsInherited(spec.selection, spec.source)) {
      shell.classList.add('data-selected:bg-muted-foreground');
    }
    return el(
      'div',
      {
        class: classes('flex w-full min-w-0 flex-row items-start gap-2', spec.className),
        attrs: {
          role: 'group',
          'data-slot': 'field',
          'data-orientation': 'horizontal',
          'data-disabled': spec.disabled ? 'true' : null,
        },
      },
      el(
        'div',
        {
          class: 'flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5',
          attrs: { 'data-slot': 'field-content' },
        },
        el('label', {
          class: 'flex w-fit gap-2 text-sm leading-snug font-medium',
          attrs: { for: spec.id, 'data-slot': 'field-label' },
          text: spec.label,
        }),
        el('p', {
          class: 'text-sm text-muted-foreground',
          attrs: { id: helpId, 'data-slot': 'field-description' },
          text: spec.description,
        }),
      ),
      el(
        'div',
        { class: 'flex max-w-full flex-wrap-reverse items-center justify-end gap-2' },
        this.resetBadge({
          active: ownsOverride(spec.selection, spec.source),
          disabled: spec.disabled,
          text: spec.resetText,
          label: resetFieldLabel(spec.label),
          onReset: spec.onReset,
        }),
        shell,
      ),
    );
  }

  private decimalField(
    state: ReadyState,
    spec: {
      id: string;
      name: string;
      label: string;
      description: string;
      min: number;
      max: number;
      step: number;
      draft: DecimalDraft;
      disabled?: boolean;
      absolute?: boolean;
      className?: string;
    },
  ): HTMLElement {
    const setting = state.behavior[spec.draft];
    const numeric = setting.value;
    const shown = spec.absolute ? Math.abs(numeric) : numeric;
    const draft = state.drafts[spec.draft];
    return this.numberField({
      id: spec.id,
      name: spec.name,
      label: spec.label,
      description: spec.description,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: draft ?? String(shown),
      disabled: Boolean(spec.disabled),
      muted: showsInherited(state.selection, setting.source, draft),
      resetActive: ownsOverride(state.selection, setting.source),
      resetLabel: resetFieldLabel(spec.label),
      className: spec.className,
      onDraft: (value) => {
        this.controller.updateDraft(spec.draft, value);
      },
      onCommit: () => {
        const current = this.controller.getState().behavior?.[spec.draft];
        if (!current) {
          return;
        }
        this.controller.commitDecimal(spec.draft, current.value, spec.min, spec.max);
      },
      onReset: () => {
        this.inherit(spec.draft);
      },
    });
  }

  private secondsField(
    state: ReadyState,
    spec: {
      id: string;
      name: string;
      label: string;
      description: string;
      min: number;
      max: number;
      step: number;
      draft: SecondsDraft;
      fallback: string;
      source: SettingSource;
      disabled?: boolean;
      resetField: 'overlayAutoHideDelayMs' | 'flashDelayMs' | 'hotkeyRepeatDelayMs';
      onCommit: () => void;
      className?: string;
    },
  ): HTMLElement {
    const draft = state.drafts[spec.draft];
    return this.numberField({
      id: spec.id,
      name: spec.name,
      label: spec.label,
      description: spec.description,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: draft ?? spec.fallback,
      disabled: Boolean(spec.disabled),
      muted: showsInherited(state.selection, spec.source, draft),
      resetActive: ownsOverride(state.selection, spec.source),
      resetLabel: resetFieldLabel(spec.label),
      className: spec.className,
      onDraft: (value) => {
        this.controller.updateDraft(spec.draft, value);
      },
      onCommit: spec.onCommit,
      onReset: () => {
        this.inherit(spec.resetField);
      },
    });
  }

  private numberField(spec: {
    id: string;
    name: string;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    value: string;
    disabled: boolean;
    muted: boolean;
    resetActive: boolean;
    resetLabel: string;
    className?: string;
    onDraft: (value: string) => void;
    onCommit: () => void;
    onReset: () => void;
  }): HTMLElement {
    const helpId = `${spec.id}-help`;
    const input = el('input', {
      class: classes(
        'min-w-0 flex-1 border-0 bg-transparent shadow-none outline-none',
        spec.muted && 'text-muted-foreground',
      ),
      attrs: {
        id: spec.id,
        name: spec.name,
        type: 'number',
        inputmode: 'decimal',
        enterkeyhint: 'done',
        min: numberInputMin(spec.min, spec.step),
        max: spec.max,
        step: spec.step,
        autocomplete: 'off',
        'aria-describedby': helpId,
        'data-slot': 'input-group-control',
      },
    });
    input.value = spec.value;
    input.disabled = spec.disabled;
    this.bindNumberInput(input, spec);
    return el(
      'div',
      {
        class: classes('flex w-full flex-col gap-2', spec.className),
        attrs: {
          role: 'group',
          'data-slot': 'field',
          'data-disabled': spec.disabled ? 'true' : null,
        },
      },
      el('label', {
        class: 'text-sm font-medium',
        attrs: { for: spec.id, 'data-slot': 'field-label' },
        text: spec.label,
      }),
      el(
        'div',
        {
          class:
            'relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input px-2',
          attrs: { 'data-slot': 'input-group' },
        },
        input,
        this.numberReset(spec),
      ),
      el('p', {
        class: 'text-sm text-muted-foreground',
        attrs: { id: helpId, 'data-slot': 'field-description' },
        text: spec.description,
      }),
    );
  }

  private bindNumberInput(
    input: HTMLInputElement,
    spec: {
      value: string;
      min: number;
      max: number;
      step: number;
      onDraft: (value: string) => void;
      onCommit: () => void;
    },
  ): void {
    input.addEventListener('input', () => {
      const next = numberInputDraftAfterChange(
        spec.value,
        input.value,
        spec.min,
        spec.max,
        spec.step,
      );
      if (next !== input.value) {
        input.value = next;
      }
      spec.onDraft(next);
    });
    input.addEventListener('keydown', (event) => {
      handleNumberInputKeyDown(
        event,
        input.value,
        spec.min,
        spec.max,
        spec.step,
        (next) => {
          input.value = next;
          spec.onDraft(next);
        },
        spec.onCommit,
      );
    });
    input.addEventListener('blur', () => {
      if (this.rendering) {
        return;
      }
      spec.onCommit();
    });
  }

  private numberReset(spec: {
    resetActive: boolean;
    disabled: boolean;
    resetLabel: string;
    onReset: () => void;
  }): HTMLButtonElement | null {
    if (!spec.resetActive) {
      return null;
    }
    return button(null, {
      variant: 'ghost',
      size: 'icon-xs',
      icon: 'x',
      disabled: spec.disabled,
      class:
        'data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50',
      attrs: { 'aria-label': spec.resetLabel },
      onClick: spec.onReset,
    });
  }

  private percentSlider(
    state: ReadyState,
    spec: {
      label: string;
      description: string;
      labelId: string;
      helpId: string;
      min: number;
      max: number;
      value: number;
      source: SettingSource;
      disabled: boolean;
      readoutClass: string;
      onValue: (value: number) => void;
      onReset: () => void;
      className?: string;
    },
  ): HTMLElement {
    return this.sliderField({
      className: spec.className,
      label: spec.label,
      description: spec.description,
      labelId: spec.labelId,
      helpId: spec.helpId,
      ariaLabel: spec.label,
      min: spec.min,
      max: spec.max,
      step: 1,
      value: spec.value,
      disabled: spec.disabled,
      muted: showsInherited(state.selection, spec.source),
      readout: `${spec.value}%`,
      readoutClass: spec.readoutClass,
      resetActive: ownsOverride(state.selection, spec.source),
      resetText: state.resetBadgeText,
      onReset: spec.onReset,
      onInput: spec.onValue,
      onCommit: spec.onValue,
    });
  }

  private sliderField(spec: {
    label: string;
    description: string;
    labelId: string;
    helpId: string;
    ariaLabel: string;
    min: number;
    max: number;
    step: number;
    value: number;
    disabled: boolean;
    muted: boolean;
    readout: string;
    readoutClass: string;
    resetActive: boolean;
    resetText: string;
    className?: string;
    onInput: (value: number) => void;
    onCommit: (value: number) => void;
    onReset: () => void;
  }): HTMLElement {
    const slider = rangeControl({
      label: spec.ariaLabel,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: spec.value,
      disabled: spec.disabled,
      onInput: spec.onInput,
      onCommit: spec.onCommit,
    });
    bindSliderKeys(slider);
    return el(
      'div',
      {
        class: classes('flex w-full flex-col gap-2', spec.className),
        attrs: {
          role: 'group',
          'data-slot': 'field',
          'data-disabled': spec.disabled ? 'true' : null,
        },
      },
      el(
        'div',
        { class: 'flex items-start justify-between gap-2' },
        el(
          'div',
          {
            class: 'flex flex-1 flex-col gap-0.5',
            attrs: { 'data-slot': 'field-content' },
          },
          el('div', {
            class: 'text-sm font-medium',
            attrs: { id: spec.labelId, 'data-slot': 'field-label' },
            text: spec.label,
          }),
          el('p', {
            class: 'text-sm text-muted-foreground',
            attrs: { id: spec.helpId, 'data-slot': 'field-description' },
            text: spec.description,
          }),
        ),
        this.resetBadge({
          active: spec.resetActive,
          disabled: spec.disabled,
          text: spec.resetText,
          label: resetFieldLabel(spec.label),
          onReset: spec.onReset,
        }),
      ),
      el(
        'div',
        { class: 'flex items-center gap-3' },
        slider,
        el('span', {
          class: classes(
            'shrink-0 text-right text-sm tabular-nums',
            spec.readoutClass,
            spec.muted && 'text-muted-foreground',
          ),
          text: spec.readout,
        }),
      ),
    );
  }

  private positionField(state: ReadyState): HTMLElement {
    const source = state.behavior.overlayPosition.source;
    const inherited = showsInherited(state.selection, source);
    const locked = state.overlayLocked;
    const selectedClass = inherited
      ? 'data-selected:bg-muted data-selected:text-muted-foreground'
      : 'data-selected:bg-accent';
    const radios = el('div', {
      class: 'grid grid-cols-3 gap-2',
      attrs: {
        role: 'radiogroup',
        'data-slot': 'radio-group',
        'aria-label': t('overlayPosition'),
        'aria-describedby': 'overlay-position-help',
      },
    });
    for (const option of POSITION_OPTIONS) {
      const input = el('input', {
        class: 'sr-only',
        attrs: {
          type: 'radio',
          name: 'overlayPosition',
          value: String(option.value),
        },
      });
      input.checked = state.behavior.overlayPosition.value === option.value;
      input.disabled = locked;
      const commit = (): void => {
        if (input.disabled) {
          return;
        }
        this.controller.mutate({
          kind: 'value',
          field: 'overlayPosition',
          value: option.value,
        });
      };
      input.addEventListener('change', () => {
        if (input.checked) {
          commit();
        }
      });
      const choice = el(
        'label',
        {
          class: classes(
            'flex items-center justify-center gap-2 rounded-md border border-border px-2 py-2 text-center text-xs',
            selectedClass,
          ),
          attrs: input.checked ? { 'data-selected': 'true' } : undefined,
        },
        input,
        overlayPositionIcon(option.value),
        t(option.labelKey),
      );
      choice.addEventListener('click', () => {
        if (input.disabled || input.checked) {
          return;
        }
        input.checked = true;
        commit();
      });
      radios.append(choice);
    }
    return el(
      'div',
      {
        class: classes('flex w-full flex-col gap-2', FIELD_SPAN),
        attrs: {
          role: 'group',
          'data-slot': 'field',
          'data-disabled': locked ? 'true' : null,
        },
      },
      el(
        'div',
        { class: 'flex items-start justify-between gap-2' },
        el(
          'div',
          {
            class: 'flex flex-1 flex-col gap-0.5',
            attrs: { 'data-slot': 'field-content' },
          },
          el('div', {
            class: 'text-sm font-medium',
            attrs: { 'data-slot': 'field-label' },
            text: t('overlayPosition'),
          }),
          el('p', {
            class: 'text-sm text-muted-foreground',
            attrs: { id: 'overlay-position-help', 'data-slot': 'field-description' },
            text: t('overlayPositionDescription'),
          }),
        ),
        this.resetBadge({
          active: ownsOverride(state.selection, source),
          disabled: locked,
          text: state.resetBadgeText,
          label: resetFieldLabel(t('overlayPosition')),
          onReset: () => {
            this.inherit('overlayPosition');
          },
        }),
      ),
      radios,
    );
  }

  private resetBadge(spec: {
    active: boolean;
    disabled: boolean;
    text: string;
    label: string;
    onReset: () => void;
  }): HTMLElement {
    const isDisabled = spec.disabled || !spec.active;
    return el(
      'span',
      {
        class: classes(
          'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent bg-secondary px-2 py-0.5 text-xs font-medium whitespace-nowrap text-secondary-foreground select-none',
          !spec.active && 'invisible pointer-events-none',
          isDisabled && 'bg-muted text-muted-foreground opacity-50',
        ),
        attrs: {
          'data-slot': 'reset-badge',
          'data-active': spec.active ? 'true' : null,
          'data-disabled': isDisabled ? 'true' : null,
        },
      },
      spec.text,
      el(
        'span',
        { class: classes('inline-flex', isDisabled && 'cursor-not-allowed') },
        button(null, {
          variant: 'ghost',
          size: 'icon-xs',
          icon: 'x',
          disabled: isDisabled,
          class: 'size-4 rounded-full disabled:opacity-100',
          attrs: { 'aria-label': spec.label },
          onClick: () => {
            if (!isDisabled) {
              spec.onReset();
            }
          },
        }),
      ),
    );
  }

  private inherit(field: EditableBehaviorField): void {
    this.controller.mutate({ kind: 'inherit', field });
  }

  private allSitesCard(): HTMLElement {
    const known = this.hasAllSitesAccess !== null;
    const disabled = this.accessPending || !known;
    const input = switchControl({
      id: ALL_SITES_ID,
      name: 'allSitesAccess',
      describedBy: this.accessError ? `${ALL_SITES_HELP} ${ALL_SITES_ERROR}` : ALL_SITES_HELP,
      checked: this.hasAllSitesAccess === true,
      disabled,
      onChange: (enabled) => {
        const grant =
          enabled && this.hasAllSitesAccess !== true ? requestAllSitesAccess() : undefined;
        this.onAllSitesToggle(enabled, grant);
      },
    });
    if (this.accessError) {
      input.setAttribute('aria-invalid', 'true');
    }
    return card(
      t('enableOnAllSites'),
      t('enableOnAllSitesDescription'),
      infoAlert(t('allSitesAccessAlertTitle'), t('allSitesAccessAlertDescription')),
      fieldGroup(
        el(
          'div',
          {
            class: 'flex min-w-0 flex-row items-start gap-2',
            attrs: {
              role: 'group',
              'data-slot': 'field',
              'data-orientation': 'horizontal',
              'data-disabled': disabled ? 'true' : null,
              'data-invalid': this.accessError ? 'true' : null,
            },
          },
          el(
            'div',
            {
              class: 'flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5',
              attrs: { 'data-slot': 'field-content' },
            },
            el('label', {
              class: 'text-sm font-medium',
              attrs: { for: ALL_SITES_ID, 'data-slot': 'field-label' },
              text: t('enableOnAllSites'),
            }),
            el('p', {
              class: 'text-sm text-muted-foreground',
              attrs: { id: ALL_SITES_HELP, 'data-slot': 'field-description' },
              text: t('allSitesAccessSwitchDescription'),
            }),
            this.accessError ? fieldError(ALL_SITES_ERROR, this.accessError) : null,
          ),
          input.parentElement,
        ),
      ),
    );
  }

  private ensureAccess(): void {
    if (this.accessStarted) {
      return;
    }
    this.accessStarted = true;
    window.addEventListener('focus', this.onAccessExternal, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', this.onAccessVisibility, {
      signal: this.abort.signal,
    });
    chrome.permissions.onAdded.addListener(this.onAccessExternal);
    chrome.permissions.onRemoved.addListener(this.onAccessExternal);
    void this.refreshAccess();
  }

  private async refreshAccess(): Promise<void> {
    const generation = ++this.accessGeneration;
    try {
      const granted = await containsAllSitesAccess();
      if (generation !== this.accessGeneration || this.destroyed) {
        return;
      }
      this.hasAllSitesAccess = granted;
      this.accessError = null;
    } catch {
      if (generation !== this.accessGeneration || this.destroyed) {
        return;
      }
      this.accessError = t('allSitesAccessError');
    }
    this.render();
  }

  private onAllSitesToggle(enabled: boolean, grant?: Promise<boolean>): void {
    this.accessError = null;
    this.accessPending = true;
    this.render();
    void this.finishAllSitesToggle(enabled, grant);
  }

  private async finishAllSitesToggle(enabled: boolean, grant?: Promise<boolean>): Promise<void> {
    try {
      if (enabled) {
        const granted = await (grant ?? requestAllSitesAccess());
        if (!granted) {
          await this.refreshAccess();
          return;
        }
      } else {
        await removeAllSitesAccess();
      }
      await this.refreshAccess();
    } catch {
      await this.refreshAccess();
      if (!this.destroyed) {
        this.accessError = t('allSitesAccessError');
        this.render();
      }
    } finally {
      this.accessPending = false;
      if (!this.destroyed) {
        this.render();
      }
    }
  }

  private backupCards(state: ReadyState): HTMLElement {
    const fileInput = el('input', {
      class: 'sr-only',
      attrs: { type: 'file', accept: 'application/json,.json', tabindex: '-1' },
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      this.stageFile(file);
    });
    const staged = this.staged;
    const attachmentState = staged?.status === 'error' ? 'error' : staged ? 'done' : 'idle';
    const ready = staged?.status === 'ready';
    return el(
      'div',
      { class: 'flex flex-col gap-6' },
      card(
        t('exportSettings'),
        t('exportSettingsDescription'),
        button(t('exportSettings'), {
          variant: 'outline',
          disabled: state.pending,
          onClick: () => {
            void this.controller.exportBackup();
          },
        }),
      ),
      card(
        t('importSettings'),
        t('importSettingsDescription'),
        fileInput,
        button(t('importSettings'), {
          variant: 'outline',
          disabled: state.pending,
          onClick: () => {
            fileInput.click();
          },
        }),
        el(
          'div',
          {
            class: 'w-fit rounded-xl',
            attrs: { 'aria-label': t('importDropzone') },
            on: {
              dragover: (event) => {
                if (state.pending) {
                  return;
                }
                event.preventDefault();
              },
              drop: (event) => {
                event.preventDefault();
                if (!(event instanceof DragEvent) || state.pending) {
                  return;
                }
                this.stageFile(event.dataTransfer?.files[0]);
              },
            },
          },
          el(
            'div',
            {
              class: classes(
                'flex w-fit max-w-full min-w-40 items-center gap-2 rounded-xl border bg-card p-2 text-sm text-card-foreground',
                attachmentState === 'idle' && 'border-dashed',
                attachmentState === 'error' && 'border-destructive/30',
              ),
              attrs: {
                'data-slot': 'attachment',
                'data-state': attachmentState,
              },
            },
            el(
              'div',
              {
                class: 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted',
                attrs: { 'data-slot': 'attachment-media' },
              },
              icon('file-json'),
            ),
            el(
              'div',
              { class: 'min-w-0 flex-1', attrs: { 'data-slot': 'attachment-content' } },
              el('span', {
                class: 'block truncate font-medium',
                attrs: { 'data-slot': 'attachment-title' },
                text: staged?.fileName ?? t('noBackupFile'),
              }),
              el('span', {
                class: classes(
                  'mt-0.5 block text-xs text-muted-foreground',
                  staged?.status === 'error' && 'whitespace-normal',
                ),
                attrs: { 'data-slot': 'attachment-description' },
                text:
                  staged?.status === 'error'
                    ? staged.error
                    : staged
                      ? `${t('backupFileType')} · ${formatBackupFileSize(staged.byteLength)}`
                      : t('backupFileType'),
              }),
            ),
            button(null, {
              variant: 'ghost',
              size: 'icon-xs',
              icon: 'x',
              disabled: state.pending || !staged,
              attrs: { 'aria-label': t('removeBackupFile'), 'data-slot': 'attachment-action' },
              onClick: () => {
                this.clearStaged();
              },
            }),
          ),
        ),
        el(
          'div',
          {
            class: 'flex w-fit',
            attrs: { role: 'group', 'aria-label': t('importBackupActions') },
          },
          button(t('importMerge'), {
            variant: 'outline',
            disabled: state.pending || !ready,
            onClick: () => {
              this.confirmImport('merge');
            },
          }),
          button(t('importReplace'), {
            variant: 'outline',
            disabled: state.pending || !ready,
            onClick: () => {
              this.confirmImport('replace');
            },
          }),
        ),
      ),
    );
  }

  private confirmImport(mode: 'merge' | 'replace'): void {
    if (this.staged?.status !== 'ready') {
      return;
    }
    openConfirmDialog({
      title: mode === 'replace' ? t('importReplace') : t('importMerge'),
      description: mode === 'replace' ? t('importReplaceConfirm') : t('importMergeConfirm'),
      cancelLabel: t('cancel'),
      confirmLabel: t('confirmImport'),
      destructive: mode === 'replace',
      onConfirm: () => {
        if (this.staged?.status !== 'ready') {
          return;
        }
        const backupText = this.staged.backupText;
        void this.controller.importBackup(mode, backupText).then((imported) => {
          if (imported) {
            this.clearStaged();
          }
        });
      },
    });
  }

  private stageFile(file: File | undefined): void {
    if (!file || this.controller.getState().pending) {
      return;
    }
    const requestId = ++this.stageRequest;
    void readAndParseBackupFile(file).then((next) => {
      if (requestId !== this.stageRequest || this.destroyed) {
        return;
      }
      this.staged = next;
      this.render();
    });
  }

  private clearStaged(): void {
    this.stageRequest += 1;
    this.staged = null;
    this.render();
  }

  private syncToast(state: OptionsSnapshotState): void {
    const feedback = state.feedback;
    if (!feedback) {
      this.toast?.remove();
      this.toast = null;
      this.toastToken = 0;
      return;
    }
    if (this.toast && this.toastToken === feedback.token) {
      return;
    }
    this.toast?.remove();
    this.toastToken = feedback.token;
    this.toast = el('div', {
      attrs: {
        'data-slot': 'toast',
        'data-sonner-toast': '',
        role: feedback.level === 'error' ? 'alert' : 'status',
      },
      text: feedback.message,
    });
    document.body.append(this.toast);
  }
}
