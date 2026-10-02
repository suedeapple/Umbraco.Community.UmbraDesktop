import { expect, fixture, html } from '@open-wc/testing';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import './photo-editor.element.js';
import type { PhotoEditorElement } from './photo-editor.element.js';
import type { MediaOpenResult } from '../shared/media-open.js';
import type { MediaSaveRequest, MediaSaveResult } from '../shared/media-save.js';
import type { SaveFolderChoice } from '../shared/save-location.js';

/**
 * Photo Editor over a fake media library and real pictures: open a picture, crop, rotate, flip and
 * resize it, then save it back or as a copy. The pictures are PNGs and JPEGs drawn here, and a saved
 * file is decoded again to check what was saved.
 */

/**
 * A picture of a size, as a file.
 * @param w Its width.
 * @param h Its height.
 * @param type Its format.
 * @returns The file's contents.
 */
async function picture(w: number, h: number, type = 'image/png'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#3544b1';
  context.fillRect(0, 0, w, h);
  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), type));
}

/** A picture in the media library, as the opener returns it. */
async function opened(name = 'Logo', w = 40, h = 20, type = 'image/png', extension = 'png'): Promise<MediaOpenResult> {
  return { status: 'opened', unique: `${name}-key`, name, blob: await picture(w, h, type), extension, updateDate: '2026-09-01T10:00:00' };
}

/** Everything the element asked of the media library. */
interface Recorded {
  saves: MediaSaveRequest[];
  picks: number;
  confirms: number;
  overwrites: string[];
}

/** What the fakes answer. */
interface Fakes {
  saved?: MediaSaveResult[];
  picked?: SaveFolderChoice;
  discard?: boolean;
  overwrite?: boolean;
}

/**
 * A mounted Photo Editor.
 * @param answers What each Open finds.
 * @param fakes What the other fakes answer.
 * @returns The element and what it asked for.
 */
async function editor(answers: MediaOpenResult[], fakes: Fakes = {}): Promise<{ element: PhotoEditorElement; recorded: Recorded }> {
  const recorded: Recorded = { saves: [], picks: 0, confirms: 0, overwrites: [] };
  const saved = fakes.saved ?? [{ ok: true, unique: 'saved-1', updateDate: '2026-09-02T10:00:00' }];
  const element = await fixture<PhotoEditorElement>(html`<div style="width: 700px; height: 500px; display: flex; flex-direction: column">
    <umbradesktop-photo-editor
      style="flex: 1"
      .openFromMedia=${async () => answers.shift() ?? { status: 'cancelled' }}
      .saveToMedia=${async (request: MediaSaveRequest) => {
        recorded.saves.push(request);
        return saved.length > 1 ? saved.shift()! : saved[0];
      }}
      .pickSaveFolder=${async () => {
        recorded.picks++;
        return fakes.picked ?? { status: 'chosen', folder: 'f1' };
      }}
      .confirmDiscard=${async () => {
        recorded.confirms++;
        return fakes.discard ?? true;
      }}
      .confirmOverwrite=${async (name: string) => {
        recorded.overwrites.push(name);
        return fakes.overwrite ?? true;
      }}
    ></umbradesktop-photo-editor>
  </div>`).then((wrapper) => wrapper.querySelector('umbradesktop-photo-editor')!);
  return { element, recorded };
}

/** A control by its `data-action`. */
function control(element: PhotoEditorElement, action: string): HTMLButtonElement {
  return element.shadowRoot!.querySelector(`[data-action="${action}"]`)!;
}

/** Press a control and let what it started finish. */
async function click(element: PhotoEditorElement, action: string): Promise<void> {
  control(element, action).click();
  await settle(element);
}

/** Let promises, a decode and the element's update finish. */
async function settle(element: PhotoEditorElement): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 15));
    await element.updateComplete;
  }
}

/** The text of an element in the shadow root, trimmed. */
function text(element: PhotoEditorElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The picture's size, as the status bar says it. */
function size(element: PhotoEditorElement): string {
  return text(element, '.size');
}

/** Whether the window reports unsaved work. */
function unsaved(element: PhotoEditorElement): boolean {
  return element.hasAttribute('data-umbradesktop-dirty');
}

/** A saved file's size in pixels, decoded again. */
async function decoded(file: File): Promise<[number, number]> {
  const bitmap = await createImageBitmap(file);
  return [bitmap.width, bitmap.height];
}

it('opens empty, saying how to start, with nothing to edit', async () => {
  const { element } = await editor([]);
  expect(text(element, '.empty')).to.contain('Open');
  for (const action of ['save', 'save-as', 'undo', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical', 'crop', 'resize']) {
    expect(control(element, action).disabled, action).to.equal(true);
  }
});

it('opens a picture from the media library', async () => {
  const { element } = await editor([await opened()]);
  await click(element, 'open');
  expect(size(element)).to.equal('40 × 20');
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.equal('Logo');
  expect(unsaved(element)).to.equal(false);
});

it('rotates and flips, and undoes one edit at a time', async () => {
  const { element } = await editor([await opened()]);
  await click(element, 'open');
  await click(element, 'rotate-right');
  expect(size(element)).to.equal('20 × 40');
  expect(unsaved(element)).to.equal(true);
  await click(element, 'flip-horizontal');
  await click(element, 'undo');
  await click(element, 'undo');
  expect(size(element)).to.equal('40 × 20');
  expect(unsaved(element), 'back where it was opened').to.equal(false);
  expect(control(element, 'undo').disabled).to.equal(true);
});

/** A crop is drawn with the mouse on the picture, then applied. */
it('crops to a rectangle drawn on the picture', async () => {
  const { element } = await editor([await opened('Banner', 400, 200)]);
  await click(element, 'open');
  await click(element, 'crop');
  const box = element.shadowRoot!.querySelector('canvas')!.getBoundingClientRect();
  const at = (fx: number, fy: number): [number, number] => [Math.round(box.x + box.width * fx), Math.round(box.y + box.height * fy)];
  await sendMouse({ type: 'move', position: at(0.25, 0.25) });
  await sendMouse({ type: 'down' });
  await sendMouse({ type: 'move', position: at(0.5, 0.5) });
  await sendMouse({ type: 'move', position: at(0.75, 0.75) });
  await sendMouse({ type: 'up' });
  await settle(element);
  await click(element, 'apply-crop');
  const [w, h] = size(element).split(' × ').map(Number);
  expect(w).to.be.closeTo(200, 4);
  expect(h).to.be.closeTo(100, 4);
});

/** Resize keeps the picture's shape: changing the width works out the height. */
it('resizes, keeping the shape', async () => {
  const { element } = await editor([await opened('Banner', 400, 200)]);
  await click(element, 'open');
  await click(element, 'resize');
  const width = element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="width"]')!;
  width.value = '100';
  width.dispatchEvent(new Event('input', { bubbles: true }));
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="height"]')!.value).to.equal('50');
  await click(element, 'apply-resize');
  expect(size(element)).to.equal('100 × 50');
});

/** Save writes back over the item it came from, in its own format, and expects the version it opened. */
it('saves back over the picture it opened, in its own format', async () => {
  const { element, recorded } = await editor([await opened('Photo', 60, 30, 'image/jpeg', 'jpg')]);
  await click(element, 'open');
  await click(element, 'rotate-left');
  await click(element, 'save');
  const [save] = recorded.saves;
  expect(save.existing).to.equal('Photo-key');
  expect(save.expectedUpdateDate).to.equal('2026-09-01T10:00:00');
  expect(save.file.type).to.equal('image/jpeg');
  expect(save.file.name).to.equal('Photo.jpg');
  expect(await decoded(save.file)).to.deep.equal([30, 60]);
  expect(recorded.picks, 'no folder is asked for').to.equal(0);
  expect(unsaved(element)).to.equal(false);
  expect(text(element, '.notice')).to.equal('Saved to the media library.');
});

/** A picture somebody changed in the Media section since it was opened is asked about first. */
it('asks before saving over a picture somebody else changed', async () => {
  const { element, recorded } = await editor([await opened()], {
    saved: [{ ok: false, conflict: true }, { ok: true, unique: 'Logo-key' }],
  });
  await click(element, 'open');
  await click(element, 'flip-vertical');
  await click(element, 'save');
  expect(recorded.overwrites).to.deep.equal(['Logo']);
  expect(recorded.saves.map((save) => !!save.force)).to.deep.equal([false, true]);
});

/** Save As makes a copy, in the folder chosen, under the name typed, leaving the original alone. */
it('saves a copy where Save As is told', async () => {
  const { element, recorded } = await editor([await opened()]);
  await click(element, 'open');
  const name = element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!;
  name.value = 'Logo small';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await click(element, 'save-as');
  const [save] = recorded.saves;
  expect(recorded.picks).to.equal(1);
  expect(save.existing).to.equal(undefined);
  expect(save.folder).to.equal('f1');
  expect(save.name).to.equal('Logo small');
  expect(save.file.name).to.equal('Logo small.png');
});

/** An SVG is a drawing, not pixels, and is refused rather than flattened; anything not a picture too. */
it('refuses a drawing and a file that is not a picture', async () => {
  const svg: MediaOpenResult = { status: 'opened', unique: 's', name: 'Icon', blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), extension: 'svg' };
  const pdf: MediaOpenResult = { status: 'opened', unique: 'p', name: 'Brochure', blob: new Blob(['%PDF'], { type: 'application/pdf' }), extension: 'pdf' };
  const { element } = await editor([svg, pdf]);
  await click(element, 'open');
  expect(text(element, '.notice')).to.equal('Photo Editor edits pictures made of pixels, and Icon is not one.');
  await click(element, 'open');
  expect(text(element, '.notice')).to.equal('Photo Editor edits pictures made of pixels, and Brochure is not one.');
});

it('asks before opening over unsaved edits', async () => {
  const { element, recorded } = await editor([await opened(), await opened('Other')], { discard: false });
  await click(element, 'open');
  await click(element, 'rotate-right');
  await click(element, 'open');
  expect(recorded.confirms).to.equal(1);
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.equal('Logo');
});

it('undoes with Ctrl+Z', async () => {
  const { element } = await editor([await opened()]);
  await click(element, 'open');
  await click(element, 'rotate-right');
  element.focus();
  await sendKeys({ down: 'Control' });
  await sendKeys({ press: 'z' });
  await sendKeys({ up: 'Control' });
  await settle(element);
  expect(size(element)).to.equal('40 × 20');
});
