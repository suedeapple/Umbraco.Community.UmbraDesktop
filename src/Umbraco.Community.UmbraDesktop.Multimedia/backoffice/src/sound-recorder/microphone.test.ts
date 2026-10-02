import { expect } from '@open-wc/testing';
import { problemOf } from './microphone.js';

/**
 * Which problem a refused microphone is, by the error's name, since each is said differently and has
 * a different fix: a permission to grant, a device to plug in, or a program to close.
 */
it('tells a refusal, a missing microphone and anything else apart', () => {
  expect(problemOf(new DOMException('', 'NotAllowedError'))).to.equal('denied');
  expect(problemOf(new DOMException('', 'SecurityError'))).to.equal('denied');
  expect(problemOf(new DOMException('', 'NotFoundError'))).to.equal('missing');
  expect(problemOf(new DOMException('', 'OverconstrainedError'))).to.equal('missing');
  expect(problemOf(new DOMException('', 'NotReadableError'))).to.equal('unavailable');
  expect(problemOf(undefined)).to.equal('unavailable');
});
