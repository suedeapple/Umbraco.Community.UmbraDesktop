import { kindOf } from '../shared/media-kinds.js';
import type { MediaFile, MediaKind } from '../shared/media-kinds.js';
import { readExif } from './exif.js';
import type { ExifData } from './exif.js';
import { fileHead, fileStart, measureImage, measureMedia } from './facts.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';
import { UmbMediaTypeItemRepository } from '@umbraco-cms/backoffice/media-type';

/** Everything Media Info found about a file. Every field is absent when it could not be found. */
export interface MediaFacts {
  /** The media item's name. */
  name: string;
  /** The file's own name, from its URL. */
  fileName: string;
  /** Where it is on the site. */
  url: string;
  /** Sound, video or a picture, by extension; absent for any other file. */
  kind?: MediaKind;
  /** The media type it was created as, such as Image or File. */
  mediaType?: string;
  /** Its size, in bytes. */
  size?: number;
  /** The type the server sends it as. */
  mimeType?: string;
  /** When the media item was created, as the backoffice gives it. */
  created?: string;
  /** When it was last changed. */
  updated?: string;
  /** A picture's or a video's width, in pixels. */
  width?: number;
  /** Its height. */
  height?: number;
  /** A sound's or a video's length, in seconds. */
  duration?: number;
  /** A picture's focal point, as set in the Media section: fractions from the left and the top. */
  focalPoint?: { left: number; top: number };
  /** What the camera wrote, for a JPEG that has it. */
  exif?: ExifData;
}

/**
 * Find out everything about a file.
 *
 * An interface over one function, so the element can be handed a fake in a test: the real one needs
 * a booted backoffice for the repositories and a server for the file.
 */
export type MediaInspector = (file: MediaFile) => Promise<MediaFacts>;

/** How much of a JPEG is read for its EXIF: 128 KB, which holds the whole block for every camera. */
const EXIF_BYTES = 128 * 1024;

/**
 * The real inspector: the media item and its type from the backoffice's own repositories, the size
 * and type from the file's headers, its dimensions and length from the browser, and a JPEG's EXIF
 * from its start (`facts.ts` says why none of this downloads the whole file). Each part that fails
 * is left out rather than failing the rest.
 * @param host The element asking.
 * @returns A {@link MediaInspector}.
 */
export function createMediaInspector(host: UmbControllerHost): MediaInspector {
  return async (file) => {
    const kind = kindOf(file.extension);
    const [head, detail, measured, exifBytes] = await Promise.all([
      fileHead(file.url),
      new UmbMediaDetailRepository(host).requestByUnique(file.unique).catch(() => ({ data: undefined })),
      kind === 'image' ? measureImage(file.url) : kind ? measureMedia(file.url) : Promise.resolve(undefined),
      file.extension === 'jpg' || file.extension === 'jpeg' ? fileStart(file.url, EXIF_BYTES) : Promise.resolve(undefined),
    ]);
    const item = detail.data;
    const typeName = item
      ? (await new UmbMediaTypeItemRepository(host).requestItems([item.mediaType.unique]).catch(() => ({ data: undefined }))).data?.[0]?.name
      : undefined;
    const value = item?.values.find((candidate) => candidate.alias === 'umbracoFile')?.value as
      | { focalPoint?: { left: number; top: number } | null }
      | undefined;
    const size = measured as { width?: number; height?: number; duration?: number } | undefined;
    return {
      name: file.name,
      fileName: decodeURIComponent(file.url.split(/[?#]/)[0].split('/').pop() ?? ''),
      url: file.url,
      kind,
      mediaType: typeName,
      size: head.size,
      mimeType: head.mimeType,
      created: item?.variants[0]?.createDate ?? undefined,
      updated: item?.variants[0]?.updateDate ?? undefined,
      width: size?.width,
      height: size?.height,
      duration: size?.duration,
      focalPoint: value?.focalPoint ?? undefined,
      exif: exifBytes ? readExif(exifBytes) : undefined,
    };
  };
}
