import { expect } from '@open-wc/testing';
import { createPlaylist, nextTrack, previousTrack, setShuffle } from './playlist.js';

/**
 * CD Player's playlist: which track comes next, in order or shuffled, with repeat off, all or one.
 * Pure, so the rules a CD player has always had can be read and tested without playing anything.
 */

/** A random source that returns these numbers in turn, so a shuffle is the same every run. */
function sequence(...values: number[]): () => number {
  return () => values.shift() ?? 0;
}

it('plays in order from the track chosen', () => {
  const list = createPlaylist(4, 1);
  expect(list.order).to.deep.equal([0, 1, 2, 3]);
  expect(list.current).to.equal(1);
});

it('goes to the next track, and stops after the last with repeat off', () => {
  let list = createPlaylist(3, 1);
  list = nextTrack(list)!;
  expect(list.current).to.equal(2);
  expect(nextTrack(list), 'the end of the disc').to.equal(undefined);
});

it('goes round to the first with repeat all, and stays put with repeat one', () => {
  const all = { ...createPlaylist(3, 2), repeat: 'all' as const };
  expect(nextTrack(all)!.current).to.equal(0);
  const one = { ...createPlaylist(3, 2), repeat: 'one' as const };
  expect(nextTrack(one)!.current).to.equal(2);
});

/**
 * Next and Previous pressed by hand always move, whatever the repeat: repeat one is about what
 * happens at the end of a track, not a lock on it.
 */
it('moves on a press even with repeat one', () => {
  const one = { ...createPlaylist(3, 1), repeat: 'one' as const };
  expect(nextTrack(one, { pressed: true })!.current).to.equal(2);
  expect(previousTrack(one)!.current).to.equal(0);
});

it('goes to the previous track, staying on the first unless repeating', () => {
  expect(previousTrack(createPlaylist(3, 1))!.current).to.equal(0);
  expect(previousTrack(createPlaylist(3, 0))!.current).to.equal(0);
  expect(previousTrack({ ...createPlaylist(3, 0), repeat: 'all' })!.current).to.equal(2);
});

/** Shuffle plays every track once, in a random order, starting from the one playing now. */
it('shuffles every track once, keeping the one playing first', () => {
  const list = setShuffle(createPlaylist(4, 2), true, sequence(0.9, 0.1, 0.5));
  expect(list.shuffle).to.equal(true);
  expect(list.order[0]).to.equal(2);
  expect([...list.order].sort()).to.deep.equal([0, 1, 2, 3]);
  expect(list.current).to.equal(2);
  // Next follows the shuffled order, not the disc's.
  expect(nextTrack(list)!.current).to.equal(list.order[1]);
});

it('goes back to the disc order when shuffle is turned off, still on the same track', () => {
  const shuffled = setShuffle(createPlaylist(4, 2), true, sequence(0.9, 0.1, 0.5));
  const plain = setShuffle(nextTrack(shuffled)!, false);
  expect(plain.order).to.deep.equal([0, 1, 2, 3]);
  expect(plain.current).to.equal(shuffled.order[1]);
});

it('has nothing to play on an empty disc', () => {
  const list = createPlaylist(0, 0);
  expect(nextTrack(list)).to.equal(undefined);
  expect(previousTrack(list)).to.equal(undefined);
});
