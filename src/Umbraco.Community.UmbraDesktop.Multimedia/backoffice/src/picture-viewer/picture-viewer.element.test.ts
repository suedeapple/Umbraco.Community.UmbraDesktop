import { expect, fixture, html } from '@open-wc/testing';
import { sendKeys } from '@web/test-runner-commands';
import './picture-viewer.element.js';
import type { PictureViewerElement } from './picture-viewer.element.js';
import type { MediaFile } from '../shared/media-kinds.js';
import type { MediaPickResult } from '../shared/media-library.js';

/**
 * Picture Viewer over a fake media library and real pictures.
 *
 * The picker and the folder are faked; the pictures are real PNGs drawn here, so loading, natural
 * sizes and the zoomed layout are the browser's own.
 */

/**
 * A plain picture of a given size, as a data URL.
 * @param w Its width.
 * @param h Its height.
 * @returns The URL.
 */
function png(w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#3544b1';
  context.fillRect(0, 0, w, h);
  return canvas.toDataURL('image/png');
}

/** A folder of three pictures, the middle one large. */
const FOLDER: MediaFile[] = [
  { unique: 'a', name: 'Beach', url: png(200, 100), extension: 'png' },
  { unique: 'b', name: 'Mountains', url: png(2000, 1000), extension: 'png' },
  { unique: 'c', name: 'Logo', url: png(50, 50), extension: 'png' },
];

/** The media picker's answer for one of the folder's pictures. */
function picked(file: MediaFile, folder: string | null = 'holidays'): MediaPickResult {
  return { status: 'picked', ...file, folder };
}

/** What the fakes recorded. */
interface Recorded {
  /** Every folder the viewer listed. */
  folders: Array<string | null>;
}

/**
 * A mounted Picture Viewer whose Open answers `answers` in turn, over {@link FOLDER}.
 * @param answers What each Open finds.
 * @param folder What listing the folder finds.
 * @returns The element and what it asked for.
 */
async function viewer(
  answers: MediaPickResult[],
  folder: MediaFile[] = FOLDER,
): Promise<{ element: PictureViewerElement; recorded: Recorded }> {
  const recorded: Recorded = { folders: [] };
  const element = await fixture<PictureViewerElement>(html`<div style="width: 600px; height: 450px; display: flex; flex-direction: column">
    <umbradesktop-picture-viewer
      style="flex: 1"
      .slideshowMs=${60}
      .pickMedia=${async () => answers.shift() ?? { status: 'cancelled' }}
      .listPictures=${async (unique: string | null) => {
        recorded.folders.push(unique);
        return folder;
      }}
    ></umbradesktop-picture-viewer>
  </div>`).then((wrapper) => wrapper.querySelector('umbradesktop-picture-viewer')!);
  return { element, recorded };
}

/** A control by its `data-action`. */
function control(element: PictureViewerElement, action: string): HTMLButtonElement {
  return element.shadowRoot!.querySelector(`[data-action="${action}"]`)!;
}

/** The picture. */
function picture(element: PictureViewerElement): HTMLImageElement {
  return element.shadowRoot!.querySelector('img')!;
}

/** The text of an element in the shadow root, with its white space collapsed. */
function text(element: PictureViewerElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Wait until `check` holds: a picture loads, and a slideshow moves on, when the browser gets to it.
 * @param element The viewer, updated between tries.
 * @param check The condition.
 */
async function until(element: PictureViewerElement, check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
  expect(check(), 'waited for the viewer').to.equal(true);
}

/** Open a picture through the toolbar, and wait for it to show. */
async function open(element: PictureViewerElement): Promise<void> {
  control(element, 'open').click();
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
}

/** Press a control and let the viewer update. */
async function click(element: PictureViewerElement, action: string): Promise<void> {
  control(element, action).click();
  await element.updateComplete;
}

it('opens empty, saying how to start, with nothing to move through or zoom', async () => {
  const { element } = await viewer([]);
  expect(text(element, '.empty')).to.contain('Open');
  for (const action of ['previous', 'next', 'slideshow', 'zoom-in', 'zoom-out', 'actual', 'fit']) {
    expect(control(element, action).disabled, action).to.equal(true);
  }
});

/** Open shows the picture chosen, and the folder it is in becomes what Previous and Next go through. */
it('opens a picture, and lists the folder it is in', async () => {
  const { element, recorded } = await viewer([picked(FOLDER[1])]);
  await open(element);
  expect(picture(element).src).to.equal(FOLDER[1].url);
  expect(recorded.folders).to.deep.equal(['holidays']);
  expect(text(element, '.name')).to.equal('Mountains');
  expect(text(element, '.position')).to.equal('2 of 3');
});

it('goes to the next and previous picture, round from either end', async () => {
  const { element } = await viewer([picked(FOLDER[2])]);
  await open(element);
  await click(element, 'next');
  expect(text(element, '.name')).to.equal('Beach');
  await click(element, 'previous');
  await click(element, 'previous');
  expect(text(element, '.name')).to.equal('Mountains');
  expect(text(element, '.position')).to.equal('2 of 3');
});

/** A picture the folder listing does not include (a listing that failed, say) is shown on its own. */
it('shows a picture on its own when its folder does not list it', async () => {
  const { element } = await viewer([picked(FOLDER[0])], []);
  await open(element);
  expect(text(element, '.name')).to.equal('Beach');
  expect(text(element, '.position')).to.equal('1 of 1');
  expect(control(element, 'next').disabled).to.equal(true);
  expect(control(element, 'slideshow').disabled).to.equal(true);
});

it('refuses a file that is not a picture, and keeps what was open', async () => {
  const brochure = { unique: 'p', name: 'Brochure', url: '/media/p/brochure.pdf', extension: 'pdf' };
  const { element } = await viewer([picked(FOLDER[0]), picked(brochure)]);
  await open(element);
  await open(element);
  expect(text(element, '.notice')).to.equal('Picture Viewer shows pictures, and Brochure is not one.');
  expect(text(element, '.name')).to.equal('Beach');
});

it('says which file could not be opened', async () => {
  const { element } = await viewer([{ status: 'failed', name: 'Lost' }]);
  await open(element);
  expect(text(element, '.notice')).to.equal('Lost could not be opened.');
});

/**
 * A folder chosen in the picker opens as a slideshow-ready set of its pictures, from the first. The
 * folder listing has already left out anything that is not a picture (`picturesIn`), so a folder
 * of photos and PDFs shows the photos and skips the rest.
 */
it('opens a folder chosen in the picker at its first picture', async () => {
  const { element, recorded } = await viewer([{ status: 'folder', unique: 'holidays', name: 'Holidays' }]);
  await open(element);
  expect(recorded.folders).to.deep.equal(['holidays']);
  expect(picture(element).src).to.equal(FOLDER[0].url);
  expect(text(element, '.name')).to.equal('Beach');
  expect(text(element, '.position')).to.equal('1 of 3');
  expect(control(element, 'slideshow').disabled).to.equal(false);
});

it('says so when a folder chosen has no pictures in it, and keeps what was open', async () => {
  const { element } = await viewer([picked(FOLDER[0]), { status: 'folder', unique: 'documents', name: 'Documents' }]);
  await open(element);
  (element as unknown as { listPictures: () => Promise<MediaFile[]> }).listPictures = async () => [];
  await open(element);
  expect(text(element, '.notice')).to.equal('Documents has no pictures in it.');
  expect(text(element, '.name')).to.equal('Beach');
});

/** A picture is fitted into the window at first, and a small one is shown at its own size, not blown up. */
it('fits a large picture into the window, and shows a small one at its own size', async () => {
  const { element } = await viewer([picked(FOLDER[1])]);
  await open(element);
  await until(element, () => picture(element).naturalWidth === 2000);
  await until(element, () => control(element, 'fit').getAttribute('aria-pressed') === 'true');
  const screen = element.shadowRoot!.querySelector('.screen')!.getBoundingClientRect();
  const shown = picture(element).getBoundingClientRect();
  expect(shown.width).to.be.at.most(screen.width);
  expect(shown.width).to.be.closeTo(Math.min(screen.width, screen.height * 2), 2);
  await click(element, 'next');
  await until(element, () => picture(element).naturalWidth === 50);
  expect(picture(element).getBoundingClientRect().width).to.be.closeTo(50, 0.5);
  expect(text(element, '.zoom')).to.equal('100%');
});

it('zooms in and out in steps, and shows the picture at that scale', async () => {
  const { element } = await viewer([picked(FOLDER[0])]);
  await open(element);
  await until(element, () => picture(element).naturalWidth === 200);
  await click(element, 'zoom-in');
  expect(text(element, '.zoom')).to.equal('150%');
  expect(control(element, 'fit').getAttribute('aria-pressed')).to.equal('false');
  await until(element, () => Math.abs(picture(element).getBoundingClientRect().width - 300) < 0.5);
  await click(element, 'zoom-out');
  await click(element, 'zoom-out');
  expect(text(element, '.zoom')).to.equal('75%');
  await until(element, () => Math.abs(picture(element).getBoundingClientRect().width - 150) < 0.5);
});

/** Zoomed past the window, the picture scrolls rather than spilling over the window's edges. */
it('shows a large picture at its own size, scrolling, and fits it again', async () => {
  const { element } = await viewer([picked(FOLDER[1])]);
  await open(element);
  await until(element, () => picture(element).naturalWidth === 2000);
  await click(element, 'actual');
  expect(text(element, '.zoom')).to.equal('100%');
  const screen = element.shadowRoot!.querySelector<HTMLElement>('.screen')!;
  await until(element, () => screen.scrollWidth >= 2000);
  expect(screen.getBoundingClientRect().width).to.be.below(600);
  await click(element, 'fit');
  await until(element, () => picture(element).getBoundingClientRect().width < 600);
  expect(control(element, 'fit').getAttribute('aria-pressed')).to.equal('true');
});

/** Every new picture starts fitted, whatever the last one was zoomed to. */
it('fits each picture it moves to', async () => {
  const { element } = await viewer([picked(FOLDER[0])]);
  await open(element);
  await until(element, () => picture(element).naturalWidth === 200);
  await click(element, 'zoom-in');
  await click(element, 'next');
  expect(control(element, 'fit').getAttribute('aria-pressed')).to.equal('true');
});

it('runs a slideshow through the folder until it is stopped', async () => {
  const { element } = await viewer([picked(FOLDER[0])]);
  await open(element);
  await click(element, 'slideshow');
  expect(control(element, 'slideshow').getAttribute('aria-pressed')).to.equal('true');
  await until(element, () => text(element, '.name') === 'Mountains');
  await until(element, () => text(element, '.name') === 'Logo');
  await until(element, () => text(element, '.name') === 'Beach');
  await click(element, 'slideshow');
  expect(control(element, 'slideshow').getAttribute('aria-pressed')).to.equal('false');
  const stopped = text(element, '.name');
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(text(element, '.name')).to.equal(stopped);
});

/** A closed window's slideshow must not go on running a timer behind it. */
it('stops the slideshow when its window closes', async () => {
  const { element } = await viewer([picked(FOLDER[0])]);
  await open(element);
  await click(element, 'slideshow');
  const parent = element.parentElement!;
  element.remove();
  const before = element.shadowRoot!.querySelector('.name')!.textContent;
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(element.shadowRoot!.querySelector('.name')!.textContent).to.equal(before);
  parent.appendChild(element);
  await element.updateComplete;
  expect(control(element, 'slideshow').getAttribute('aria-pressed')).to.equal('false');
});

/** The arrows move through the folder and plus and minus zoom, as in every picture viewer. */
it('answers the keyboard', async () => {
  const { element } = await viewer([picked(FOLDER[0])]);
  await open(element);
  await until(element, () => picture(element).naturalWidth === 200);
  element.focus();
  await sendKeys({ press: 'ArrowRight' });
  await element.updateComplete;
  expect(text(element, '.name')).to.equal('Mountains');
  await sendKeys({ press: 'ArrowLeft' });
  await element.updateComplete;
  expect(text(element, '.name')).to.equal('Beach');
  await until(element, () => picture(element).naturalWidth === 200);
  await sendKeys({ press: '+' });
  await element.updateComplete;
  expect(text(element, '.zoom')).to.equal('150%');
  await sendKeys({ press: '-' });
  await element.updateComplete;
  expect(text(element, '.zoom')).to.equal('100%');
  await sendKeys({ press: '+' });
  await sendKeys({ press: '0' });
  await element.updateComplete;
  expect(control(element, 'fit').getAttribute('aria-pressed')).to.equal('true');
});

it('says so when a picture will not load', async () => {
  const broken = { unique: 'x', name: 'Scan', url: 'data:image/png;base64,AAAA', extension: 'png' };
  const { element } = await viewer([picked(broken)], [broken]);
  await open(element);
  await until(element, () => text(element, '.notice') === 'Scan could not be shown.');
});
