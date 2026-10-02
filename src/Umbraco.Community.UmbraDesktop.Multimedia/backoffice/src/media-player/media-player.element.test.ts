import { expect, fixture, html } from '@open-wc/testing';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import './media-player.element.js';
import type { MediaPlayerElement } from './media-player.element.js';
import type { MediaPickResult } from '../shared/media-library.js';
import { Mixer } from '../shared/mixer.js';

/**
 * Media Player over a fake media library and a real media element.
 *
 * The picker is faked, since the real one needs a booted backoffice; the file it hands back is a
 * real WAV made here, so loading, the duration, playing, seeking and the end of the file are the
 * browser's own, not stand-ins for them.
 */

/**
 * A WAV file of silence, built in memory: the smallest file every browser plays without a codec.
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

/** A picked file, as the media picker returns it. */
function picked(name: string, extension: string, url = silence(2)): MediaPickResult {
  return { status: 'picked', unique: `${name}-key`, name, url, extension, folder: null };
}

/**
 * A mounted Media Player whose Open answers `answers` in turn.
 * @param answers What each Open finds.
 * @returns The element.
 */
async function player(...answers: MediaPickResult[]): Promise<MediaPlayerElement> {
  return await playerWith(new Mixer(), ...answers);
}

/**
 * A mounted Media Player on a given mixer: a fresh one with no storage for each test, so no test
 * hears another's volume.
 * @param mixer The mixer it plays through.
 * @param answers What each Open finds.
 * @returns The element.
 */
async function playerWith(mixer: Mixer, ...answers: MediaPickResult[]): Promise<MediaPlayerElement> {
  return await fixture<MediaPlayerElement>(html`<umbradesktop-media-player
    .mixer=${mixer}
    .pickMedia=${async () => answers.shift() ?? { status: 'cancelled' }}
  ></umbradesktop-media-player>`);
}

/** The element's media element. */
function media(element: MediaPlayerElement): HTMLVideoElement {
  return element.shadowRoot!.querySelector('video')!;
}

/** A control by its `data-action`. */
function control(element: MediaPlayerElement, action: string): HTMLButtonElement | HTMLInputElement {
  return element.shadowRoot!.querySelector(`[data-action="${action}"]`)!;
}

/** The text of an element in the shadow root, trimmed. */
function text(element: MediaPlayerElement, selector: string): string {
  return (element.shadowRoot!.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Let the queued work finish: promises, the element's update and a few media events. */
async function settle(element: MediaPlayerElement): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
}

/**
 * Wait until `check` holds, for a media event that arrives when the browser is ready.
 * @param element The player, updated between tries.
 * @param check The condition.
 */
async function until(element: MediaPlayerElement, check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
  expect(check(), 'waited for the media element').to.equal(true);
}

/**
 * Press a control with the real mouse. Playing needs it: Chrome refuses `play()` from a scripted
 * click, which carries no user activation, exactly as it refuses autoplay.
 * @param element The player.
 * @param action The control's `data-action`.
 */
async function press(element: MediaPlayerElement, action: string): Promise<void> {
  const box = control(element, action).getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
}

/** Open a file through the toolbar, and let it load. */
async function open(element: MediaPlayerElement): Promise<void> {
  (control(element, 'open') as HTMLButtonElement).click();
  await settle(element);
}

it('opens empty, saying how to start, with nothing to play', async () => {
  const element = await player();
  expect(text(element, '.empty')).to.contain('Open');
  for (const action of ['play', 'stop', 'seek']) {
    expect((control(element, action) as HTMLButtonElement).disabled, action).to.equal(true);
  }
  expect(text(element, '.time')).to.equal('0:00 / 0:00');
});

it('opens a sound file from the media library and shows what is playing', async () => {
  const element = await player(picked('Jingle', 'wav'));
  await open(element);
  expect(media(element).src).to.match(/^blob:/);
  expect(element.shadowRoot!.querySelector('.screen')!.getAttribute('data-kind')).to.equal('audio');
  expect(text(element, '.now-playing')).to.contain('Jingle');
  await until(element, () => text(element, '.time') === '0:00 / 0:02');
  expect((control(element, 'play') as HTMLButtonElement).disabled).to.equal(false);
});

/** A video plays in the screen itself; full screen is for video only, since a sound has no picture. */
it('shows a video on the screen, and offers full screen for it alone', async () => {
  const element = await player(picked('Trailer', 'mp4'), picked('Jingle', 'mp3'));
  await open(element);
  expect(element.shadowRoot!.querySelector('.screen')!.getAttribute('data-kind')).to.equal('video');
  expect((control(element, 'fullscreen') as HTMLButtonElement).disabled).to.equal(false);
  await open(element);
  expect((control(element, 'fullscreen') as HTMLButtonElement).disabled).to.equal(true);
});

it('refuses a file that is neither sound nor video, and keeps what was open', async () => {
  const element = await player(picked('Jingle', 'wav'), picked('Brochure', 'pdf'));
  await open(element);
  const before = media(element).src;
  await open(element);
  expect(text(element, '.notice')).to.equal('Media Player plays sound and video, and Brochure is neither.');
  expect(media(element).src).to.equal(before);
});

it('says which file could not be opened', async () => {
  const element = await player({ status: 'failed', name: 'Lost' });
  await open(element);
  expect(text(element, '.notice')).to.equal('Lost could not be opened.');
});

/** A folder is neither sound nor video, and is said to be, rather than "could not be opened". */
it('refuses a folder chosen in the picker', async () => {
  const element = await player({ status: 'folder', unique: 'f', name: 'Holidays' });
  await open(element);
  expect(text(element, '.notice')).to.equal('Media Player plays sound and video, and Holidays is neither.');
});

it('plays and pauses from one button, which says what it will do', async () => {
  const element = await player(picked('Jingle', 'wav'));
  await open(element);
  await until(element, () => !(control(element, 'play') as HTMLButtonElement).disabled);
  expect(control(element, 'play').getAttribute('aria-label')).to.equal('Play');
  await press(element, 'play');
  await until(element, () => !media(element).paused && control(element, 'play').getAttribute('aria-label') === 'Pause');
  await press(element, 'play');
  await until(element, () => media(element).paused && control(element, 'play').getAttribute('aria-label') === 'Play');
});

it('stops: pauses and goes back to the start', async () => {
  const element = await player(picked('Jingle', 'wav'));
  await open(element);
  await until(element, () => media(element).readyState >= 1);
  media(element).currentTime = 1.2;
  await until(element, () => text(element, '.time') === '0:01 / 0:02');
  await press(element, 'stop');
  await until(element, () => media(element).paused && media(element).currentTime === 0);
  await until(element, () => text(element, '.time') === '0:00 / 0:02');
});

it('seeks where the seek bar is dragged to', async () => {
  const element = await player(picked('Jingle', 'wav'));
  await open(element);
  await until(element, () => !(control(element, 'seek') as HTMLInputElement).disabled);
  const seek = control(element, 'seek') as HTMLInputElement;
  expect(Number(seek.max)).to.be.closeTo(2, 0.01);
  seek.value = '1.5';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  await until(element, () => Math.abs(media(element).currentTime - 1.5) < 0.01);
});

/** At the end the button offers Play again, rather than staying on a Pause that does nothing. */
it('comes back to Play at the end of the file', async () => {
  const element = await player(picked('Blip', 'wav', silence(0.3)));
  await open(element);
  await until(element, () => !(control(element, 'play') as HTMLButtonElement).disabled);
  await press(element, 'play');
  await until(element, () => media(element).ended);
  await until(element, () => control(element, 'play').getAttribute('aria-label') === 'Play');
});

it('mutes and sets the volume', async () => {
  const element = await player(picked('Jingle', 'wav'));
  await open(element);
  const mute = control(element, 'mute') as HTMLButtonElement;
  mute.click();
  await until(element, () => media(element).muted && mute.getAttribute('aria-pressed') === 'true');
  mute.click();
  await until(element, () => !media(element).muted && mute.getAttribute('aria-pressed') === 'false');
  const volume = control(element, 'volume') as HTMLInputElement;
  volume.value = '0.25';
  volume.dispatchEvent(new Event('input', { bubbles: true }));
  await until(element, () => media(element).volume === 0.25);
});

/**
 * Media Player's volume and mute are its column in Volume Control, and the master column turns it
 * down or mutes it on top: one mixer for the whole desktop, not a second volume that disagrees.
 */
it('plays through the mixer: its own column, under the master', async () => {
  const mixer = new Mixer();
  const element = await playerWith(mixer, picked('Jingle', 'wav'));
  await open(element);
  const volume = control(element, 'volume') as HTMLInputElement;
  volume.value = '0.5';
  volume.dispatchEvent(new Event('input', { bubbles: true }));
  expect(mixer.get('mediaplayer').volume, 'the slider is the mixer column').to.equal(0.5);
  mixer.set('master', { volume: 0.5 });
  await until(element, () => media(element).volume === 0.25);
  mixer.set('master', { muted: true });
  await until(element, () => media(element).muted);
  expect(control(element, 'mute').getAttribute('aria-pressed'), 'its own column is not muted').to.equal('false');
  mixer.set('master', { muted: false });
  mixer.set('mediaplayer', { volume: 0.8 });
  await until(element, () => !media(element).muted && Math.abs(media(element).volume - 0.4) < 1e-9);
  expect(Number((control(element, 'volume') as HTMLInputElement).value), 'a change in Volume Control moves the slider').to.equal(0.8);
});

/** A window that is closed stops listening to the mixer. */
it('stops listening to the mixer when its window closes', async () => {
  const mixer = new Mixer();
  const element = await playerWith(mixer, picked('Jingle', 'wav'));
  await open(element);
  const video = media(element);
  element.remove();
  mixer.set('master', { volume: 0.1 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(video.volume).to.equal(1);
});

/**
 * Space plays and pauses, and the arrows skip, as in every player. Only when the keys are not
 * typing into a slider, whose arrows are its own.
 */
it('plays from the keyboard and skips with the arrows', async () => {
  const element = await player(picked('Jingle', 'wav', silence(12)));
  await open(element);
  await until(element, () => media(element).readyState >= 1);
  element.focus();
  await sendKeys({ press: 'ArrowRight' });
  await until(element, () => Math.abs(media(element).currentTime - 5) < 0.01);
  await sendKeys({ press: 'ArrowLeft' });
  await until(element, () => media(element).currentTime === 0);
  await sendKeys({ press: 'Space' });
  await until(element, () => !media(element).paused);
  await sendKeys({ press: 'Space' });
  await until(element, () => media(element).paused);
});

it('opens with Ctrl+O', async () => {
  const element = await player(picked('Jingle', 'wav'));
  element.focus();
  await sendKeys({ down: 'Control' });
  await sendKeys({ press: 'o' });
  await sendKeys({ up: 'Control' });
  await settle(element);
  expect(text(element, '.now-playing')).to.contain('Jingle');
});

/** A file the browser cannot decode, such as a .mov in a codec it lacks, is said so, not left silent. */
it('says so when the browser cannot play the file', async () => {
  const broken = URL.createObjectURL(new Blob(['not a video'], { type: 'video/mp4' }));
  const element = await player(picked('Holiday', 'mov', broken));
  await open(element);
  await until(element, () => text(element, '.notice') === 'Holiday cannot be played in this browser.');
});

/** Closing the window stops the sound: a window that is gone must not go on playing. */
it('stops playing when its window closes', async () => {
  const element = await player(picked('Jingle', 'wav', silence(12)));
  await open(element);
  await until(element, () => !(control(element, 'play') as HTMLButtonElement).disabled);
  await press(element, 'play');
  await until(element, () => !media(element).paused);
  const video = media(element);
  element.remove();
  expect(video.paused).to.equal(true);
});
