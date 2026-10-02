import { expect } from '@open-wc/testing';
import { formatTime } from './time.js';

/** The counter beside the seek bar, which reads the way every player's does. */

it('writes minutes and seconds, with the seconds always two digits', () => {
  expect(formatTime(0)).to.equal('0:00');
  expect(formatTime(7.9)).to.equal('0:07');
  expect(formatTime(65)).to.equal('1:05');
  expect(formatTime(59 * 60 + 59)).to.equal('59:59');
});

it('adds hours only for something an hour long, and pads the minutes then', () => {
  expect(formatTime(3600)).to.equal('1:00:00');
  expect(formatTime(2 * 3600 + 3 * 60 + 4)).to.equal('2:03:04');
});

/**
 * A file still loading has no duration (NaN), and a stream has an infinite one. Both read as nothing
 * yet, never as "NaN:NaN".
 */
it('writes 0:00 for a time that is not a number of seconds', () => {
  expect(formatTime(Number.NaN)).to.equal('0:00');
  expect(formatTime(Number.POSITIVE_INFINITY)).to.equal('0:00');
  expect(formatTime(-3)).to.equal('0:00');
});
