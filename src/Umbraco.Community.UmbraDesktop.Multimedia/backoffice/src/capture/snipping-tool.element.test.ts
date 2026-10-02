import { expect, fixture, html } from '@open-wc/testing';
import './snipping-tool.element.js';
import type { SnippingToolElement } from './snipping-tool.element.js';
import { CaptureError } from './media.js';
import { Mixer } from '../shared/mixer.js';

/**
 * Snipping Tool over a fake screen share: a canvas animating, streamed as Chrome streams a shared
 * screen. Camera's tests cover what the two share (keeping, adding, asking); these cover what is the
 * Snipping Tool's own: the browser's picker each time, a screenshot that lets go of the screen at
 * once, and a recording the browser's own Stop sharing ends.
 */

/** A live stream of an animating canvas, standing in for a shared screen. */
function screen(): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const context = canvas.getContext('2d')!;
  let hue = 0;
  const stream = canvas.captureStream(30);
  const draw = () => {
    context.fillStyle = `hsl(${hue++ % 360}, 70%, 50%)`;
    context.fillRect(0, 0, 320, 200);
    if (stream.getVideoTracks()[0].readyState === 'live') requestAnimationFrame(draw);
  };
  draw();
  return stream;
}

/**
 * A mounted Snipping Tool.
 * @param cancel Whether the browser's picker is closed rather than a screen chosen.
 * @returns The element and the streams it was given.
 */
async function tool(cancel = false): Promise<{ element: SnippingToolElement; streams: MediaStream[]; downloads: string[] }> {
  const streams: MediaStream[] = [];
  const downloads: string[] = [];
  const element = await fixture<SnippingToolElement>(html`<umbradesktop-snipping-tool
    .mixer=${new Mixer()}
    .source=${async () => {
      if (cancel) throw new CaptureError('cancelled');
      const stream = screen();
      streams.push(stream);
      return stream;
    }}
    .download=${(_blob: Blob, name: string) => downloads.push(name)}
  ></umbradesktop-snipping-tool>`);
  return { element, streams, downloads };
}

/** Press a control, and let what it started finish. */
async function click(element: SnippingToolElement, action: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  await settle(element);
}

/** Let promises, frames and the element's update finish. */
async function settle(element: SnippingToolElement): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await element.updateComplete;
  }
}

/** Where the tool is. */
function state(element: SnippingToolElement): string | null {
  return element.shadowRoot!.querySelector('.capture')!.getAttribute('data-state');
}

/** A screenshot takes one frame and lets go of the screen at once, so the sharing bar is up for a moment only. */
it('takes a screenshot as a PNG, and stops sharing at once', async () => {
  const { element, streams, downloads } = await tool();
  expect(state(element)).to.equal('idle');
  await click(element, 'photo');
  expect(state(element)).to.equal('review');
  const shot = element.shadowRoot!.querySelector<HTMLImageElement>('img.result')!;
  await new Promise((resolve) => (shot.complete ? resolve(undefined) : shot.addEventListener('load', resolve, { once: true })));
  expect([shot.naturalWidth, shot.naturalHeight]).to.deep.equal([320, 200]);
  expect(streams[0].getTracks().every((track) => track.readyState === 'ended')).to.equal(true);
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.match(/^Screenshot /);
  await click(element, 'download');
  expect(downloads[0]).to.match(/^Screenshot .*\.png$/);
});

/** Selecting Stop sharing in the browser's own bar ends the recording, as Stop does. */
it('records the screen until sharing stops', async () => {
  const { element, streams } = await tool();
  await click(element, 'record');
  expect(state(element)).to.equal('recording');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const track = streams[0].getVideoTracks()[0];
  track.stop();
  track.dispatchEvent(new Event('ended'));
  for (let i = 0; i < 40 && state(element) !== 'review'; i++) await settle(element);
  expect(state(element)).to.equal('review');
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.match(/^Screen recording /);
});

/** Closing the browser's picker is changing your mind: nothing happens, and nothing is said. */
it('does nothing when the picker is closed', async () => {
  const { element } = await tool(true);
  await click(element, 'photo');
  expect(state(element)).to.equal('idle');
  expect(element.shadowRoot!.querySelector('.notice')).to.equal(null);
});
