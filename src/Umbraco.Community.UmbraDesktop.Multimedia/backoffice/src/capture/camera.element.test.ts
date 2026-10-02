import { expect, fixture, html } from '@open-wc/testing';
import './camera.element.js';
import type { CameraElement } from './camera.element.js';
import { CaptureError } from './media.js';
import type { CaptureProblem } from './media.js';
import { Mixer } from '../shared/mixer.js';
import type { MediaAddRequest, MediaAddResult } from '../shared/media-save.js';

/**
 * Camera over a fake webcam: a canvas animating, which Chrome streams exactly as it streams a webcam,
 * so the preview, the photo and the recording are the browser's own. The media library is faked.
 */

/** Everything the element asked for, recorded. */
interface Recorded {
  /** The streams handed out, to check they were let go of. */
  streams: MediaStream[];
  downloads: Array<{ blob: Blob; name: string }>;
  adds: MediaAddRequest[];
  confirms: number;
}

/** What the fakes answer. */
interface Fakes {
  problem?: CaptureProblem;
  discard?: boolean;
  added?: MediaAddResult;
}

/** A live stream of an animating canvas, standing in for a webcam. */
function webcam(): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const context = canvas.getContext('2d')!;
  let hue = 0;
  const stream = canvas.captureStream(30);
  const draw = () => {
    context.fillStyle = `hsl(${hue++ % 360}, 70%, 50%)`;
    context.fillRect(0, 0, 160, 120);
    if (stream.getVideoTracks()[0].readyState === 'live') requestAnimationFrame(draw);
  };
  draw();
  return stream;
}

/**
 * A mounted Camera.
 * @param fakes What the fakes answer.
 * @returns The element and what it asked for.
 */
async function camera(fakes: Fakes = {}): Promise<{ element: CameraElement; recorded: Recorded }> {
  const recorded: Recorded = { streams: [], downloads: [], adds: [], confirms: 0 };
  const element = await fixture<CameraElement>(html`<umbradesktop-camera
    .mixer=${new Mixer()}
    .source=${async () => {
      if (fakes.problem) throw new CaptureError(fakes.problem);
      const stream = webcam();
      recorded.streams.push(stream);
      return stream;
    }}
    .download=${(blob: Blob, name: string) => recorded.downloads.push({ blob, name })}
    .addToMedia=${async (request: MediaAddRequest) => {
      recorded.adds.push(request);
      return fakes.added ?? { ok: true, unique: 'm1' };
    }}
    .pickSaveFolder=${async () => ({ status: 'chosen', folder: 'photos' })}
    .confirmDiscard=${async () => {
      recorded.confirms++;
      return fakes.discard ?? true;
    }}
  ></umbradesktop-camera>`);
  return { element, recorded };
}

/** A control by its `data-action`. */
function control(element: CameraElement, action: string): HTMLButtonElement | null {
  return element.shadowRoot!.querySelector(`[data-action="${action}"]`);
}

/** Press a control, and let what it started finish. */
async function click(element: CameraElement, action: string): Promise<void> {
  control(element, action)!.click();
  await settle(element);
}

/** Let promises, frames and the element's update finish. */
async function settle(element: CameraElement): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await element.updateComplete;
  }
}

/** Where the camera is. */
function state(element: CameraElement): string | null {
  return element.shadowRoot!.querySelector('.capture')!.getAttribute('data-state');
}

/** The text of an element in the shadow root, trimmed. */
function text(element: CameraElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Whether every stream handed out was let go of: the webcam's light is off. */
function allStopped(recorded: Recorded): boolean {
  return recorded.streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'));
}

/** The camera stays off until asked: its light never comes on just because the window opened. */
it('opens with the camera off, until Start camera', async () => {
  const { element, recorded } = await camera();
  expect(state(element)).to.equal('idle');
  expect(recorded.streams).to.have.length(0);
  await click(element, 'start');
  expect(state(element)).to.equal('live');
  expect(element.shadowRoot!.querySelector<HTMLVideoElement>('video.preview')!.srcObject).to.equal(recorded.streams[0]);
});

/** A photo is the frame the preview shows, at the camera's size, and the camera goes off to review it. */
it('takes a photo, and turns the camera off to show it', async () => {
  const { element, recorded } = await camera();
  await click(element, 'start');
  await click(element, 'photo');
  expect(state(element)).to.equal('review');
  const photo = element.shadowRoot!.querySelector<HTMLImageElement>('img.result')!;
  await new Promise((resolve) => (photo.complete ? resolve(undefined) : photo.addEventListener('load', resolve, { once: true })));
  expect([photo.naturalWidth, photo.naturalHeight]).to.deep.equal([160, 120]);
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.match(/^Photo \d{4}-\d\d-\d\d/);
  expect(allStopped(recorded)).to.equal(true);
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
});

it('downloads a photo as a JPEG under its name, which keeps it', async () => {
  const { element, recorded } = await camera();
  await click(element, 'start');
  await click(element, 'photo');
  await click(element, 'download');
  expect(recorded.downloads[0].name).to.match(/^Photo .*\.jpg$/);
  expect(recorded.downloads[0].blob.type).to.equal('image/jpeg');
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
});

it('adds a photo to the media library in the folder chosen, once', async () => {
  const { element, recorded } = await camera();
  await click(element, 'start');
  await click(element, 'photo');
  await click(element, 'add');
  expect(recorded.adds).to.have.length(1);
  expect(recorded.adds[0].folder).to.equal('photos');
  expect(recorded.adds[0].file.name).to.match(/\.jpg$/);
  expect(text(element, '.notice')).to.equal('Added to the media library.');
  expect(control(element, 'add')!.disabled).to.equal(true);
});

it('records a video, and turns the camera off to show it', async () => {
  const { element, recorded } = await camera();
  await click(element, 'start');
  await click(element, 'record');
  expect(state(element)).to.equal('recording');
  await new Promise((resolve) => setTimeout(resolve, 600));
  await click(element, 'stop');
  for (let i = 0; i < 40 && state(element) !== 'review'; i++) await settle(element);
  expect(state(element)).to.equal('review');
  expect(element.shadowRoot!.querySelector<HTMLVideoElement>('video.result')!.src).to.match(/^blob:/);
  expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.match(/^Video /);
  expect(allStopped(recorded)).to.equal(true);
  await click(element, 'download');
  expect(recorded.downloads[0].name).to.match(/\.webm$/);
});

/** Back to the camera over a photo that was not kept asks first, as Sound Recorder does. */
it('asks before leaving a photo that was not kept', async () => {
  const { element, recorded } = await camera({ discard: false });
  await click(element, 'start');
  await click(element, 'photo');
  await click(element, 'again');
  expect(recorded.confirms).to.equal(1);
  expect(state(element)).to.equal('review');
});

it('turns the camera off', async () => {
  const { element, recorded } = await camera();
  await click(element, 'start');
  await click(element, 'off');
  expect(state(element)).to.equal('idle');
  expect(allStopped(recorded)).to.equal(true);
});

/** Closing the window turns the camera off: a light left on with no window to turn it off is the worst outcome. */
it('turns the camera off when its window closes', async () => {
  const { element, recorded } = await camera();
  await click(element, 'start');
  element.remove();
  expect(allStopped(recorded)).to.equal(true);
});

for (const [problem, words] of [
  ['denied', 'The camera was not allowed. Allow it for this site in the browser, then try again.'],
  ['missing', 'No camera was found.'],
  ['insecure', 'The browser only allows the camera when the backoffice is on HTTPS.'],
  ['unavailable', 'The camera could not be started. It may be in use by another program.'],
] as const) {
  it(`says so when the camera is ${problem}`, async () => {
    const { element } = await camera({ problem });
    await click(element, 'start');
    expect(text(element, '.notice')).to.equal(words);
    expect(state(element)).to.equal('idle');
  });
}
