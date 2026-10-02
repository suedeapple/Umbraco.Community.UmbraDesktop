/**
 * Reading what a camera wrote into a JPEG: its EXIF block.
 *
 * Only the handful of tags Media Info shows, and only from a JPEG's APP1 segment, which is where
 * every camera and phone puts them. A full EXIF library is tens of kilobytes for hundreds of tags
 * nobody here would read. Everything is bounds-checked, so a damaged file, or one cut short because
 * only its start was fetched, gives what could be read rather than an exception.
 */

/** What a camera said about a photo. Every field is absent when the photo does not say it. */
export interface ExifData {
  /** The camera's maker, such as `Canon`. */
  make?: string;
  /** The camera, such as `EOS R6`. */
  model?: string;
  /** The program that last wrote the file. */
  software?: string;
  /** When the photo was taken, as the camera's clock had it: `YYYY-MM-DD HH:MM:SS`, no time zone. */
  taken?: string;
  /** The exposure time, as the fraction the camera wrote, such as `[1, 250]`. */
  exposure?: [number, number];
  /** The aperture, as the f-number. */
  fNumber?: number;
  /** The ISO speed. */
  iso?: number;
  /** The lens's focal length, in mm. */
  focalLength?: number;
  /** Where it was taken: degrees, north positive. */
  latitude?: number;
  /** Where it was taken: degrees, east positive. */
  longitude?: number;
}

/** The tags read, by number. */
const TAG = {
  make: 0x010f,
  model: 0x0110,
  software: 0x0131,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  exposure: 0x829a,
  fNumber: 0x829d,
  iso: 0x8827,
  taken: 0x9003,
  focalLength: 0x920a,
  latitudeRef: 0x0001,
  latitude: 0x0002,
  longitudeRef: 0x0003,
  longitude: 0x0004,
} as const;

/** Bytes per value of each TIFF type: BYTE, ASCII, SHORT, LONG, RATIONAL, and the signed ones. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** A raw tag value: text, whole numbers, or fractions. */
type Value = string | number[] | Array<[number, number]>;

/**
 * Read one IFD's entries into a map by tag.
 * @param view The TIFF block.
 * @param at Where the IFD starts, from the start of the block.
 * @param little Whether the block is in Intel byte order.
 * @returns The entries, or an empty map where the IFD is out of bounds.
 */
function readIfd(view: DataView, at: number, little: boolean): Map<number, Value> {
  const entries = new Map<number, Value>();
  if (at < 8 || at + 2 > view.byteLength) return entries;
  const total = view.getUint16(at, little);
  for (let i = 0; i < total; i++) {
    const slot = at + 2 + i * 12;
    if (slot + 12 > view.byteLength) break;
    const tag = view.getUint16(slot, little);
    const type = view.getUint16(slot + 2, little);
    const count = view.getUint32(slot + 4, little);
    const size = (TYPE_SIZE[type] ?? 0) * count;
    if (!size || size > 4096) continue;
    const start = size > 4 ? view.getUint32(slot + 8, little) : slot + 8;
    if (start + size > view.byteLength) continue;
    if (type === 2) {
      let text = '';
      for (let j = 0; j < count; j++) {
        const code = view.getUint8(start + j);
        if (!code) break;
        text += String.fromCharCode(code);
      }
      entries.set(tag, text.trim());
    } else if (type === 5 || type === 10) {
      const read = type === 5 ? view.getUint32.bind(view) : view.getInt32.bind(view);
      entries.set(
        tag,
        Array.from({ length: count }, (_, j) => [read(start + j * 8, little), read(start + j * 8 + 4, little)] as [number, number]),
      );
    } else if (type === 3) {
      entries.set(tag, Array.from({ length: count }, (_, j) => view.getUint16(start + j * 2, little)));
    } else if (type === 4 || type === 9) {
      const read = type === 4 ? view.getUint32.bind(view) : view.getInt32.bind(view);
      entries.set(tag, Array.from({ length: count }, (_, j) => read(start + j * 4, little)));
    }
  }
  return entries;
}

/**
 * Find the TIFF block inside a JPEG's EXIF segment.
 * @param bytes The file.
 * @returns A view over the TIFF block, or undefined when the file is not a JPEG or has no EXIF.
 */
function tiffBlock(bytes: ArrayBuffer): DataView | undefined {
  const view = new DataView(bytes);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;
  let at = 2;
  while (at + 4 <= view.byteLength) {
    const marker = view.getUint16(at);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda || marker === 0xffd9) return undefined;
    const length = view.getUint16(at + 2);
    // "Exif\0\0", then the TIFF block.
    if (marker === 0xffe1 && at + 10 <= view.byteLength && view.getUint32(at + 4) === 0x45786966 && view.getUint16(at + 8) === 0) {
      const start = at + 10;
      const end = Math.min(at + 2 + length, view.byteLength);
      return end > start ? new DataView(bytes, start, end - start) : undefined;
    }
    at += 2 + length;
  }
  return undefined;
}

/**
 * The value of a fraction, or undefined for a missing one or one over nothing.
 * @param value A raw value.
 * @returns The number.
 */
function fraction(value: Value | undefined): number | undefined {
  const [pair] = Array.isArray(value) ? (value as Array<[number, number]>) : [];
  return Array.isArray(pair) && pair[1] ? pair[0] / pair[1] : undefined;
}

/**
 * Degrees, minutes and seconds as one signed number of degrees.
 * @param value Three fractions.
 * @param ref `N`, `S`, `E` or `W`.
 * @returns The degrees, south and west negative, or undefined.
 */
function degrees(value: Value | undefined, ref: Value | undefined): number | undefined {
  if (!Array.isArray(value) || value.length < 3 || !Array.isArray(value[0])) return undefined;
  const [d, m, s] = (value as Array<[number, number]>).map(([n, over]) => (over ? n / over : 0));
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;
  return sign * (d + m / 60 + s / 3600);
}

/**
 * Read a JPEG's EXIF.
 * @param bytes The file, or as much of its start as was fetched: EXIF is always near the start.
 * @returns What the camera said, or undefined when the file says nothing a person would want.
 */
export function readExif(bytes: ArrayBuffer): ExifData | undefined {
  try {
    const view = tiffBlock(bytes);
    if (!view || view.byteLength < 8) return undefined;
    const order = view.getUint16(0);
    if (order !== 0x4949 && order !== 0x4d4d) return undefined;
    const little = order === 0x4949;
    if (view.getUint16(2, little) !== 42) return undefined;
    const main = readIfd(view, view.getUint32(4, little), little);
    const pointer = (tag: number) => (main.get(tag) as number[] | undefined)?.[0] ?? 0;
    const exif = readIfd(view, pointer(TAG.exifIfd), little);
    const gps = readIfd(view, pointer(TAG.gpsIfd), little);
    const text = (map: Map<number, Value>, tag: number) => (typeof map.get(tag) === 'string' ? (map.get(tag) as string) || undefined : undefined);

    const data: ExifData = {
      make: text(main, TAG.make),
      model: text(main, TAG.model),
      software: text(main, TAG.software),
      taken: text(exif, TAG.taken)?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'),
      exposure: (exif.get(TAG.exposure) as Array<[number, number]> | undefined)?.[0],
      fNumber: fraction(exif.get(TAG.fNumber)),
      iso: (exif.get(TAG.iso) as number[] | undefined)?.[0],
      focalLength: fraction(exif.get(TAG.focalLength)),
      latitude: degrees(gps.get(TAG.latitude), gps.get(TAG.latitudeRef)),
      longitude: degrees(gps.get(TAG.longitude), gps.get(TAG.longitudeRef)),
    };
    const found = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as ExifData;
    return Object.keys(found).length ? found : undefined;
  } catch {
    return undefined;
  }
}
