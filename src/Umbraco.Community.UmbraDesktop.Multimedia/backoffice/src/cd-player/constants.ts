/**
 * Every number CD Player needs in more than one place. Separate from the element so the manifest can
 * read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of the toolbar and of the transport, in px. */
export const CD_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const CD_PADDING_PX = 6;

/** Height of the display: the track number, its name and the time, in px. */
export const CD_DISPLAY_HEIGHT_PX = 64;

/** The shortest the track list may get, in px: two tracks still in view. */
export const CD_MIN_LIST_HEIGHT_PX = 56;

/**
 * How far into a track Previous starts it again rather than going back a track, in seconds. Three,
 * as CD players and every music app since have done.
 */
export const CD_RESTART_SECONDS = 3;

/** The content box CD Player opens at: the display and transport over a list of about eight tracks. */
export const CD_CONTENT_SIZE = { w: 380, h: 400 } as const;

/** The smallest content box: the transport's seven buttons on one row, the display, and two tracks. */
export const CD_MIN_CONTENT_SIZE = {
  w: 320,
  h: CD_BAR_HEIGHT_PX * 2 + CD_DISPLAY_HEIGHT_PX + CD_MIN_LIST_HEIGHT_PX + CD_PADDING_PX * 5,
} as const;
