/**
 * Every number Camera and Snipping Tool need in more than one place. Separate from the elements so
 * the manifest can read the content sizes without pulling the apps into the bundle's main chunk.
 */

/** Height of the toolbar and of the row of keeping actions, in px. */
export const CAPTURE_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const CAPTURE_PADDING_PX = 6;

/** The smallest the screen showing the preview or the result may get, in px. */
export const CAPTURE_MIN_SCREEN_HEIGHT_PX = 90;

/**
 * The longest a video may be, in seconds: ten minutes, as for Sound Recorder, since a recording is
 * held in memory until it is kept, and video is far heavier than sound.
 */
export const CAPTURE_MAX_SECONDS = 600;

/** The quality a camera photo is saved at as a JPEG: the browsers' own default for a photo worth keeping. */
export const CAPTURE_PHOTO_QUALITY = 0.92;

/** Rows under the screen: the toolbar, the keeping row and the status line, with the gaps between. */
const CHROME_HEIGHT = CAPTURE_BAR_HEIGHT_PX * 2 + (CAPTURE_BAR_HEIGHT_PX - 8) + CAPTURE_PADDING_PX * 5;

/** The content box Camera opens at: a 16:9 preview about 540px wide. */
export const CAMERA_CONTENT_SIZE = { w: 560, h: 320 + CHROME_HEIGHT } as const;

/** The content box Snipping Tool opens at: smaller, since what it shows is a screen at a glance. */
export const SNIPPING_CONTENT_SIZE = { w: 520, h: 280 + CHROME_HEIGHT } as const;

/** The smallest content box either takes: the toolbar's three buttons and the keeping row on one line each. */
export const CAPTURE_MIN_CONTENT_SIZE = { w: 420, h: CAPTURE_MIN_SCREEN_HEIGHT_PX + CHROME_HEIGHT } as const;
