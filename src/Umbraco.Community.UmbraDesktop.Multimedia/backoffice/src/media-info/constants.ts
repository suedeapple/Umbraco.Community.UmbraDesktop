/**
 * Every number Media Info needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of the toolbar, in px. */
export const INFO_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const INFO_PADDING_PX = 6;

/** The content box Media Info opens at: a photo's every fact, file to place, without scrolling. */
export const INFO_CONTENT_SIZE = { w: 420, h: 480 } as const;

/**
 * The smallest content box: the toolbar on one row, and a few facts above the fold. The facts scroll,
 * so below this they would still be there, in a slot too small to read.
 */
export const INFO_MIN_CONTENT_SIZE = { w: 300, h: INFO_BAR_HEIGHT_PX + INFO_PADDING_PX * 3 + 140 } as const;
