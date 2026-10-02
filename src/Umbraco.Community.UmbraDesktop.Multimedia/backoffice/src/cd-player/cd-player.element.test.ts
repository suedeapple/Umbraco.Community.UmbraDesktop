import { expect, fixture, html } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import './cd-player.element.js';
import type { CdPlayerElement } from './cd-player.element.js';
import type { MediaFile } from '../shared/media-kinds.js';
import type { MediaPickResult } from '../shared/media-library.js';
import { Mixer } from '../shared/mixer.js';

/**
 * CD Player over a fake media library and real sound: a media folder is the disc, its sound files the
 * tracks. The picker and the folder are faked; the tracks are WAVs of silence made here, so playing,
 * the end of a track and moving on are the browser's own.
 */

/**
 * A WAV file of silence, built in memory.
 * @param seconds How long it lasts.
 * @returns Its object URL.
 */
function silence(seconds: number): string {
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
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

/**
 * A disc of three short tracks.
 * @param seconds How long each track lasts.
 * @returns The tracks.
 */
function disc(seconds = 0.3): MediaFile[] {
  return ['Intro', 'Verse', 'Outro'].map((name, i) => ({ unique: `t${i}`, name, url: silence(seconds), extension: 'wav' }));
}

/** What the fakes recorded. */
interface Recorded {
  /** Every folder listed. */
  folders: Array<string | null>;
}

/**
 * A mounted CD Player.
 * @param answers What each Open finds.
 * @param tracks What listing a folder finds.
 * @param mixer The mixer it plays through.
 * @returns The element and what it asked for.
 */
async function player(
  answers: MediaPickResult[],
  tracks: MediaFile[] = disc(),
  mixer = new Mixer(),
): Promise<{ element: CdPlayerElement; recorded: Recorded }> {
  const recorded: Recorded = { folders: [] };
  const element = await fixture<CdPlayerElement>(html`<umbradesktop-cd-player
    .mixer=${mixer}
    .random=${() => 0}
    .pickMedia=${async () => answers.shift() ?? { status: 'cancelled' }}
    .listSounds=${async (folder: string | null) => {
      recorded.folders.push(folder);
      return tracks;
    }}
  ></umbradesktop-cd-player>`);
  return { element, recorded };
}

/** A control by its `data-action`. */
function control(element: CdPlayerElement, action: string): HTMLButtonElement {
  return element.shadowRoot!.querySelector(`[data-action="${action}"]`)!;
}

/** The text of an element in the shadow root, with its white space collapsed. */
function text(element: CdPlayerElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The track list's rows, as their text. */
function tracks(element: CdPlayerElement): string[] {
  return [...element.shadowRoot!.querySelectorAll('.track')].map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim());
}

/** The audio element. */
function audio(element: CdPlayerElement): HTMLAudioElement {
  return element.shadowRoot!.querySelector('audio')!;
}

/** Open through the toolbar, and let it load. */
async function open(element: CdPlayerElement): Promise<void> {
  control(element, 'open').click();
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
}

/**
 * Press something with the real mouse: Chrome refuses `play()` from a scripted click.
 * @param target What to press.
 */
async function press(target: Element): Promise<void> {
  const box = target.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
}

/**
 * Wait until `check` holds.
 * @param element The player, updated between tries.
 * @param check The condition.
 */
async function until(element: CdPlayerElement, check: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
  expect(check(), 'waited for the player').to.equal(true);
}

it('opens empty, saying how to start, with nothing to play', async () => {
  const { element } = await player([]);
  expect(text(element, '.empty')).to.contain('Open');
  for (const action of ['play', 'stop', 'previous', 'next']) expect(control(element, action).disabled, action).to.equal(true);
});

/** A folder chosen is the disc: its sound files are the tracks, ready at the first. */
it('opens a folder as a disc, its sound files as the tracks', async () => {
  const { element, recorded } = await player([{ status: 'folder', unique: 'album', name: 'Album' }]);
  await open(element);
  expect(recorded.folders).to.deep.equal(['album']);
  expect(tracks(element)).to.deep.equal(['1 Intro', '2 Verse', '3 Outro']);
  expect(text(element, '.track-number')).to.equal('01');
  expect(text(element, '.track-name')).to.equal('Intro');
  expect(text(element, '.disc')).to.equal('Album');
});

/** A sound file chosen brings its folder as the disc, ready at that track. */
it('opens a sound file with the rest of its folder, ready at that track', async () => {
  const [, verse] = disc();
  const { element, recorded } = await player([{ status: 'picked', ...verse, folder: 'album' }], [disc()[0], verse, disc()[2]]);
  await open(element);
  expect(recorded.folders).to.deep.equal(['album']);
  expect(text(element, '.track-number')).to.equal('02');
  expect(element.shadowRoot!.querySelector('.track[aria-current="true"]')!.textContent).to.contain('Verse');
});

it('refuses a file that is not sound, and a folder with no sound in it', async () => {
  const { element } = await player(
    [
      { status: 'picked', unique: 'p', name: 'Cover', url: '/media/p/cover.jpg', extension: 'jpg', folder: null },
      { status: 'folder', unique: 'photos', name: 'Photos' },
    ],
    [],
  );
  await open(element);
  expect(text(element, '.notice')).to.equal('CD Player plays sound files, and Cover is not one.');
  await open(element);
  expect(text(element, '.notice')).to.equal('Photos has no sound files in it.');
});

/** A track that ends goes on to the next, playing, and the disc stops after the last, back at track 1. */
it('plays the disc through, track after track, and stops at the end', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }]);
  await open(element);
  await until(element, () => !control(element, 'play').disabled);
  await press(control(element, 'play'));
  await until(element, () => text(element, '.track-number') === '02' && !audio(element).paused);
  await until(element, () => text(element, '.track-number') === '03');
  await until(element, () => text(element, '.track-number') === '01' && audio(element).paused);
  expect(control(element, 'play').getAttribute('aria-label')).to.equal('Play');
});

it('plays a track chosen from the list', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }], disc(5));
  await open(element);
  await press(element.shadowRoot!.querySelectorAll('.track')[2]);
  await until(element, () => text(element, '.track-number') === '03' && !audio(element).paused);
});

it('moves between tracks with Previous and Next', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }]);
  await open(element);
  control(element, 'next').click();
  await element.updateComplete;
  expect(text(element, '.track-number')).to.equal('02');
  control(element, 'previous').click();
  await element.updateComplete;
  expect(text(element, '.track-number')).to.equal('01');
});

/** Previous a few seconds into a track starts it again, as on every CD player; pressed again, it goes back. */
it('starts the track again with Previous a few seconds in', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }], disc(12));
  await open(element);
  control(element, 'next').click();
  await until(element, () => audio(element).readyState >= 1 && text(element, '.track-number') === '02');
  audio(element).currentTime = 5;
  await until(element, () => audio(element).currentTime >= 5);
  control(element, 'previous').click();
  await until(element, () => audio(element).currentTime === 0);
  expect(text(element, '.track-number')).to.equal('02');
});

it('stops: pauses and goes back to the start of the track', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }], disc(12));
  await open(element);
  await until(element, () => !control(element, 'play').disabled);
  await press(control(element, 'play'));
  await until(element, () => !audio(element).paused);
  control(element, 'stop').click();
  await until(element, () => audio(element).paused && audio(element).currentTime === 0);
});

it('shuffles, and cycles repeat through off, all and one', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }]);
  await open(element);
  control(element, 'shuffle').click();
  await element.updateComplete;
  expect(control(element, 'shuffle').getAttribute('aria-pressed')).to.equal('true');
  const repeat = control(element, 'repeat');
  expect(repeat.getAttribute('aria-label')).to.equal('Repeat: off');
  for (const label of ['Repeat: all', 'Repeat: one', 'Repeat: off']) {
    repeat.click();
    await element.updateComplete;
    expect(repeat.getAttribute('aria-label')).to.equal(label);
  }
});

/** CD Player has its own column in Volume Control, under the master. */
it('plays through its column in the mixer', async () => {
  const mixer = new Mixer();
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }], disc(), mixer);
  await open(element);
  mixer.set('cdplayer', { volume: 0.5 });
  mixer.set('master', { volume: 0.5 });
  await until(element, () => audio(element).volume === 0.25);
});

it('stops playing when its window closes', async () => {
  const { element } = await player([{ status: 'folder', unique: 'album', name: 'Album' }], disc(12));
  await open(element);
  await until(element, () => !control(element, 'play').disabled);
  await press(control(element, 'play'));
  await until(element, () => !audio(element).paused);
  const sound = audio(element);
  element.remove();
  expect(sound.paused).to.equal(true);
});
