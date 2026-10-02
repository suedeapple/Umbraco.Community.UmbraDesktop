/**
 * How Media Info measures a file and writes what it found.
 *
 * Measuring never downloads more than it must: the size and type come from the server's headers,
 * dimensions and length from the browser decoding a picture or reading a media file's metadata
 * (which for a video is its first few kilobytes), and EXIF from the first part of the file only.
 * A two-gigabyte video is described from a few kilobytes of it.
 */

/** A file's size and type, as its headers say. */
export interface FileHead {
  /** The size, in bytes. */
  size?: number;
  /** The type the server sends it as. */
  mimeType?: string;
}

/**
 * Read a file's size and type from its headers: a `HEAD` request, or, where that gives no length
 * (some servers and every `blob:` URL), a request for its first byte, whose `Content-Range` says
 * the whole size. Last of all the body itself, which only a small in-memory file reaches.
 * @param url The file.
 * @returns What its headers said; an empty object if nothing could be read.
 */
export async function fileHead(url: string): Promise<FileHead> {
  const typeOf = (response: Response) => response.headers.get('content-type')?.split(';')[0].trim() || undefined;
  try {
    const head = await fetch(url, { method: 'HEAD', credentials: 'same-origin' });
    const length = Number(head.headers.get('content-length'));
    if (head.ok && length > 0) return { size: length, mimeType: typeOf(head) };
  } catch {
    // Not every URL answers HEAD; the next try does not need it.
  }
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, credentials: 'same-origin' });
    const total = Number(response.headers.get('content-range')?.split('/')[1]);
    if (response.status === 206 && total > 0) return { size: total, mimeType: typeOf(response) };
    const blob = await response.blob();
    return { size: blob.size, mimeType: typeOf(response) ?? (blob.type || undefined) };
  } catch {
    return {};
  }
}

/**
 * Read the start of a file, for its EXIF, which a camera always writes near the start.
 * @param url The file.
 * @param bytes How much to read.
 * @returns At least that much where the server honours a range, the whole file where it does not,
 *   or undefined if it could not be read.
 */
export async function fileStart(url: string, bytes: number): Promise<ArrayBuffer | undefined> {
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` }, credentials: 'same-origin' });
    return response.ok ? await response.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Measure a picture by letting the browser decode it.
 * @param url The picture.
 * @returns Its size in pixels, or undefined if it will not decode or reports none.
 */
export function measureImage(url: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth ? { width: image.naturalWidth, height: image.naturalHeight } : undefined);
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}

/**
 * Measure a sound or video from its metadata, without playing or downloading it.
 * @param url The file.
 * @returns Its length in seconds, and a video's size in pixels, or undefined if the browser cannot
 *   read it.
 */
export function measureMedia(url: string): Promise<{ duration: number; width?: number; height?: number } | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const done = (value: { duration: number; width?: number; height?: number } | undefined) => {
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.onloadedmetadata = () =>
      done({
        duration: video.duration,
        ...(video.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : {}),
      });
    video.onerror = () => done(undefined);
    video.src = url;
  });
}

/**
 * A size in the unit a person reads it in: bytes, then KB, MB and GB of 1,024, to one decimal place
 * where it has one, as Windows' Properties writes it.
 * @param bytes The size.
 * @returns The text.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Number(value.toFixed(1))} ${units[unit]}`;
}

/**
 * An exposure time as photographers write it: `1/250 s` under a second, `2 s` or `1.3 s` above.
 * @param exposure The fraction the camera wrote.
 * @returns The text.
 */
export function formatExposure([over, under]: [number, number]): string {
  if (!under) return '';
  return over < under ? `1/${Math.round(under / over)} s` : `${Number((over / under).toFixed(1))} s`;
}

/**
 * A place as degrees with their hemispheres, to five decimal places: about a metre, which is as
 * precise as a phone's GPS.
 * @param latitude North positive.
 * @param longitude East positive.
 * @returns The text.
 */
export function formatCoordinates(latitude: number, longitude: number): string {
  const part = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(5)}° ${value < 0 ? negative : positive}`;
  return `${part(latitude, 'N', 'S')}, ${part(longitude, 'E', 'W')}`;
}
