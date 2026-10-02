import { expect } from '@open-wc/testing';
import { readExif } from './exif.js';

/**
 * Media Info's EXIF reader: what a camera wrote into a JPEG. The JPEGs are built here, byte by byte,
 * so every tag's place, type and byte order is known rather than borrowed from a sample photo.
 */

/** One IFD entry to write: a tag, its TIFF type, and its values. */
interface Entry {
  tag: number;
  /** 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL. */
  type: 2 | 3 | 4 | 5;
  values: string | number[] | Array<[number, number]>;
}

/** Bytes per value of each type. */
const SIZE = { 2: 1, 3: 2, 4: 4, 5: 8 } as const;

/** How many values an entry holds. */
function count(entry: Entry): number {
  return typeof entry.values === 'string' ? entry.values.length + 1 : entry.values.length;
}

/** The bytes one IFD takes: its entries, the next-IFD link, and the values too big to sit inline. */
function ifdSize(entries: Entry[]): number {
  const extra = entries.reduce((sum, entry) => {
    const bytes = SIZE[entry.type] * count(entry);
    return sum + (bytes > 4 ? bytes + (bytes % 2) : 0);
  }, 0);
  return 2 + entries.length * 12 + 4 + extra;
}

/**
 * A JPEG holding only an EXIF segment.
 * @param little Intel byte order (II) rather than Motorola (MM).
 * @param ifd0 The main IFD's entries.
 * @param exif The Exif sub-IFD's entries, if any.
 * @param gps The GPS sub-IFD's entries, if any.
 * @returns The file's bytes.
 */
function jpeg(little: boolean, ifd0: Entry[], exif: Entry[] = [], gps: Entry[] = []): ArrayBuffer {
  const main = [...ifd0];
  if (exif.length) main.push({ tag: 0x8769, type: 4, values: [0] });
  if (gps.length) main.push({ tag: 0x8825, type: 4, values: [0] });
  const offsets = [8];
  offsets.push(offsets[0] + ifdSize(main));
  offsets.push(offsets[1] + (exif.length ? ifdSize(exif) : 0));
  for (const entry of main) {
    if (entry.tag === 0x8769) entry.values = [offsets[1]];
    if (entry.tag === 0x8825) entry.values = [offsets[2]];
  }
  const size = offsets[2] + (gps.length ? ifdSize(gps) : 0);
  const view = new DataView(new ArrayBuffer(size));
  const bytes = new Uint8Array(view.buffer);
  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  const write = (entries: Entry[], at: number) => {
    view.setUint16(at, entries.length, little);
    let data = at + 2 + entries.length * 12 + 4;
    entries.forEach((entry, i) => {
      const slot = at + 2 + i * 12;
      view.setUint16(slot, entry.tag, little);
      view.setUint16(slot + 2, entry.type, little);
      view.setUint32(slot + 4, count(entry), little);
      const bytesNeeded = SIZE[entry.type] * count(entry);
      let target = slot + 8;
      if (bytesNeeded > 4) {
        view.setUint32(slot + 8, data, little);
        target = data;
        data += bytesNeeded + (bytesNeeded % 2);
      }
      if (typeof entry.values === 'string') {
        [...entry.values].forEach((char, j) => view.setUint8(target + j, char.charCodeAt(0)));
      } else {
        (entry.values as Array<number | [number, number]>).forEach((value, j) => {
          if (entry.type === 3) view.setUint16(target + j * 2, value as number, little);
          if (entry.type === 4) view.setUint32(target + j * 4, value as number, little);
          if (entry.type === 5) {
            view.setUint32(target + j * 8, (value as [number, number])[0], little);
            view.setUint32(target + j * 8 + 4, (value as [number, number])[1], little);
          }
        });
      }
    });
  };
  write(main, offsets[0]);
  if (exif.length) write(exif, offsets[1]);
  if (gps.length) write(gps, offsets[2]);
  const header = [0xff, 0xd8, 0xff, 0xe1, ((size + 8) >> 8) & 0xff, (size + 8) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0];
  const file = new Uint8Array(header.length + size + 2);
  file.set(header, 0);
  file.set(bytes, header.length);
  file.set([0xff, 0xd9], header.length + size);
  return file.buffer;
}

/** A photograph's worth of tags: the camera, the shot and where it was taken. */
function photo(little: boolean): ArrayBuffer {
  return jpeg(
    little,
    [
      { tag: 0x010f, type: 2, values: 'Canon' },
      { tag: 0x0110, type: 2, values: 'EOS R6' },
      { tag: 0x0112, type: 3, values: [1] },
    ],
    [
      { tag: 0x9003, type: 2, values: '2026:09:12 14:03:22' },
      { tag: 0x829a, type: 5, values: [[1, 250]] },
      { tag: 0x829d, type: 5, values: [[28, 10]] },
      { tag: 0x8827, type: 3, values: [400] },
      { tag: 0x920a, type: 5, values: [[50, 1]] },
    ],
    [
      { tag: 0x0001, type: 2, values: 'N' },
      { tag: 0x0002, type: 5, values: [[51, 1], [30, 1], [2646, 100]] },
      { tag: 0x0003, type: 2, values: 'W' },
      { tag: 0x0004, type: 5, values: [[0, 1], [7, 1], [3960, 100]] },
    ],
  );
}

for (const [order, little] of [['Intel', true], ['Motorola', false]] as const) {
  it(`reads the camera, the shot and the place, in ${order} byte order`, () => {
    const exif = readExif(photo(little))!;
    expect(exif.make).to.equal('Canon');
    expect(exif.model).to.equal('EOS R6');
    expect(exif.taken).to.equal('2026-09-12 14:03:22');
    expect(exif.exposure).to.deep.equal([1, 250]);
    expect(exif.fNumber).to.equal(2.8);
    expect(exif.iso).to.equal(400);
    expect(exif.focalLength).to.equal(50);
    expect(exif.latitude).to.be.closeTo(51.507350, 1e-5);
    expect(exif.longitude).to.be.closeTo(-0.1276667, 1e-5);
  });
}

it('reads a photo with only some tags, leaving the rest out', () => {
  const exif = readExif(jpeg(true, [{ tag: 0x0110, type: 2, values: 'Pixel 9' }]))!;
  expect(exif).to.deep.equal({ model: 'Pixel 9' });
});

/** Most files have no EXIF at all: a PNG, a JPEG a site has stripped, anything that is not a JPEG. */
it('finds nothing in a file without EXIF', () => {
  expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).to.equal(undefined);
  expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).to.equal(undefined);
});

/** A damaged file, or one cut short by a partial read, must not throw: Media Info shows what it can. */
it('finds nothing, rather than failing, in a damaged or cut-off file', () => {
  const whole = new Uint8Array(photo(true));
  expect(() => readExif(whole.slice(0, 40).buffer)).to.not.throw();
  const broken = whole.slice();
  broken[18] = 0xff;
  broken[19] = 0xff;
  expect(() => readExif(broken.buffer)).to.not.throw();
});
