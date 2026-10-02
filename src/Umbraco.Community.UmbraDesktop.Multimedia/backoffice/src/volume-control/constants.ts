/**
 * Every number Volume Control needs in more than one place. Separate from the element so the
 * manifest can read the content size without pulling the app into the bundle's main chunk.
 */
import { CHANNELS } from '../shared/mixer.js';

/** The width of one column: a fader, its name on two lines, its level and its Mute box. In px. */
export const VOLUME_COLUMN_WIDTH_PX = 76;

/** The gap between columns, in px. */
export const VOLUME_COLUMN_GAP_PX = 4;

/** The app's own padding, in px. */
export const VOLUME_PADDING_PX = 8;

/** The height of a column's name, room for two lines, in px. */
export const VOLUME_NAME_HEIGHT_PX = 34;

/** The height of a column's level and of its Mute box, each, in px. */
export const VOLUME_ROW_HEIGHT_PX = 22;

/** The shortest a fader can be and still be dragged with some precision, in px. */
export const VOLUME_MIN_FADER_PX = 80;

/** Every column side by side, which is the width the window needs. */
const WIDTH = CHANNELS.length * VOLUME_COLUMN_WIDTH_PX + (CHANNELS.length - 1) * VOLUME_COLUMN_GAP_PX + VOLUME_PADDING_PX * 2;

/** The content box Volume Control opens at: every column, with faders long enough to set precisely. */
export const VOLUME_CONTENT_SIZE = { w: WIDTH, h: 280 } as const;

/**
 * The smallest content box: every column still side by side, since a mixer missing a column hides a
 * volume, and the shortest fader under the name, the level and the Mute box.
 */
export const VOLUME_MIN_CONTENT_SIZE = {
  w: WIDTH,
  h: VOLUME_PADDING_PX * 2 + VOLUME_NAME_HEIGHT_PX + VOLUME_ROW_HEIGHT_PX * 2 + VOLUME_MIN_FADER_PX + 12,
} as const;
