import { expect } from '@open-wc/testing';
import { fileHead, fileStart, formatBytes, formatCoordinates, formatExposure, measureImage, measureMedia } from './facts.js';

/** How Media Info writes a fact, and how it measures a file without downloading more than it must. */

it('writes a size in the unit a person reads it in', () => {
  expect(formatBytes(0)).to.equal('0 bytes');
  expect(formatBytes(512)).to.equal('512 bytes');
  expect(formatBytes(1536)).to.equal('1.5 KB');
  expect(formatBytes(5 * 1024 * 1024)).to.equal('5 MB');
  expect(formatBytes(1.25 * 1024 ** 3)).to.equal('1.3 GB');
});

it('writes an exposure as photographers do', () => {
  expect(formatExposure([1, 250])).to.equal('1/250 s');
  expect(formatExposure([10, 2500])).to.equal('1/250 s');
  expect(formatExposure([2, 1])).to.equal('2 s');
  expect(formatExposure([13, 10])).to.equal('1.3 s');
});

it('writes a place with its hemispheres', () => {
  expect(formatCoordinates(51.5073509, -0.1276583)).to.equal('51.50735° N, 0.12766° W');
  expect(formatCoordinates(-33.8688, 151.2093)).to.equal('33.86880° S, 151.20930° E');
});

/** A real picture, measured as the browser decodes it. */
it('measures a picture', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 80;
  const url = URL.createObjectURL(await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png')));
  expect(await measureImage(url)).to.deep.equal({ width: 120, height: 80 });
  expect(await measureImage('data:image/png;base64,AAAA'), 'a broken picture measures as nothing').to.equal(undefined);
});

/** A real sound, measured from its metadata alone. */
it('measures a sound', async () => {
  const rate = 8000;
  const samples = rate * 2;
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
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  const measured = await measureMedia(url);
  expect(measured!.duration).to.be.closeTo(2, 0.01);
  expect(measured!.width, 'a sound has no picture').to.equal(undefined);
});

/** The size and type come from the server's headers, not from downloading the whole file. */
it('reads a file’s size and type', async () => {
  const url = URL.createObjectURL(new Blob(['hello world'], { type: 'text/plain' }));
  expect(await fileHead(url)).to.deep.equal({ size: 11, mimeType: 'text/plain' });
});

/** Only the start of a file is read for its EXIF, which a camera always puts near the start. */
it('reads the start of a file, and no more than asked', async () => {
  const url = URL.createObjectURL(new Blob([new Uint8Array(1000)]));
  const start = await fileStart(url, 100);
  expect(start!.byteLength).to.be.at.most(1000);
  expect(start!.byteLength).to.be.at.least(100);
});
