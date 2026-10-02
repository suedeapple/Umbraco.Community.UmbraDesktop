import { extensionOf, picturesIn } from './media-kinds.js';
import type { MediaFile } from './media-kinds.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import {
  UMB_MEDIA_ENTITY_TYPE,
  UMB_MEDIA_PICKER_MODAL,
  UmbMediaItemRepository,
  UmbMediaTreeRepository,
  UmbMediaUrlRepository,
} from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Reading the media library, for Media Player and Picture Viewer.
 *
 * Neither app downloads a file to open it, which is the difference from Notepad and Paint in the
 * Accessories package: those edit a file's contents and so fetch it, where these hand its URL to an
 * `<audio>`, `<video>` or `<img>` and let the browser stream it. A two-hour video starts playing
 * before it has arrived, and nothing is held in memory twice.
 *
 * Everything goes through the backoffice's own picker and repositories, so the person sees exactly
 * the media they may see, through the start nodes and permissions they already have.
 */

/** What the media picker gave back. */
export type MediaPickResult =
  | ({
      status: 'picked';
      /** The folder the file is in, for Picture Viewer's Previous and Next: null for the root. */
      folder: string | null;
    } & MediaFile)
  | {
      /**
       * A folder: the media picker lets one be chosen, and Picture Viewer opens it as the set of
       * pictures in it.
       */
      status: 'folder';
      /** The folder's key. */
      unique: string;
      /** The folder's name, for saying what was in it. */
      name: string;
    }
  | { status: 'cancelled' }
  | {
      status: 'failed';
      /** What was picked, for saying which file could not be opened. */
      name?: string;
    };

/**
 * Let the person pick one file from the media library.
 *
 * An interface over one function, so an element can be handed a fake in a test: the real one needs
 * a booted backoffice for the picker and a server for the item.
 */
export type MediaPicker = () => Promise<MediaPickResult>;

/**
 * The real picker: `UMB_MEDIA_PICKER_MODAL`, the one a media picker property opens, so it browses
 * folders, searches and uploads exactly as the rest of the backoffice does. Whether the file suits
 * the app that asked is the app's to decide once it has the extension, so each can say so in its own
 * words: the picker cannot filter by it, because what it lists are media items, not files.
 *
 * **A folder can be chosen too**, whatever `pickableFilter` says: Umbraco sets `isFolder` on no media
 * item, the built-in Folder included (found while building Save As, `save-location.ts`). So a pick
 * with no file behind it is told apart here, the same way Save As tells a folder: a media type with a
 * collection, or children already under it. Picture Viewer opens one as its pictures; Media Player
 * refuses it.
 * @param host The element opening, whose contexts the backoffice classes consume.
 * @returns A {@link MediaPicker}.
 */
export function createMediaPicker(host: UmbControllerHost): MediaPicker {
  return async () => {
    const picked = await umbOpenModal(host, UMB_MEDIA_PICKER_MODAL, {
      data: { multiple: false, pickableFilter: (item) => !item.isFolder && !item.noAccess },
    }).catch(() => undefined);
    const unique = picked?.selection?.[0];
    if (!unique) return { status: 'cancelled' };

    const [{ data: items }, { data: urls }] = await Promise.all([
      new UmbMediaItemRepository(host).requestItems([unique]),
      new UmbMediaUrlRepository(host).requestItems([unique]),
    ]);
    const item = items?.[0];
    const url = urls?.[0]?.url;
    if (item && !url && (item.hasChildren || item.mediaType.collection)) return { status: 'folder', unique, name: item.name };
    if (!item || !url) return { status: 'failed', name: item?.name };
    return {
      status: 'picked',
      unique,
      name: item.name,
      url,
      extension: extensionOf(url),
      folder: (item.parent?.unique as string | null | undefined) ?? null,
    };
  };
}

/**
 * The pictures in one media folder, in the Media section's order.
 * @param folder The folder's key, or null for the media library root.
 * @returns The pictures.
 */
export type FolderPictures = (folder: string | null) => Promise<MediaFile[]>;

/**
 * How many of a folder's items are read. A folder with more than this still opens; Previous and
 * Next go through the first this many. A thousand is far more than anyone flicks through one at a
 * time, and few enough for one request.
 */
export const FOLDER_LIMIT = 1000;

/**
 * The real folder reader: the media tree for the folder's children, as the Media section lists
 * them, then one request for every child's URL. The tree, not the collection, because the tree is
 * what every media start node and permission is already applied to, and its order is the order the
 * person sees.
 * @param host The element asking.
 * @returns A {@link FolderPictures}.
 */
export function createFolderPictures(host: UmbControllerHost): FolderPictures {
  return async (folder) => {
    const tree = new UmbMediaTreeRepository(host);
    const paging = { skip: 0, take: FOLDER_LIMIT };
    const { data } = folder
      ? await tree.requestTreeItemsOf({ parent: { unique: folder, entityType: UMB_MEDIA_ENTITY_TYPE }, paging })
      : await tree.requestTreeRootItems({ paging });
    const items = (data?.items ?? []).map((item) => ({
      unique: item.unique,
      name: item.variants[0]?.name ?? item.name,
      isTrashed: item.isTrashed,
      hasChildren: item.hasChildren,
    }));
    const files = items.filter((item) => !item.hasChildren && !item.isTrashed).map((item) => item.unique);
    if (!files.length) return [];
    const { data: urls } = await new UmbMediaUrlRepository(host).requestItems(files);
    return picturesIn(items, urls ?? []);
  };
}
