/**
 * Every number Sound Recorder needs in more than one place. Separate from the element so the
 * manifest can read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of the counter row and of the transport, in px. */
export const RECORDER_BAR_HEIGHT_PX = 32;

/** The app's own padding, and the gap between its rows, in px. */
export const RECORDER_PADDING_PX = 6;

/** The smallest the wave display is allowed to get, in px: enough to see the trace move. */
export const RECORDER_MIN_WAVE_HEIGHT_PX = 60;

/**
 * The longest a recording may be, in seconds: ten minutes. A quick clip, a voice-over or a spoken
 * introduction, not a dictation machine, and a recording is held in memory until it is kept. Windows
 * 98's Sound Recorder stopped at sixty seconds; ten minutes is generous by its standard.
 */
export const RECORDER_MAX_SECONDS = 600;

/** The content box Sound Recorder opens at: a wide, shallow window, as a sound recorder has always been. */
export const RECORDER_CONTENT_SIZE = { w: 440, h: 260 } as const;

/**
 * The smallest content box: the transport's five buttons on one row, the counter and the name
 * beside it, and a wave display above that still shows a trace.
 */
export const RECORDER_MIN_CONTENT_SIZE = {
  w: 340,
  h: RECORDER_BAR_HEIGHT_PX * 3 + RECORDER_PADDING_PX * 5 + RECORDER_MIN_WAVE_HEIGHT_PX,
} as const;
