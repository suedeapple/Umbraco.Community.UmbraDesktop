import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { CD_CONTENT_SIZE, CD_MIN_CONTENT_SIZE } from './cd-player/constants.js';
import { INFO_CONTENT_SIZE, INFO_MIN_CONTENT_SIZE } from './media-info/constants.js';
import { EDITOR_CONTENT_SIZE, EDITOR_MIN_CONTENT_SIZE } from './photo-editor/constants.js';
import { PLAYER_CONTENT_SIZE, PLAYER_MIN_CONTENT_SIZE } from './media-player/constants.js';
import { VIEWER_CONTENT_SIZE, VIEWER_MIN_CONTENT_SIZE } from './picture-viewer/constants.js';
import { RECORDER_CONTENT_SIZE, RECORDER_MIN_CONTENT_SIZE } from './sound-recorder/constants.js';
import { VOLUME_CONTENT_SIZE, VOLUME_MIN_CONTENT_SIZE } from './volume-control/constants.js';
import en from './localization/en.js';

/**
 * What the manifests promise the desktop, asserted where it can be read without a desktop: the
 * claims the Accessories and Entertainment packages each found wrong once, kept for this one.
 */

/** A registered app's fields, as far as these tests read them. */
interface App {
  alias: string;
  element?: unknown;
  js?: unknown;
  weight?: number;
  meta: {
    label: string;
    group?: string;
    defaultSize?: unknown;
    minSize?: unknown;
    allowMultiple?: boolean;
  };
}

const apps = manifests.filter((manifest) => manifest.type === 'umbraDesktopApp') as unknown as App[];

/** Each app's name and the sizes its constants derive, in launcher order. */
const EXPECTED = [
  ['MediaPlayer', PLAYER_CONTENT_SIZE, PLAYER_MIN_CONTENT_SIZE],
  ['CDPlayer', CD_CONTENT_SIZE, CD_MIN_CONTENT_SIZE],
  ['PictureViewer', VIEWER_CONTENT_SIZE, VIEWER_MIN_CONTENT_SIZE],
  ['PhotoEditor', EDITOR_CONTENT_SIZE, EDITOR_MIN_CONTENT_SIZE],
  ['SoundRecorder', RECORDER_CONTENT_SIZE, RECORDER_MIN_CONTENT_SIZE],
  ['MediaInfo', INFO_CONTENT_SIZE, INFO_MIN_CONTENT_SIZE],
  ['VolumeControl', VOLUME_CONTENT_SIZE, VOLUME_MIN_CONTENT_SIZE],
] as const;

it('registers every app, in launcher order', () => {
  const byWeight = [...apps].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  expect(byWeight.map((app) => app.alias)).to.deep.equal(EXPECTED.map(([name]) => `Umbraco.Community.UmbraDesktop.Multimedia.${name}`));
});

/**
 * `element`, never `js`. `js` is the field every other Umbraco extension uses for this, it
 * type-checks, and the desktop does not read it: an app declared that way is dropped at runtime.
 */
it('declares every app through a lazy `element` loader', () => {
  for (const app of apps) {
    expect(typeof app.element, `${app.alias} element`).to.equal('function');
    expect(app.js, `${app.alias} has no js`).to.equal(undefined);
  }
});

it('puts every app in the multimedia group', () => {
  for (const app of apps) expect(app.meta.group, app.alias).to.equal('multimedia');
});

/** Every label is a token this package's own dictionary answers, so no tile shows a raw token. */
it('names every app with a token the dictionary ships', () => {
  const area = (en as Record<string, Record<string, string>>).umbraDesktopMultimedia;
  for (const app of apps) {
    const [, key] = /^#umbraDesktopMultimedia_(\w+)$/.exec(app.meta.label) ?? [];
    expect(key, `${app.alias} label is a token in this package's area`).to.not.equal(undefined);
    expect(area[key], `${app.alias} label is in en.ts`).to.be.a('string');
  }
});

/** The sizes are each app's **content** box, pinned to the constants rather than to literals. */
it('asks for each app’s derived content size, leaving the chrome to the host', () => {
  for (const [name, size, min] of EXPECTED) {
    const app = apps.find((candidate) => candidate.alias.endsWith(`.${name}`))!;
    expect(app.meta.defaultSize, `${name} default`).to.deep.equal(size);
    expect(app.meta.minSize, `${name} minimum`).to.deep.equal(min);
  }
});

it('lets every app open more than one window', () => {
  for (const app of apps) expect(app.meta.allowMultiple, app.alias).to.not.equal(false);
});

/** The one catalogue this package registers. */
const catalogue = manifests.find((manifest) => manifest.type === 'umbraDesktopCatalogue');

/**
 * The Multimedia group is this package's own, label and all: the host defines none for add-ons
 * (package catalogues design D10), so without it every app would land under More. Where Windows kept
 * its media programs, beside the tools and before the games: after the Accessories add-on's group
 * (55) and before the Entertainment add-on's Games (60). Literals, because neither list can be
 * imported from here.
 */
it('defines the multimedia group itself, after Accessories and before Games', () => {
  const groups =
    (catalogue as { meta?: { groups?: Array<{ alias: string; label: string; weight?: number }> } } | undefined)?.meta
      ?.groups ?? [];
  const multimedia = groups.find((group) => group.alias === 'multimedia');
  expect(multimedia, 'the package must define the group its apps name').to.not.equal(undefined);
  expect(multimedia!.label).to.equal('#umbraDesktopMultimedia_groupMultimedia');
  expect((en as Record<string, Record<string, string>>).umbraDesktopMultimedia.groupMultimedia).to.be.a('string');
  expect(multimedia!.weight).to.be.greaterThan(55);
  expect(multimedia!.weight).to.be.lessThan(60);
});

/** The docs reach the desktop's Help app the way any add-on's do, from this package's own folder. */
it('registers its docs for the Help app, in its own App_Plugins folder', () => {
  const docs = manifests.filter((manifest) => manifest.type === 'umbraDesktopDocs') as unknown as Array<{ meta: { path: string } }>;
  expect(docs.map((manifest) => manifest.meta.path)).to.deep.equal(['/App_Plugins/Umbraco.Community.UmbraDesktop.Multimedia/docs']);
});
