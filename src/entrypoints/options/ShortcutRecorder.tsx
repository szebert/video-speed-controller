// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { visualHotkeyParts } from '../../core/hotkey-format';
import { t } from '@/i18n/t';
import { cn } from '@/lib/utils';
import { hotkeyBindingFromEvent, type HotkeyBinding } from '../../settings/hotkey-binding';

export function ShortcutRecorder({
  id,
  label,
  binding,
  muted,
  disabled,
  recording,
  layoutMap,
  onRecordingChange,
  onAssign,
  onUnbind,
  onCancel,
  onBrowserTookShortcut,
}: {
  id: string;
  label: string;
  binding: HotkeyBinding | null;
  muted: boolean;
  disabled: boolean;
  recording: boolean;
  layoutMap?: ReadonlyMap<string, string>;
  onRecordingChange: (recording: boolean) => void;
  onAssign: (binding: HotkeyBinding) => void;
  onUnbind: () => void;
  onCancel: () => void;
  onBrowserTookShortcut: () => void;
}) {
  const armedRef = useRef(true);
  const fromKeyboardRef = useRef(false);
  const onAssignRef = useRef(onAssign);
  const onUnbindRef = useRef(onUnbind);
  const onCancelRef = useRef(onCancel);
  const onBrowserTookShortcutRef = useRef(onBrowserTookShortcut);
  const onRecordingChangeRef = useRef(onRecordingChange);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onAssignRef.current = onAssign;
    onUnbindRef.current = onUnbind;
    onCancelRef.current = onCancel;
    onBrowserTookShortcutRef.current = onBrowserTookShortcut;
    onRecordingChangeRef.current = onRecordingChange;
  }, [onAssign, onUnbind, onCancel, onBrowserTookShortcut, onRecordingChange]);

  useEffect(() => {
    if (!recording) {
      return;
    }
    armedRef.current = !fromKeyboardRef.current;
    const arm = (): void => {
      armedRef.current = true;
    };
    const timer = window.setTimeout(arm, 0);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Tab') {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
        onRecordingChangeRef.current(false);
        return;
      }
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (!armedRef.current && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        return;
      }
      if (event.code === 'Backspace' || event.code === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        onUnbindRef.current();
        onRecordingChangeRef.current(false);
        return;
      }
      const next = hotkeyBindingFromEvent(event);
      if (!next) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onAssignRef.current(next);
      onRecordingChangeRef.current(false);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Enter' || event.code === 'Space') {
        arm();
      }
    };

    const onWindowBlur = (event: Event): void => {
      if (event.target instanceof Element) {
        return;
      }
      onBrowserTookShortcutRef.current();
      onRecordingChangeRef.current(false);
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        onBrowserTookShortcutRef.current();
        onRecordingChangeRef.current(false);
      }
    };

    const cancelIfLeaving = (next: EventTarget | null): void => {
      if (next instanceof Node && groupRef.current?.contains(next)) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      onCancelRef.current();
      onRecordingChangeRef.current(false);
    };

    const onFocusOut = (event: FocusEvent): void => {
      cancelIfLeaving(event.relatedTarget);
    };

    const onPointerDown = (event: PointerEvent): void => {
      cancelIfLeaving(event.target);
    };

    const button = buttonRef.current;
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibility);
    button?.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      button?.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [recording]);

  const parts = binding ? visualHotkeyParts(binding, { layoutMap }) : [];

  return (
    <ButtonGroup ref={groupRef}>
      <Button
        ref={buttonRef}
        id={id}
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${t('hotkeyRecord')}: ${label}`}
        aria-pressed={recording}
        data-recording={recording || undefined}
        isDisabled={disabled}
        className="min-w-40 justify-center"
        onPress={(event) => {
          if (recording || disabled) {
            return;
          }
          fromKeyboardRef.current = event.pointerType === 'keyboard';
          onRecordingChange(true);
        }}
      >
        {recording ? (
          t('hotkeyPressShortcut')
        ) : binding ? (
          <KbdGroup>
            {parts.map((part) => (
              <Kbd key={part} className={cn(muted && 'opacity-70')}>
                {part}
              </Kbd>
            ))}
          </KbdGroup>
        ) : (
          <span className="text-muted-foreground">{t('hotkeyNone')}</span>
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`${t('hotkeyRemove')}: ${label}`}
        isDisabled={disabled || !binding}
        onPress={() => {
          onUnbind();
          if (recording) {
            onRecordingChange(false);
          }
        }}
      >
        <Trash2Icon />
      </Button>
    </ButtonGroup>
  );
}
