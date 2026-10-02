/**
 * What Sound Recorder saves a recording as, and what it calls it.
 *
 * A browser records in the one or two formats it has, and Umbraco chooses a media type by a file's
 * extension, so the format asked for and the extension written have to agree. Pure functions, so the
 * rules can be tested without a microphone.
 */

/** A format to record in: the type to ask `MediaRecorder` for, and the extension to save it with. */
export interface RecordingFormat {
  /** The MIME type, or empty to take the browser's default. */
  mimeType: string;
  /** The file extension, without the dot. */
  extension: string;
}

/**
 * The formats asked for, best first. Opus is the codec every current browser but Safari records,
 * small and clear for speech; which container it comes in differs. Safari records only AAC in MP4.
 */
const FORMATS: RecordingFormat[] = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'weba' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'oga' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
];

/**
 * The format to record in.
 * @param isSupported `MediaRecorder.isTypeSupported`, or a test's stand-in for it.
 * @returns The first format the browser supports, or its own default when it names none of them.
 */
export function recordingFormat(isSupported: (mimeType: string) => boolean): RecordingFormat {
  return FORMATS.find((format) => isSupported(format.mimeType)) ?? { mimeType: '', extension: 'weba' };
}

/**
 * The extension for a type the browser recorded, which may not be the one asked for.
 *
 * WebM sound is saved as `.weba`, never `.webm`: Umbraco's own Audio media type accepts `weba`,
 * `oga`, `opus` and `mp3`, and files `webm` under Video, where a recording would show as a film
 * with no picture. An unknown or missing type is taken for WebM, Chrome's default.
 * @param mimeType The type, parameters and all.
 * @returns The extension, without the dot.
 */
export function extensionFor(mimeType: string): string {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  return { 'audio/ogg': 'oga', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[type] ?? 'weba';
}

/**
 * A new recording's name: the word for one, and when it was made, to the second. Hyphens rather
 * than colons in the time, since the name is also the file's, and a file name on Windows cannot hold
 * a colon.
 * @param word The localised word for a recording.
 * @param when When it was made.
 * @returns The name.
 */
export function recordingName(word: string, when: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
  const time = `${two(when.getHours())}-${two(when.getMinutes())}-${two(when.getSeconds())}`;
  return `${word} ${date} ${time}`;
}

/**
 * The file name a recording is saved or downloaded under: its name, with the characters a file name
 * on Windows cannot hold replaced by hyphens, and its extension.
 * @param name The recording's name, as typed.
 * @param extension The extension, without the dot.
 * @returns The file name.
 */
export function fileNameFor(name: string, extension: string): string {
  return `${name.trim().replace(/[\\/:*?"<>|]/g, '-')}.${extension}`;
}
