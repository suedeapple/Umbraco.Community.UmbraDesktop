import { expect, fixture, html } from '@open-wc/testing';
import './volume-control.element.js';
import type { VolumeControlElement } from './volume-control.element.js';
import { CHANNELS, Mixer } from '../shared/mixer.js';

/**
 * Volume Control: Windows' mixer, a column for the master and one for each app that makes sound,
 * over the desktop's one mixer. A fresh mixer per test, so none hears another's settings.
 */

/** A mounted Volume Control over a mixer. */
async function control(mixer = new Mixer()): Promise<{ element: VolumeControlElement; mixer: Mixer }> {
  const element = await fixture<VolumeControlElement>(html`<umbradesktop-volume-control .mixer=${mixer}></umbradesktop-volume-control>`);
  return { element, mixer };
}

/** One column's parts, by channel. */
function column(element: VolumeControlElement, channel: string) {
  const root = element.shadowRoot!.querySelector(`[data-channel="${channel}"]`)!;
  return {
    name: (root.querySelector('.name')?.textContent ?? '').trim(),
    slider: root.querySelector<HTMLInputElement>('input[type="range"]')!,
    mute: root.querySelector<HTMLInputElement>('input[type="checkbox"]')!,
    level: (root.querySelector('.level')?.textContent ?? '').trim(),
  };
}

it('has a column for the master and one for each app, the master first', async () => {
  const { element } = await control();
  const channels = [...element.shadowRoot!.querySelectorAll('[data-channel]')].map((el) => el.getAttribute('data-channel'));
  expect(channels).to.deep.equal([...CHANNELS]);
  expect(column(element, 'master').name).to.equal('Volume');
  expect(column(element, 'mediaplayer').name).to.equal('Media Player');
  expect(column(element, 'soundrecorder').name).to.equal('Sound Recorder');
  expect(column(element, 'master').level).to.equal('100%');
});

it('sets a column from its slider and its Mute box', async () => {
  const { element, mixer } = await control();
  const { slider, mute } = column(element, 'cdplayer');
  slider.value = '0.4';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(mixer.get('cdplayer').volume).to.equal(0.4);
  mute.click();
  expect(mixer.get('cdplayer').muted).to.equal(true);
  await element.updateComplete;
  expect(column(element, 'cdplayer').level).to.equal('40%');
});

/** A change made anywhere else (Media Player's own slider, another tab) shows here at once. */
it('follows a change made anywhere else', async () => {
  const { element, mixer } = await control();
  mixer.set('mediaplayer', { volume: 0.25, muted: true });
  await element.updateComplete;
  expect(Number(column(element, 'mediaplayer').slider.value)).to.equal(0.25);
  expect(column(element, 'mediaplayer').mute.checked).to.equal(true);
});

/** The sliders stand up, louder at the top, as a mixer's faders do. */
it('stands its sliders upright, louder at the top', async () => {
  const { element } = await control();
  const box = column(element, 'master').slider.getBoundingClientRect();
  expect(box.height).to.be.greaterThan(box.width);
});

it('stops listening to the mixer when its window closes', async () => {
  const { element, mixer } = await control();
  element.remove();
  mixer.set('master', { volume: 0.5 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(Number(column(element, 'master').slider.value)).to.equal(1);
});
