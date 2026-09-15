// SPDX-License-Identifier: GPL-3.0-only

import { t } from '@/i18n/t';
import logoUrl from '@/assets/logo.svg';

export function AppTitle() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src={logoUrl}
        alt=""
        width={24}
        height={24}
        className="size-6 shrink-0"
        aria-hidden="true"
      />
      <h1 className="text-sm font-semibold [text-box:trim-both_cap_alphabetic]">
        {t('popupTitle')}
      </h1>
    </div>
  );
}
