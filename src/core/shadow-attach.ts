// SPDX-License-Identifier: GPL-3.0-only

/** Fired in the page world after `Element.attachShadow`. Composed so it crosses shadow roots. */
export const SHADOW_ATTACHED_EVENT = 'osvsc-shadow-attached';

/**
 * Wrap the page's `attachShadow`. Content scripts do not share `Element.prototype`
 * with the page, so this has to run in the page world. Existing declarative
 * roots are found by the normal discovery walk; this covers a root created
 * later on any valid shadow host.
 *
 * The strings live inside the function. `chrome.scripting.executeScript` sends
 * only this function's source, so it cannot read module bindings.
 */
export function installAttachShadowHook(): void {
  const eventName = 'osvsc-shadow-attached';
  const hookMark = 'osvscHooked';
  const prototype = Element.prototype;
  const current = prototype.attachShadow;
  if (Reflect.get(current, hookMark) === true) {
    return;
  }
  const apply = Reflect.apply;
  const dispatch = EventTarget.prototype.dispatchEvent;
  const ShadowAttachedEvent = CustomEvent;
  function attachShadow(this: Element, init: ShadowRootInit): ShadowRoot {
    const root: ShadowRoot = apply(current, this, [init]);
    try {
      apply(dispatch, this, [
        new ShadowAttachedEvent(eventName, { bubbles: true, composed: true }),
      ]);
    } catch {
      // Discovery is best-effort. A notification failure must not turn a
      // successful page attachShadow call into an exception.
    }
    return root;
  }
  Reflect.set(attachShadow, hookMark, true);
  prototype.attachShadow = attachShadow;
}
