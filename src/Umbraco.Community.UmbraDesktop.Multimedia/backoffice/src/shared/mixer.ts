/**
 * The desktop's volume mixer: one master, and one channel for each app in this package that makes
 * sound, as Windows' Volume Control had one column for each source.
 *
 * **One mixer for the whole desktop.** Every app imports {@link mixer}, the one instance, so a change
 * in Volume Control is heard at once by every open Media Player, CD Player and recording, and Media
 * Player's own volume slider is its column in the mixer rather than a second volume that could
 * disagree with it. It is a module instance rather than a context because everything that reads it
 * is in this package's bundle, which loads once; the host has no mixer of its own to provide.
 *
 * **Remembered in the browser**, as a computer keeps its volume between sessions: in `localStorage`,
 * which is right for a setting that belongs to this person on this machine and nowhere else. Every
 * read and write is guarded, so a private window or blocked site data leaves a mixer that works for
 * the session and forgets afterwards. Another tab's change arrives through the `storage` event.
 */

/** The mixer's columns: the master, then one per app that makes sound. */
export const CHANNELS = ['master', 'mediaplayer', 'cdplayer', 'soundrecorder', 'camera', 'snippingtool'] as const;

/** One of the mixer's columns. */
export type MixerChannel = (typeof CHANNELS)[number];

/** One column's setting. */
export interface ChannelLevel {
  /** From 0 to 1. */
  volume: number;
  /** Whether it is muted. Kept apart from the volume, so unmuting goes back to where it was. */
  muted: boolean;
}

/** Where the settings are kept in `localStorage`. */
export const MIXER_STORAGE_KEY = 'umbradesktop-multimedia-mixer';

/** A column nobody has touched: full volume, as a new computer's mixer is. */
const UNSET: ChannelLevel = { volume: 1, muted: false };

/**
 * Keep a volume in range.
 * @param volume Any number.
 * @returns It, between 0 and 1.
 */
function clamp(volume: number): number {
  return Math.min(Math.max(volume, 0), 1);
}

/** The mixer. */
export class Mixer {
  /** Each column's setting. */
  #levels = new Map<MixerChannel, ChannelLevel>();

  /** Everyone listening for a change. */
  #listeners = new Set<() => void>();

  /**
   * @param storage Where the settings are remembered. The browser's `localStorage` unless a test
   *   says otherwise; anything that throws is treated as no storage at all.
   */
  constructor(private readonly storage?: Storage) {
    this.#read();
  }

  /**
   * One column's own setting.
   * @param channel The column.
   * @returns Its volume and mute, as set.
   */
  get(channel: MixerChannel): ChannelLevel {
    return { ...(this.#levels.get(channel) ?? UNSET) };
  }

  /**
   * What an app on a channel plays at: its own volume times the master's, and muted if either is.
   * The volume is kept while muted, so the app can show where unmuting will go back to.
   * @param channel The app's column.
   * @returns The level to give its media element.
   */
  effective(channel: MixerChannel): ChannelLevel {
    const master = this.get('master');
    const own = channel === 'master' ? UNSET : this.get(channel);
    return { volume: master.volume * own.volume, muted: master.muted || own.muted };
  }

  /**
   * Change a column, remember it, and tell everyone listening.
   * @param channel The column.
   * @param change Its new volume, its new mute, or both.
   */
  set(channel: MixerChannel, change: Partial<ChannelLevel>): void {
    const level = { ...this.get(channel), ...change };
    this.#levels.set(channel, { volume: clamp(level.volume), muted: level.muted });
    this.#write();
    this.#notify();
  }

  /**
   * Listen for any change.
   * @param listener Called after every change.
   * @returns A function that stops listening, for an app's `disconnectedCallback`.
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Read the settings another tab wrote, and tell everyone listening. For the `storage` event. */
  reload(): void {
    this.#read();
    this.#notify();
  }

  /** Tell everyone listening. */
  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  /** Read what was remembered, keeping only well-formed columns. */
  #read(): void {
    let stored: unknown;
    try {
      stored = JSON.parse(this.storage?.getItem(MIXER_STORAGE_KEY) ?? 'null');
    } catch {
      return;
    }
    if (!stored || typeof stored !== 'object') return;
    for (const channel of CHANNELS) {
      const level = (stored as Record<string, Partial<ChannelLevel> | undefined>)[channel];
      if (typeof level?.volume === 'number' && typeof level.muted === 'boolean') {
        this.#levels.set(channel, { volume: clamp(level.volume), muted: level.muted });
      }
    }
  }

  /** Remember the settings, if the browser lets us. */
  #write(): void {
    try {
      this.storage?.setItem(MIXER_STORAGE_KEY, JSON.stringify(Object.fromEntries(this.#levels)));
    } catch {
      // No storage: the mixer works for this session and forgets afterwards.
    }
  }
}

/**
 * The browser's `localStorage`, or nothing where reading the property itself throws, as it can with
 * site data blocked.
 * @returns The storage, if there is any.
 */
function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The one mixer every app in this package plays through. */
export const mixer = new Mixer(browserStorage());

// Another tab's change to the volume is this tab's too, as there is one volume per computer.
globalThis.addEventListener?.('storage', (event: StorageEvent) => {
  if (event.key === MIXER_STORAGE_KEY) mixer.reload();
});
