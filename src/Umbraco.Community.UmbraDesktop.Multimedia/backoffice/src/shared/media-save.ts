import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_MEDIA_PROPERTY_VALUE_ENTITY_TYPE, UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';
import { UmbMediaTypeStructureRepository } from '@umbraco-cms/backoffice/media-type';
import { TemporaryFileStatus, UmbTemporaryFileManager } from '@umbraco-cms/backoffice/temporary-file';

/** How adding a file to the media library went. */
export type MediaAddResult =
  | {
      ok: true;
      /** The new media item's key. */
      unique: string;
    }
  | {
      ok: false;
      /** Why, in the backoffice's own words where it gave any. */
      message?: string;
    };

/** What to add, and where. */
export interface MediaAddRequest {
  /** The file, whose name carries the extension the media type is chosen by. */
  file: File;
  /** The media item's name. */
  name: string;
  /** The folder it goes in, or null for the media library root. */
  folder: string | null;
}

/**
 * Add a file to the media library as a new item.
 * @param request What to add, and where.
 * @returns How it went.
 */
export type MediaAdder = (request: MediaAddRequest) => Promise<MediaAddResult>;

/**
 * The real adder, for Sound Recorder's **Add to Media**: the way the Media section's drag-and-drop
 * creates an item, with the public repositories that code is built from.
 *
 * The same steps as `shared/media-save.ts` in the Accessories package takes for a new file, copied
 * because the two add-ons are independent (`styles.ts` says why), and without the overwrite half:
 * a recording is only ever added, never saved back over an item. Ask which media types accept the
 * file's extension, intersect that with what the folder allows, prefer a type that names the
 * extension over a catch-all, upload a temporary file, and create the item pointing at it. So a
 * folder that only allows images refuses a recording exactly as it refuses one dragged in, and says
 * so in the same words.
 * @param host The element saving, whose contexts the backoffice classes consume.
 * @returns A {@link MediaAdder}.
 */
export function createMediaAdder(host: UmbControllerHost): MediaAdder {
  return async ({ file, name, folder }) => {
    const localize = new UmbLocalizationController(host);
    const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? '';
    const structure = new UmbMediaTypeStructureRepository(host);
    const media = new UmbMediaDetailRepository(host);

    const available = extension ? await structure.requestMediaTypesOf({ fileExtension: extension }) : [];
    const parent = folder ? (await media.requestByUnique(folder)).data : undefined;
    const { data: allowed } = await structure.requestAllowedChildrenOf(parent?.mediaType.unique ?? null, folder);
    const options = available.filter((type) => allowed?.items.some((child) => child.unique === type.unique));
    if (!options.length) {
      const names = available.map((type) => type.name).join(', ');
      return {
        ok: false,
        message: available.length
          ? localize.term('media_disallowedMediaTypeNotAllowedHere', extension, names)
          : localize.term('media_disallowedFileExtension', extension),
      };
    }
    const mediaType = options.find((type) => type.matchedFileExtension) ?? options[0];

    const uploaded = await new UmbTemporaryFileManager(host).uploadOne({ temporaryUnique: UmbId.new(), file });
    if (uploaded.status !== TemporaryFileStatus.SUCCESS || !mediaType.unique) return { ok: false };

    const { data: scaffold } = await media.createScaffold({
      unique: UmbId.new(),
      mediaType: { unique: mediaType.unique, collection: null },
      variants: [{ culture: null, segment: null, createDate: null, updateDate: null, flags: [], name }],
      values: [
        {
          editorAlias: '',
          alias: 'umbracoFile',
          value: { temporaryFileId: uploaded.temporaryUnique },
          culture: null,
          segment: null,
          entityType: UMB_MEDIA_PROPERTY_VALUE_ENTITY_TYPE,
        },
      ],
    });
    if (!scaffold) return { ok: false };
    const { data, error } = await media.create(scaffold, folder);
    return data ? { ok: true, unique: data.unique } : { ok: false, message: error?.message };
  };
}
