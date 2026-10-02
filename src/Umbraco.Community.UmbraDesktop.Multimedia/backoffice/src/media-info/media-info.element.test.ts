import { expect, fixture, html } from '@open-wc/testing';
import './media-info.element.js';
import type { MediaInfoElement } from './media-info.element.js';
import type { MediaFacts } from './inspect.js';
import type { MediaFile } from '../shared/media-kinds.js';
import type { MediaPickResult } from '../shared/media-library.js';

/**
 * Media Info over a fake media library and a fake inspector: what it shows for a file, grouped as
 * Windows' Properties groups it, and only the groups the file has anything for.
 */

/** A JPEG with everything a camera writes. */
const PHOTO: MediaFacts = {
  name: 'Beach',
  fileName: 'beach.jpg',
  url: '/media/abc/beach.jpg',
  kind: 'image',
  mediaType: 'Image',
  size: 1536 * 1024,
  mimeType: 'image/jpeg',
  created: '2026-09-30T10:00:00Z',
  updated: '2026-10-01T12:30:00Z',
  width: 1600,
  height: 1000,
  focalPoint: { left: 0.5, top: 0.4 },
  exif: {
    make: 'Canon',
    model: 'EOS R6',
    taken: '2026-09-12 14:03:22',
    exposure: [1, 250],
    fNumber: 2.8,
    iso: 400,
    focalLength: 50,
    latitude: 51.50735,
    longitude: -0.12767,
  },
};

/** What the fakes recorded. */
interface Recorded {
  /** Every file inspected. */
  inspected: MediaFile[];
  /** Every text copied. */
  copied: string[];
}

/**
 * A mounted Media Info.
 * @param answers What each Open finds.
 * @param facts What the inspector finds.
 * @returns The element and what it asked for.
 */
async function info(answers: MediaPickResult[], facts: MediaFacts = PHOTO): Promise<{ element: MediaInfoElement; recorded: Recorded }> {
  const recorded: Recorded = { inspected: [], copied: [] };
  const element = await fixture<MediaInfoElement>(html`<umbradesktop-media-info
    .pickMedia=${async () => answers.shift() ?? { status: 'cancelled' }}
    .inspect=${async (file: MediaFile) => {
      recorded.inspected.push(file);
      return facts;
    }}
    .copy=${async (text: string) => void recorded.copied.push(text)}
  ></umbradesktop-media-info>`);
  return { element, recorded };
}

/** A picked file, as the media picker returns it. */
function picked(name: string, extension: string): MediaPickResult {
  return { status: 'picked', unique: `${name}-key`, name, url: `/media/x/${name.toLowerCase()}.${extension}`, extension, folder: null };
}

/** Open through the toolbar, and let it finish. */
async function open(element: MediaInfoElement): Promise<void> {
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="open"]')!.click();
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
}

/** The facts shown, as label and value pairs, by group. */
function shown(element: MediaInfoElement): Record<string, Record<string, string>> {
  const groups: Record<string, Record<string, string>> = {};
  for (const group of element.shadowRoot!.querySelectorAll('[data-group]')) {
    const rows: Record<string, string> = {};
    for (const row of group.querySelectorAll('tr')) {
      rows[(row.querySelector('th')?.textContent ?? '').trim()] = (row.querySelector('td')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }
    groups[group.getAttribute('data-group')!] = rows;
  }
  return groups;
}

/** The text of an element in the shadow root, trimmed. */
function text(element: MediaInfoElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

it('opens empty, saying how to start, with nothing to copy', async () => {
  const { element } = await info([]);
  expect(text(element, '.empty')).to.contain('Open');
  expect(element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="copy"]')!.disabled).to.equal(true);
});

it('shows a photo’s file, picture, camera and place', async () => {
  const { element, recorded } = await info([picked('Beach', 'jpg')]);
  await open(element);
  expect(recorded.inspected.map((file) => file.unique)).to.deep.equal(['Beach-key']);
  const groups = shown(element);
  expect(Object.keys(groups)).to.deep.equal(['file', 'picture', 'camera', 'place']);
  expect(groups.file).to.include({ Name: 'Beach', 'File name': 'beach.jpg', 'Media type': 'Image', Format: 'image/jpeg', Size: '1.5 MB' });
  expect(groups.file.Created).to.be.a('string').and.not.equal('');
  expect(groups.picture).to.deep.equal({ Dimensions: '1600 × 1000 pixels', 'Focal point': '50% across, 40% down' });
  expect(groups.camera).to.deep.equal({
    Camera: 'Canon EOS R6',
    Taken: '2026-09-12 14:03:22',
    Exposure: '1/250 s',
    Aperture: 'f/2.8',
    ISO: '400',
    'Focal length': '50 mm',
  });
  expect(groups.place.Coordinates).to.equal('51.50735° N, 0.12767° W');
});

/** A map link for the place, opened outside the backoffice, never through Umbraco's router. */
it('links the place to a map, outside the backoffice', async () => {
  const { element } = await info([picked('Beach', 'jpg')]);
  await open(element);
  const link = element.shadowRoot!.querySelector<HTMLAnchorElement>('[data-group="place"] a')!;
  expect(link.href).to.contain('openstreetmap.org');
  expect(link.target).to.equal('_blank');
  expect(link.rel).to.contain('noopener');
  expect(link.getAttribute('data-router-slot')).to.equal('disabled');
});

/** A sound has a length and nothing about pictures or cameras. */
it('shows a sound’s length, and no picture or camera', async () => {
  const facts: MediaFacts = { name: 'Jingle', fileName: 'jingle.mp3', url: '/media/j/jingle.mp3', kind: 'audio', duration: 65.4, size: 512 };
  const { element } = await info([picked('Jingle', 'mp3')], facts);
  await open(element);
  const groups = shown(element);
  expect(Object.keys(groups)).to.deep.equal(['file', 'media']);
  expect(groups.media).to.deep.equal({ Length: '1:05' });
  expect(groups.file.Size).to.equal('512 bytes');
});

it('shows a video’s length and dimensions', async () => {
  const facts: MediaFacts = { name: 'Trailer', fileName: 't.mp4', url: '/media/t/t.mp4', kind: 'video', duration: 3700, width: 1920, height: 1080 };
  const { element } = await info([picked('Trailer', 'mp4')], facts);
  await open(element);
  expect(shown(element).media).to.deep.equal({ Length: '1:01:40', Dimensions: '1920 × 1080 pixels' });
});

/** Copy puts every fact on the clipboard as one block, ready to paste, as System Information does. */
it('copies every fact shown, one per line', async () => {
  const { element, recorded } = await info([picked('Beach', 'jpg')]);
  await open(element);
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="copy"]')!.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await element.updateComplete;
  const [copied] = recorded.copied;
  expect(copied.split('\n')).to.include.members(['Name: Beach', 'Size: 1.5 MB', 'Camera: Canon EOS R6', 'Coordinates: 51.50735° N, 0.12767° W']);
  expect(text(element, '.notice')).to.equal('Copied.');
});

it('says a folder is a folder, and which file could not be opened', async () => {
  const { element } = await info([{ status: 'folder', unique: 'f', name: 'Holidays' }, { status: 'failed', name: 'Lost' }]);
  await open(element);
  expect(text(element, '.notice')).to.equal('Holidays is a folder. Media Info describes one file at a time.');
  await open(element);
  expect(text(element, '.notice')).to.equal('Lost could not be opened.');
});
