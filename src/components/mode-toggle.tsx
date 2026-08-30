// SPDX-License-Identifier: GPL-3.0-only

import { i18n } from '#i18n';
import { MoonIcon, SunIcon } from 'lucide-react';
import type { Selection } from 'react-aria-components';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ThemePreference } from '@/settings/theme';

const THEME_KEYS = ['dark', 'light', 'system'] as const;

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') {
      return;
    }
    const [key] = [...keys];
    if (isThemePreference(key)) {
      setTheme(key);
    }
  };

  return (
    <DropdownMenuTrigger>
      <Button variant="ghost" size="icon" aria-label={i18n.t('changeTheme')}>
        <SunIcon data-icon="inline-start" className="dark:hidden" />
        <MoonIcon data-icon="inline-start" className="hidden dark:block" />
      </Button>
      <DropdownMenu
        aria-label={i18n.t('changeTheme')}
        className="min-w-36"
        placement="bottom end"
        selectionMode="single"
        selectedKeys={new Set([theme])}
        onSelectionChange={onSelectionChange}
      >
        {THEME_KEYS.map((key) => (
          <DropdownMenuItem key={key} id={key} textValue={themeLabel(key)}>
            {themeLabel(key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}

function themeLabel(key: ThemePreference): string {
  if (key === 'dark') {
    return i18n.t('themeDark');
  }
  if (key === 'light') {
    return i18n.t('themeLight');
  }
  return i18n.t('themeSystem');
}
