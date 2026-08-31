// SPDX-License-Identifier: GPL-3.0-only

import overlayCss from './overlay.css?inline';

export { overlayCss };

export function createOverlaySheet(): CSSStyleSheet | null {
  if (
    typeof CSSStyleSheet === 'undefined' ||
    typeof CSSStyleSheet.prototype.replaceSync !== 'function'
  ) {
    return null;
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(overlayCss);
  return sheet;
}

const overlaySheet = createOverlaySheet();

export function applyOverlayStyles(shadow: ShadowRoot): void {
  if (overlaySheet && Array.isArray(shadow.adoptedStyleSheets)) {
    try {
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, overlaySheet];
      if (shadow.adoptedStyleSheets.includes(overlaySheet)) {
        return;
      }
    } catch {
      // jsdom can expose the property without applying constructable sheets.
    }
  }
  const style = shadow.ownerDocument.createElement('style');
  style.textContent = overlayCss;
  shadow.append(style);
}
