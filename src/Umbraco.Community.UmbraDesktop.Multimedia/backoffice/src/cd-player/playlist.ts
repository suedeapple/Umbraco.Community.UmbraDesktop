/**
 * CD Player's playlist, as plain values: which track is playing, the order the tracks play in, and
 * the two switches every CD player has had, shuffle and repeat.
 *
 * Pure functions over an immutable value, so the rules can be read and tested in one place and the
 * element only ever swaps one playlist for the next.
 */

/** What happens at the end of a track: stop after the last, go round, or play the same one again. */
export type RepeatMode = 'off' | 'all' | 'one';

/** A disc's playlist. Tracks are indexes into the disc's track list. */
export interface Playlist {
  /** The order the tracks play in: the disc's order, or a shuffle of it. */
  order: number[];
  /** The track playing, or ready to play. */
  current: number;
  /** Whether {@link order} is a shuffle. */
  shuffle: boolean;
  /** What happens at the end of a track. */
  repeat: RepeatMode;
}

/**
 * A playlist in the disc's order, ready at one track, with both switches off.
 * @param count How many tracks the disc has.
 * @param start Which to start at.
 * @returns The playlist.
 */
export function createPlaylist(count: number, start: number): Playlist {
  return { order: Array.from({ length: count }, (_, i) => i), current: start, shuffle: false, repeat: 'off' };
}

/**
 * The track after the current one.
 *
 * At the end of a track, repeat decides: off stops after the last, all goes round, one plays the
 * same track again. A press of Next always moves on, since repeat one is about what happens at the
 * end of a track and not a lock on it; past the last it goes round only with repeat on.
 * @param list The playlist.
 * @param options Whether Next was pressed, rather than the track ending.
 * @returns The playlist on the next track, or undefined at the end of the disc.
 */
export function nextTrack(list: Playlist, options: { pressed?: boolean } = {}): Playlist | undefined {
  if (!list.order.length) return undefined;
  if (list.repeat === 'one' && !options.pressed) return list;
  const at = list.order.indexOf(list.current);
  if (at + 1 < list.order.length) return { ...list, current: list.order[at + 1] };
  return list.repeat === 'off' ? undefined : { ...list, current: list.order[0] };
}

/**
 * The track before the current one: the last again from the first with repeat on, otherwise the
 * first stays the first.
 * @param list The playlist.
 * @returns The playlist on the previous track, or undefined on an empty disc.
 */
export function previousTrack(list: Playlist): Playlist | undefined {
  if (!list.order.length) return undefined;
  const at = list.order.indexOf(list.current);
  if (at > 0) return { ...list, current: list.order[at - 1] };
  return list.repeat === 'off' ? { ...list, current: list.order[0] } : { ...list, current: list.order[list.order.length - 1] };
}

/**
 * Turn shuffle on or off.
 *
 * On, every track plays once in a random order, starting from the one playing now, so turning it on
 * never interrupts what is playing; a Fisher-Yates shuffle of the rest. Off, the disc's order comes
 * back, still on the same track.
 * @param list The playlist.
 * @param on Whether to shuffle.
 * @param random A source of numbers in [0, 1). `Math.random` unless a test says otherwise.
 * @returns The playlist.
 */
export function setShuffle(list: Playlist, on: boolean, random: () => number = Math.random): Playlist {
  if (!on) return { ...list, shuffle: false, order: [...list.order].sort((a, b) => a - b) };
  const rest = list.order.filter((track) => track !== list.current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return { ...list, shuffle: true, order: [list.current, ...rest] };
}
