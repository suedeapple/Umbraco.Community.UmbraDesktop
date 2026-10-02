import { CaptureElement } from './capture.element.js';
import type { CaptureConfig } from './capture.element.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';

/** The screen, as Windows' Snipping Tool: screenshots as PNG, so text stays sharp, and screen recordings. */
const SNIPPING_TOOL: CaptureConfig = {
  from: 'screen',
  channel: 'snippingtool',
  photo: { type: 'image/png', extension: 'png' },
  terms: {
    photo: ['snipPhoto', 'New screenshot'],
    record: ['snipRecord', 'Record screen'],
    empty: ['snipEmpty', 'Select New screenshot to capture a screen, a window or a tab, or Record screen to record one.'],
    photoName: ['snipPhotoName', 'Screenshot'],
    videoName: ['snipVideoName', 'Screen recording'],
    problems: {
      denied: ['snipDenied', 'Screen capture is not allowed in this browser.'],
      missing: ['snipMissing', 'There was nothing to capture.'],
      insecure: ['snipInsecure', 'The browser only allows screen capture when the backoffice is on HTTPS.'],
      unavailable: ['snipUnavailable', 'The screen could not be captured.'],
    },
  },
};

/**
 * Snipping Tool, as a self-contained UmbraDesktop app: a screenshot, or a recording, of a screen, a
 * window or a tab, then downloaded or added to the media library. Everything but what makes it the
 * Snipping Tool is {@link CaptureElement}, which Camera shares.
 *
 * The browser's own picker chooses what is captured, every time: a web page cannot see the screen
 * any other way, and the picker is the person's guarantee of that. For a whole screen, the desktop
 * itself is in the shot; for a tidier one, share a window or a tab.
 */
@customElement('umbradesktop-snipping-tool')
export class SnippingToolElement extends CaptureElement {
  /** What makes this the Snipping Tool. */
  protected readonly config = SNIPPING_TOOL;
}

export { SnippingToolElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-snipping-tool': SnippingToolElement;
  }
}
