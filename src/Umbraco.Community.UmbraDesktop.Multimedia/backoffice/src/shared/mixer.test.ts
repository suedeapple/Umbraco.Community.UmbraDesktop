import { expect } from '@open-wc/testing';
import { CHANNELS, Mixer, MIXER_STORAGE_KEY } from './mixer.js';

/**
 * The mixer every app that makes sound plays through: one master and a channel per app, as Windows'
 * Volume Control had one column per source.
 */

/** A Storage that lives in memory, so a test starts from nothing and can see what was written. */
function memory(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

it('starts every channel at full volume and unmuted', () => {
  const mixer = new Mixer(memory());
  for (const channel of CHANNELS) expect(mixer.get(channel), channel).to.deep.equal({ volume: 1, muted: false });
});

/** What an app plays at is its own channel times the master, and muted if either is. */
it('plays a channel at its volume times the master, muted if either is', () => {
  const mixer = new Mixer(memory());
  mixer.set('mediaplayer', { volume: 0.5 });
  mixer.set('master', { volume: 0.5 });
  expect(mixer.effective('mediaplayer')).to.deep.equal({ volume: 0.25, muted: false });
  mixer.set('master', { muted: true });
  expect(mixer.effective('mediaplayer').muted).to.equal(true);
  expect(mixer.effective('mediaplayer').volume, 'muting keeps the volume to come back to').to.equal(0.25);
  mixer.set('master', { muted: false });
  mixer.set('cdplayer', { muted: true });
  expect(mixer.effective('cdplayer').muted).to.equal(true);
  expect(mixer.effective('mediaplayer').muted, 'one channel muted leaves the others').to.equal(false);
});

it('keeps a volume between 0 and 1', () => {
  const mixer = new Mixer(memory());
  mixer.set('master', { volume: 1.7 });
  expect(mixer.get('master').volume).to.equal(1);
  mixer.set('master', { volume: -0.2 });
  expect(mixer.get('master').volume).to.equal(0);
});

/** Every window listening hears a change made in any of them, as one mixer for the whole desktop. */
it('tells every listener about a change, until it stops listening', () => {
  const mixer = new Mixer(memory());
  const heard: number[] = [];
  const stop = mixer.subscribe(() => heard.push(mixer.get('master').volume));
  mixer.set('master', { volume: 0.4 });
  stop();
  mixer.set('master', { volume: 0.6 });
  expect(heard).to.deep.equal([0.4]);
});

/** Remembered in the browser, as a computer remembers its volume between sessions. */
it('remembers its settings, and reads them back', () => {
  const storage = memory();
  new Mixer(storage).set('soundrecorder', { volume: 0.3, muted: true });
  expect(new Mixer(storage).get('soundrecorder')).to.deep.equal({ volume: 0.3, muted: true });
});

/** A stored value that is damaged, or from a future version, is ignored rather than trusted. */
it('ignores stored settings it cannot read', () => {
  expect(new Mixer(memory({ [MIXER_STORAGE_KEY]: 'not json' })).get('master')).to.deep.equal({ volume: 1, muted: false });
  const odd = JSON.stringify({ master: { volume: 'loud', muted: 'yes' }, mediaplayer: { volume: 0.2, muted: false } });
  const mixer = new Mixer(memory({ [MIXER_STORAGE_KEY]: odd }));
  expect(mixer.get('master')).to.deep.equal({ volume: 1, muted: false });
  expect(mixer.get('mediaplayer')).to.deep.equal({ volume: 0.2, muted: false });
});

/** A browser that refuses storage (a private window, blocked site data) still has a working mixer. */
it('works without storage', () => {
  const broken = memory();
  broken.getItem = () => {
    throw new Error('blocked');
  };
  broken.setItem = () => {
    throw new Error('blocked');
  };
  const mixer = new Mixer(broken);
  mixer.set('master', { volume: 0.5 });
  expect(mixer.get('master').volume).to.equal(0.5);
});
