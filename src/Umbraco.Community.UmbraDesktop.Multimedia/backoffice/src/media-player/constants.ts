/**
 * Every number Media Player needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of each of the three bars: the toolbar, the seek bar and the transport. In px. */
export const PLAYER_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const PLAYER_PADDING_PX = 6;

/** The smallest the screen is allowed to get, in px: enough to see that something is playing. */
export const PLAYER_MIN_SCREEN_HEIGHT_PX = 90;

/**
 * How far the arrow keys skip, in seconds. Five, as most web players do: far enough to get past a
 * sentence, short enough not to lose the thread.
 */
export const PLAYER_SKIP_SECONDS = 5;

/**
 * The content box Media Player opens at: a 16:9 picture about 500px wide over its three bars, so a
 * video opens at a size it can be watched at without maximizing.
 */
export const PLAYER_CONTENT_SIZE = { w: 520, h: 400 } as const;

/**
 * The smallest content box: the transport's buttons, the time and a usable volume slider on one row,
 * and a screen above the bars that still shows a picture.
 */
export const PLAYER_MIN_CONTENT_SIZE = {
  w: 360,
  h: PLAYER_BAR_HEIGHT_PX * 3 + PLAYER_PADDING_PX * 5 + PLAYER_MIN_SCREEN_HEIGHT_PX,
} as const;
