/**
 * Every number Picture Viewer needs in more than one place. Separate from the element so the
 * manifest can read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of the toolbar and of the status bar, in px. */
export const VIEWER_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const VIEWER_PADDING_PX = 6;

/** The smallest the screen is allowed to get, in px: enough to tell one picture from the next. */
export const VIEWER_MIN_SCREEN_HEIGHT_PX = 90;

/**
 * How long a slideshow shows each picture, in ms. Three seconds, as Windows' photo viewers did at
 * their default speed: long enough to take a picture in, short enough to feel like a slideshow.
 */
export const VIEWER_SLIDESHOW_MS = 3000;

/** The content box Picture Viewer opens at: a 4:3 screen about 550px wide over its two bars. */
export const VIEWER_CONTENT_SIZE = { w: 560, h: 480 } as const;

/**
 * The smallest content box: the toolbar's Open button and its seven icon buttons on one row, and a
 * screen between the two bars that still shows a picture.
 */
export const VIEWER_MIN_CONTENT_SIZE = {
  w: 360,
  h: VIEWER_BAR_HEIGHT_PX * 2 + VIEWER_PADDING_PX * 4 + VIEWER_MIN_SCREEN_HEIGHT_PX,
} as const;
