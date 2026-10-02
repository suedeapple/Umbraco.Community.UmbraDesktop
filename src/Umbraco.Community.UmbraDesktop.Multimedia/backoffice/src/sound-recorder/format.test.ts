import { expect } from '@open-wc/testing';
import { extensionFor, fileNameFor, recordingFormat, recordingName } from './format.js';

/**
 * What a recording is saved as. A browser records in the one or two formats it has, and the file's
 * extension is what Umbraco chooses a media type by, so the two have to agree.
 */

/** Opus first, in the container the browser has: WebM in Chrome and Edge, Ogg in Firefox. */
it('records Opus where the browser can, in whichever container it has', () => {
  expect(recordingFormat((type) => type.startsWith('audio/webm'))).to.deep.equal({
    mimeType: 'audio/webm;codecs=opus',
    extension: 'weba',
  });
  expect(recordingFormat((type) => type.startsWith('audio/ogg'))).to.deep.equal({
    mimeType: 'audio/ogg;codecs=opus',
    extension: 'oga',
  });
});

/** Safari records AAC in MP4, and nothing else. */
it('falls back to MP4 where that is all there is', () => {
  expect(recordingFormat((type) => type === 'audio/mp4')).to.deep.equal({ mimeType: 'audio/mp4', extension: 'm4a' });
});

/** A browser that names no format it supports still records, in its default, named after the fact. */
it('leaves the format to the browser when it supports none of them by name', () => {
  expect(recordingFormat(() => false)).to.deep.equal({ mimeType: '', extension: 'weba' });
});

/**
 * Umbraco's own Audio media type accepts mp3, weba, oga and opus, so a recording saved with one of
 * those becomes an Audio item rather than a File. WebM sound is `.weba`, not `.webm`, which Umbraco
 * files under Video.
 */
it('names the file by the type the browser actually recorded', () => {
  expect(extensionFor('audio/webm;codecs=opus')).to.equal('weba');
  expect(extensionFor('audio/webm')).to.equal('weba');
  expect(extensionFor('audio/ogg; codecs=opus')).to.equal('oga');
  expect(extensionFor('audio/mp4')).to.equal('m4a');
  expect(extensionFor('audio/mpeg')).to.equal('mp3');
  expect(extensionFor('audio/wav')).to.equal('wav');
  expect(extensionFor('')).to.equal('weba');
});

/**
 * A new recording is named for when it was made, as a sound recorder names a take, with no colons,
 * which a file name on Windows cannot hold.
 */
it('names a recording by when it was made', () => {
  expect(recordingName('Recording', new Date(2026, 9, 2, 9, 5, 7))).to.equal('Recording 2026-10-02 09-05-07');
});

/**
 * The file takes the recording's name, which the person may have typed anything into. The media
 * item keeps the name as typed; only the file's name loses what a file name cannot hold.
 */
it('names the file after the recording, without what a file name cannot hold', () => {
  expect(fileNameFor('Intro', 'weba')).to.equal('Intro.weba');
  expect(fileNameFor('  Q&A: part 1/2?  ', 'oga')).to.equal('Q&A- part 1-2-.oga');
});
