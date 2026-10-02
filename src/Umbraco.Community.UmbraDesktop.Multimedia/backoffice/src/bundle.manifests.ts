import { CAMERA_CONTENT_SIZE, CAPTURE_MIN_CONTENT_SIZE, SNIPPING_CONTENT_SIZE } from './capture/constants.js';
import { CD_CONTENT_SIZE, CD_MIN_CONTENT_SIZE } from './cd-player/constants.js';
import { INFO_CONTENT_SIZE, INFO_MIN_CONTENT_SIZE } from './media-info/constants.js';
import { EDITOR_CONTENT_SIZE, EDITOR_MIN_CONTENT_SIZE } from './photo-editor/constants.js';
import { PLAYER_CONTENT_SIZE, PLAYER_MIN_CONTENT_SIZE } from './media-player/constants.js';
import { VIEWER_CONTENT_SIZE, VIEWER_MIN_CONTENT_SIZE } from './picture-viewer/constants.js';
import { RECORDER_CONTENT_SIZE, RECORDER_MIN_CONTENT_SIZE } from './sound-recorder/constants.js';
import { VOLUME_CONTENT_SIZE, VOLUME_MIN_CONTENT_SIZE } from './volume-control/constants.js';
import { AREA } from './shared/area.js';
import { manifests as localizationManifests } from './localization/manifest.js';

/**
 * The prefix every alias in this package carries. An alias is what pins a favourite, so it is
 * namespaced with the package id and final: renaming one later loses the pin of every user who made
 * one.
 */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Multimedia';

/**
 * The Multimedia group, defined by the package whose apps fill it, as the Accessories package
 * defines Accessories and the Entertainment package defines Games: the host defines no group that
 * exists only for somebody else's apps (design D10 of
 * `docs/design/2026-09-25-package-catalogues-design.md`), so without this every app would land
 * under More.
 *
 * This weight is on the launcher's own scale, lower first, unlike the apps' root `weight` below,
 * which is Umbraco's. 57 places Multimedia after Accessories (55) and before Games (60): Windows kept
 * Media Player and Sound Recorder beside the tools, and both before the games. The host publishes its
 * weights for exactly this (design D11), and the two add-ons' are in `docs/developer/package-catalogues.md`.
 *
 * No `entries`: an entry deep-links one of the package's own backoffice screens, and this package has
 * none.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: `${ALIAS}.Catalogue`,
  name: 'UmbraDesktop Multimedia catalogue',
  meta: {
    groups: [{ alias: 'multimedia', label: `#${AREA}_groupMultimedia`, weight: 57 }],
  },
};

/**
 * One app's manifest.
 *
 * The apps differ only in what they are called, where they sort and how big they are, so they are
 * built by one function, as the Accessories package builds its tools. Every field is that package's
 * reasoning: `element` and never `js`, because the desktop reads only `element`; an explicit
 * `weight`, because unset is a position rather than an absence; the `multimedia` group, which this
 * package's catalogue above defines; sizes that are the app's content box, derived by its own
 * `constants.ts`, with the chrome left to the host; and no `conditions`, because reaching the
 * desktop already takes the Desktop section, the media library's own permissions decide what each
 * person can open, and an unmet condition is the one way an app vanishes from the launcher in
 * silence.
 * @param name The app's name, which is also its alias suffix and its dictionary key.
 * @param weight Its place in the group. Higher sorts first, as everywhere in Umbraco.
 * @param icon A native Umbraco icon alias.
 * @param element The lazy loader for its element, which keeps the app out of this bundle's main chunk.
 * @param defaultSize Its content box.
 * @param minSize The smallest content box it works in.
 * @returns The manifest.
 */
function app(
  name: string,
  weight: number,
  icon: string,
  element: () => Promise<unknown>,
  defaultSize: { w: number; h: number },
  minSize: { w: number; h: number },
): UmbExtensionManifest {
  return {
    type: 'umbraDesktopApp',
    alias: `${ALIAS}.${name}`,
    name,
    element: element as () => Promise<{ element: CustomElementConstructor }>,
    weight,
    meta: {
      label: `#${AREA}_${name.toLowerCase()}`,
      icon,
      group: 'multimedia',
      defaultSize,
      minSize,
      allowMultiple: true,
    },
  };
}

/**
 * The apps: the ones that play and show what is already in the media library first, then the ones
 * that make something new for it, then the two that look after the rest: Media Info, and Volume
 * Control last, as Windows kept it apart from the programs. Spaced apart, as Minesweeper leaves room
 * for Solitaire, so a new app lands between two of these without renumbering.
 */
const apps: Array<UmbExtensionManifest> = [
  app(
    'MediaPlayer',
    1000,
    'icon-play',
    () => import('./media-player/media-player.element.js'),
    PLAYER_CONTENT_SIZE,
    PLAYER_MIN_CONTENT_SIZE,
  ),
  // A media folder of sound files as a disc, played track by track.
  app('CDPlayer', 950, 'icon-record', () => import('./cd-player/cd-player.element.js'), CD_CONTENT_SIZE, CD_MIN_CONTENT_SIZE),
  app(
    'PictureViewer',
    900,
    'icon-pictures',
    () => import('./picture-viewer/picture-viewer.element.js'),
    VIEWER_CONTENT_SIZE,
    VIEWER_MIN_CONTENT_SIZE,
  ),
  // Crop, rotate, flip and resize a picture from the media library.
  app(
    'PhotoEditor',
    850,
    'icon-crop',
    () => import('./photo-editor/photo-editor.element.js'),
    EDITOR_CONTENT_SIZE,
    EDITOR_MIN_CONTENT_SIZE,
  ),
  app(
    'SoundRecorder',
    800,
    'icon-sound-waves',
    () => import('./sound-recorder/sound-recorder.element.js'),
    RECORDER_CONTENT_SIZE,
    RECORDER_MIN_CONTENT_SIZE,
  ),
  // The webcam and the screen: a photo or a video of either, to download or add to the media library.
  app('Camera', 750, 'icon-security-camera', () => import('./capture/camera.element.js'), CAMERA_CONTENT_SIZE, CAPTURE_MIN_CONTENT_SIZE),
  app(
    'SnippingTool',
    700,
    'icon-cut',
    () => import('./capture/snipping-tool.element.js'),
    SNIPPING_CONTENT_SIZE,
    CAPTURE_MIN_CONTENT_SIZE,
  ),
  // Everything about one media file, as Windows' Properties told you about a file.
  app('MediaInfo', 600, 'icon-info', () => import('./media-info/media-info.element.js'), INFO_CONTENT_SIZE, INFO_MIN_CONTENT_SIZE),
  // The desktop's mixer: a column for the master and one for each app above that makes sound.
  app(
    'VolumeControl',
    500,
    'icon-sound-medium',
    () => import('./volume-control/volume-control.element.js'),
    VOLUME_CONTENT_SIZE,
    VOLUME_MIN_CONTENT_SIZE,
  ),
];

/**
 * This package's docs, for the desktop's Help app. The build copies `docs/` into this package's own
 * App_Plugins folder (see `vite.config.ts`), and this says where. The public route any add-on uses,
 * as the host's `docs/developer/add-on-help.md` describes it.
 */
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: `${ALIAS}.Docs`,
  name: 'UmbraDesktop Multimedia docs',
  meta: { path: '/App_Plugins/Umbraco.Community.UmbraDesktop.Multimedia/docs' },
};

/**
 * The bundle Umbraco loads for this package, and the only entry point it has.
 *
 * `UmbExtensionManifest` is a global type from `@umbraco-cms/backoffice/extension-types`, wired up in
 * tsconfig's `types`. The `umbraDesktopApp`, `umbraDesktopCatalogue` and `umbraDesktopDocs` arms of
 * that union are contributed by `umbradesktop-app.d.ts` in this folder, a copy of the other add-ons',
 * for the reason given there.
 */
export const manifests: Array<UmbExtensionManifest> = [catalogue, ...apps, docs, ...localizationManifests];
