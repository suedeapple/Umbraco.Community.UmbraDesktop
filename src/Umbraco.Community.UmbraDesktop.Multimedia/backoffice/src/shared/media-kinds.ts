/**
 * Which media files each multimedia app opens, decided from the file alone.
 *
 * The media picker cannot be told: a media item's type says Image, Audio, Video or File, and a site
 * can rename, remove or add types, so the type is no guide to whether a browser can play the file.
 * The extension is, and it is what Umbraco itself chooses a media type by. Pure functions, so the
 * rules can be read and tested in one place rather than inferred from three elements.
 */

/** What an app does with a file: listens to it, watches it, or looks at it. */
export type MediaKind = 'audio' | 'video' | 'image';

/**
 * Sound a current browser plays. Umbraco's own Audio media type accepts mp3, weba, oga and opus;
 * the rest arrive as File items and play just as well.
 */
const AUDIO = new Set(['mp3', 'wav', 'oga', 'ogg', 'opus', 'weba', 'm4a', 'aac', 'flac']);

/**
 * Video a current browser plays. Umbraco's own Video media type accepts mp4, webm and ogv. A `.mov`
 * plays where it holds H.264, which is most of them, and says so in the player where it does not.
 */
const VIDEO = new Set(['mp4', 'webm', 'ogv', 'm4v', 'mov']);

/**
 * Pictures a browser shows in an `<img>`. TIFF and PSD are left out, though Umbraco's Image type
 * may hold them, because no browser shows them and a slideshow that stopped on a broken picture
 * would be no slideshow.
 */
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico']);

/**
 * A file's extension, from its name or URL, lower-cased and without the dot. A query string or
 * fragment is ignored, since a media URL may carry one for resizing or cache-busting.
 * @param path A file name or URL.
 * @returns The extension, or an empty string when there is none.
 */
export function extensionOf(path: string): string {
  const name = path.split(/[?#]/)[0].split('/').pop() ?? '';
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

/**
 * What kind of media a file is, by its extension.
 * @param extension The extension, without the dot.
 * @returns The kind, or undefined for anything none of the apps can open.
 */
export function kindOf(extension: string): MediaKind | undefined {
  if (AUDIO.has(extension)) return 'audio';
  if (VIDEO.has(extension)) return 'video';
  if (IMAGE.has(extension)) return 'image';
  return undefined;
}

/** A media file an app can open: its item, its name, and where the browser fetches it. */
export interface MediaFile {
  /** The media item's key. */
  unique: string;
  /** The media item's name, which the window shows. */
  name: string;
  /** The file's URL on this site. */
  url: string;
  /** The file's extension, without the dot. */
  extension: string;
}

/** A child of a media folder, as far as {@link picturesIn} reads it. */
export interface FolderItem {
  /** The item's key. */
  unique: string;
  /** The item's name. */
  name: string;
  /** Whether it is in the recycle bin. */
  isTrashed: boolean;
  /** Whether it has children, which makes it a folder rather than a picture. */
  hasChildren: boolean;
}

/** A media item's URL, as Umbraco's media URL repository returns it. */
export interface ItemUrl {
  /** The item's key. */
  unique: string;
  /** Its file's URL, absent for an item with no file, such as a folder. */
  url?: string;
}

/**
 * The files of one kind among a folder's children, in the folder's own order.
 *
 * The order is the Media section's, so Next goes where the person expects from having looked at the
 * folder there. A subfolder, an item in the recycle bin, an item with no file and every file of
 * another kind are left out. The URLs come in whatever order the server returns them, so they are
 * matched by key.
 * @param items The folder's children, in order.
 * @param urls Their URLs.
 * @param kind Which files to keep: Picture Viewer's pictures, CD Player's sound.
 * @returns The files.
 */
export function filesIn(items: FolderItem[], urls: ItemUrl[], kind: MediaKind): MediaFile[] {
  const urlOf = new Map(urls.map((entry) => [entry.unique, entry.url]));
  const files: MediaFile[] = [];
  for (const item of items) {
    const url = urlOf.get(item.unique);
    if (item.isTrashed || item.hasChildren || !url) continue;
    const extension = extensionOf(url);
    if (kindOf(extension) === kind) files.push({ unique: item.unique, name: item.name, url, extension });
  }
  return files;
}

/**
 * The pictures among a folder's children, in the folder's own order: {@link filesIn} for pictures.
 * @param items The folder's children, in order.
 * @param urls Their URLs.
 * @returns The pictures.
 */
export function picturesIn(items: FolderItem[], urls: ItemUrl[]): MediaFile[] {
  return filesIn(items, urls, 'image');
}

/** The image types a browser canvas can write, so Photo Editor can save a picture in its own format. */
const WRITABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * The type Photo Editor saves a picture as, or undefined when it cannot edit it.
 *
 * The Accessories package's rule for Paint: a picture is saved in the format it arrived in wherever
 * a canvas can write that format, so a photograph stays a JPEG and keeps its size. Other raster
 * formats (GIF, BMP) are saved as PNG, which loses nothing. SVG is refused: it is a drawing in text,
 * and saving pixels over it would destroy it.
 * @param mimeType The picture's type.
 * @returns The type to save as, or undefined.
 */
export function editableImageType(mimeType: string): string | undefined {
  if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') return undefined;
  return WRITABLE_IMAGE_TYPES.has(mimeType) ? mimeType : 'image/png';
}

/**
 * The name of the file behind a media item: what the person called it, with an extension added when
 * the name has none, since the media library chooses a media type by extension. A name that has one
 * keeps it, so `logo.png` is not saved as `logo.png.png`.
 * @param name What the person called it. Empty means untitled.
 * @param untitled The localised word for something with no name.
 * @param extension The extension to add when the name has none, without the dot.
 * @returns The file name.
 */
export function fileNameFor(name: string, untitled: string, extension: string): string {
  const base = name.trim() || untitled;
  return extensionOf(base) ? base : `${base}.${extension}`;
}
