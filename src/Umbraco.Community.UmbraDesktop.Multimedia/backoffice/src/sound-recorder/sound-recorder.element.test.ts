import { expect, fixture, html } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import './sound-recorder.element.js';
import type { SoundRecorderElement } from './sound-recorder.element.js';
import { MicrophoneError } from './microphone.js';
import type { MicrophoneProblem, MicrophoneSession } from './microphone.js';
import type { MediaAddRequest, MediaAddResult } from '../shared/media-save.js';
import type { SaveFolderChoice } from '../shared/save-location.js';
import { Mixer } from '../shared/mixer.js';

/**
 * Sound Recorder over a fake microphone and a fake media library.
 *
 * A test runner has no microphone, and in CI not even a fake one, so the session is faked: it
 * "records" a real WAV, which is what the playback tests then play. The real microphone is proven in
 * a running backoffice, under a browser given a fake capture device.
 */

/**
 * A WAV file of silence, built in memory, as the fake microphone's recording.
 * @param seconds How long it lasts.
 * @returns The file.
 */
function silence(seconds: number): Blob {
  const rate = 8000;
  const samples = Math.round(rate * seconds);
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Everything the element asked for, recorded. */
interface Recorded {
  /** How many times the microphone was opened. */
  opened: number;
  /** How many sessions were cancelled rather than stopped. */
  cancelled: number;
  /** Every file downloaded, with its name. */
  downloads: Array<{ blob: Blob; name: string }>;
  /** Every add to the media library. */
  adds: MediaAddRequest[];
  /** How many times the discard question was asked. */
  confirms: number;
}

/** What the fakes answer. */
interface Fakes {
  /** A problem the microphone refuses with, instead of recording. */
  problem?: MicrophoneProblem;
  /** What an add to the media library answers. */
  added?: MediaAddResult;
  /** Where Save As is told to put the recording. */
  picked?: SaveFolderChoice;
  /** What the discard question answers. */
  discard?: boolean;
  /** The longest recording, in seconds. */
  maxSeconds?: number;
  /** The mixer it plays back through. A fresh one unless a test needs to reach it. */
  mixer?: Mixer;
}

/**
 * A mounted Sound Recorder over the fakes.
 * @param fakes What the fakes answer.
 * @returns The element and what it asked for.
 */
async function recorder(fakes: Fakes = {}): Promise<{ element: SoundRecorderElement; recorded: Recorded }> {
  const recorded: Recorded = { opened: 0, cancelled: 0, downloads: [], adds: [], confirms: 0 };
  const microphone = async (): Promise<MicrophoneSession> => {
    recorded.opened++;
    if (fakes.problem) throw new MicrophoneError(fakes.problem);
    return {
      wave: (into) => into.fill(128),
      stop: async () => ({ blob: silence(2), extension: 'weba' }),
      cancel: () => recorded.cancelled++,
    };
  };
  const element = await fixture<SoundRecorderElement>(html`<umbradesktop-sound-recorder
    .microphone=${microphone}
    .maxSeconds=${fakes.maxSeconds ?? 600}
    .mixer=${fakes.mixer ?? new Mixer()}
    .download=${(blob: Blob, name: string) => recorded.downloads.push({ blob, name })}
    .addToMedia=${async (request: MediaAddRequest) => {
      recorded.adds.push(request);
      return fakes.added ?? { ok: true, unique: 'media-1' };
    }}
    .pickSaveFolder=${async () => fakes.picked ?? { status: 'chosen', folder: 'sounds' }}
    .confirmDiscard=${async () => {
      recorded.confirms++;
      return fakes.discard ?? true;
    }}
  ></umbradesktop-sound-recorder>`);
  return { element, recorded };
}

/** A control by its `data-action`. */
function control(element: SoundRecorderElement, action: string): HTMLButtonElement {
  return element.shadowRoot!.querySelector(`[data-action="${action}"]`)!;
}

/** The text of an element in the shadow root, with its white space collapsed. */
function text(element: SoundRecorderElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The recording's name field. */
function nameField(element: SoundRecorderElement): HTMLInputElement {
  return element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!;
}

/** Press a control, and let what it started finish. */
async function click(element: SoundRecorderElement, action: string): Promise<void> {
  control(element, action).click();
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
}

/**
 * Wait until `check` holds.
 * @param element The recorder, updated between tries.
 * @param check The condition.
 */
async function until(element: SoundRecorderElement, check: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
  expect(check(), 'waited for the recorder').to.equal(true);
}

/** Record, and stop: a finished recording. */
async function take(element: SoundRecorderElement): Promise<void> {
  await click(element, 'record');
  await click(element, 'stop');
}

/** Whether the window reports unsaved work. */
function unsaved(element: SoundRecorderElement): boolean {
  return element.hasAttribute('data-umbradesktop-dirty');
}

it('opens ready to record, with nothing to play or keep', async () => {
  const { element } = await recorder();
  expect(control(element, 'record').disabled).to.equal(false);
  for (const action of ['stop', 'play', 'download', 'add']) expect(control(element, action).disabled, action).to.equal(true);
  expect(text(element, '.time')).to.equal('0:00');
  expect(unsaved(element)).to.equal(false);
});

it('records, counting the time, and counts as unsaved while it does', async () => {
  const { element, recorded } = await recorder();
  await click(element, 'record');
  expect(recorded.opened).to.equal(1);
  expect(element.shadowRoot!.querySelector('.recorder')!.getAttribute('data-state')).to.equal('recording');
  expect(control(element, 'record').disabled).to.equal(true);
  expect(control(element, 'stop').disabled).to.equal(false);
  expect(unsaved(element)).to.equal(true);
  await until(element, () => text(element, '.time') === '0:01');
});

/** A finished recording is named for when it was made, and can be played, downloaded or added. */
it('stops, and offers the recording to play, download or add to the media library', async () => {
  const { element } = await recorder();
  await take(element);
  expect(element.shadowRoot!.querySelector('.recorder')!.getAttribute('data-state')).to.equal('recorded');
  for (const action of ['play', 'download', 'add']) expect(control(element, action).disabled, action).to.equal(false);
  expect(nameField(element).value).to.match(/^Recording \d{4}-\d\d-\d\d \d\d-\d\d-\d\d$/);
  expect(element.shadowRoot!.querySelector('audio')!.src).to.match(/^blob:/);
  expect(unsaved(element)).to.equal(true);
});

it('downloads the recording under its name, which keeps it', async () => {
  const { element, recorded } = await recorder();
  await take(element);
  nameField(element).value = 'Intro';
  nameField(element).dispatchEvent(new Event('input', { bubbles: true }));
  await click(element, 'download');
  expect(recorded.downloads.map((download) => download.name)).to.deep.equal(['Intro.weba']);
  expect(recorded.downloads[0].blob.size).to.be.greaterThan(44);
  expect(unsaved(element)).to.equal(false);
});

/** Add to Media asks where, as Save As does, and adds the recording there under its name. */
it('adds the recording to the media library, in the folder chosen', async () => {
  const { element, recorded } = await recorder();
  await take(element);
  nameField(element).value = 'Intro';
  nameField(element).dispatchEvent(new Event('input', { bubbles: true }));
  await click(element, 'add');
  expect(recorded.adds).to.have.length(1);
  expect(recorded.adds[0].name).to.equal('Intro');
  expect(recorded.adds[0].file.name).to.equal('Intro.weba');
  expect(recorded.adds[0].folder).to.equal('sounds');
  expect(text(element, '.notice')).to.equal('Added to the media library.');
  expect(unsaved(element)).to.equal(false);
  // Added once: a second press would make a second copy.
  expect(control(element, 'add').disabled).to.equal(true);
});

it('adds nothing when Save As is cancelled', async () => {
  const { element, recorded } = await recorder({ picked: { status: 'cancelled' } });
  await take(element);
  await click(element, 'add');
  expect(recorded.adds).to.have.length(0);
  expect(unsaved(element)).to.equal(true);
});

/** A folder that does not allow sound refuses it in Umbraco's own words, and the recording is kept. */
it('says why the media library refused it, and keeps the recording', async () => {
  const { element } = await recorder({ added: { ok: false, message: 'Audio is not allowed here.' } });
  await take(element);
  await click(element, 'add');
  expect(text(element, '.notice')).to.equal('Not added. Audio is not allowed here.');
  expect(unsaved(element)).to.equal(true);
  expect(control(element, 'add').disabled).to.equal(false);
});

/** A new recording over one that was neither downloaded nor added asks first, as Notepad's New does. */
it('asks before recording over a recording that has not been kept', async () => {
  const { element, recorded } = await recorder({ discard: false });
  await take(element);
  await click(element, 'record');
  expect(recorded.confirms).to.equal(1);
  expect(recorded.opened).to.equal(1);
  expect(element.shadowRoot!.querySelector('.recorder')!.getAttribute('data-state')).to.equal('recorded');
});

it('records again without asking once the last recording was kept', async () => {
  const { element, recorded } = await recorder();
  await take(element);
  await click(element, 'download');
  await click(element, 'record');
  expect(recorded.confirms).to.equal(0);
  expect(recorded.opened).to.equal(2);
});

/** Each way the microphone can be out of reach is said differently, since each has its own fix. */
for (const [problem, words] of [
  ['denied', 'The microphone was not allowed. Allow it for this site in the browser, then select Record again.'],
  ['missing', 'No microphone was found.'],
  ['insecure', 'The browser only allows recording when the backoffice is on HTTPS.'],
  ['unavailable', 'The microphone could not be started. It may be in use by another program.'],
] as const) {
  it(`says so when the microphone is ${problem}`, async () => {
    const { element } = await recorder({ problem });
    await click(element, 'record');
    expect(text(element, '.notice')).to.equal(words);
    expect(element.shadowRoot!.querySelector('.recorder')!.getAttribute('data-state')).to.equal('idle');
    expect(unsaved(element)).to.equal(false);
  });
}

/** Closing the window mid-recording lets go of the microphone, or the browser's red dot stays on. */
it('lets go of the microphone when its window closes mid-recording', async () => {
  const { element, recorded } = await recorder();
  await click(element, 'record');
  element.remove();
  expect(recorded.cancelled).to.equal(1);
});

/** A quick clip, not a dictation machine: a recording stops by itself at the limit. */
it('stops by itself at the longest a recording may be', async () => {
  const { element } = await recorder({ maxSeconds: 1 });
  await click(element, 'record');
  await until(element, () => element.shadowRoot!.querySelector('.recorder')!.getAttribute('data-state') === 'recorded');
  expect(text(element, '.notice')).to.equal('Recording stopped at the 0:01 limit.');
});

/** Play needs the real mouse: Chrome refuses `play()` from a scripted click. */
it('plays the recording back, and stops it', async () => {
  const { element } = await recorder();
  await take(element);
  const audio = element.shadowRoot!.querySelector('audio')!;
  const box = control(element, 'play').getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
  await until(element, () => !audio.paused && control(element, 'play').getAttribute('aria-label') === 'Pause');
  // The counter follows playback, rather than sitting at the start while the sound plays.
  await until(element, () => audio.currentTime >= 1.05 || audio.ended);
  await until(element, () => text(element, '.time').startsWith('0:01 / '));
  await click(element, 'stop');
  await until(element, () => audio.paused && audio.currentTime === 0);
});

/** Playback goes through the mixer's Sound Recorder column, under the master, like every player here. */
it('plays back through its column in the mixer', async () => {
  const mixer = new Mixer();
  const { element } = await recorder({ mixer });
  await take(element);
  const audio = element.shadowRoot!.querySelector('audio')!;
  mixer.set('soundrecorder', { volume: 0.5 });
  mixer.set('master', { volume: 0.5 });
  await until(element, () => audio.volume === 0.25);
  mixer.set('soundrecorder', { muted: true });
  await until(element, () => audio.muted);
});
