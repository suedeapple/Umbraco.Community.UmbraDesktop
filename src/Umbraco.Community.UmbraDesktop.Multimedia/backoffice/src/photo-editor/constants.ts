/**
 * Every number Photo Editor needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of the toolbar, of the options bar under it, and of the status bar, in px. */
export const EDITOR_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const EDITOR_PADDING_PX = 6;

/** The smallest the picture's well may get, in px: enough to draw a crop on. */
export const EDITOR_MIN_WELL_HEIGHT_PX = 100;

/**
 * How many edits undo keeps. Each is the whole picture as it was, megabytes for a photograph, so
 * twenty is generous for fixing a photo and still bounded (transform.ts says why it must be).
 */
export const EDITOR_UNDO_STEPS = 20;

/** The quality a JPEG or WebP is saved at: the browsers' own default for a photo worth keeping. */
export const EDITOR_SAVE_QUALITY = 0.92;

/** The content box Photo Editor opens at: a 4:3 well about 600px wide under its bars. */
export const EDITOR_CONTENT_SIZE = { w: 640, h: 520 } as const;

/**
 * The smallest content box: the toolbar's three file buttons and seven tools on one row, the options
 * bar a crop or resize shows, and a well to draw a crop in.
 */
export const EDITOR_MIN_CONTENT_SIZE = {
  w: 500,
  h: EDITOR_BAR_HEIGHT_PX * 3 + EDITOR_PADDING_PX * 5 + EDITOR_MIN_WELL_HEIGHT_PX,
} as const;
