import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { kindOf } from '../shared/media-kinds.js';
import type { MediaFile } from '../shared/media-kinds.js';
import { createFolderFiles, createMediaPicker } from '../shared/media-library.js';
import type { FolderFiles, MediaPicker } from '../shared/media-library.js';
import { mixer as sharedMixer } from '../shared/mixer.js';
import type { ChannelLevel, Mixer } from '../shared/mixer.js';
import { formatTime } from '../media-player/time.js';
import {
  CD_BAR_HEIGHT_PX,
  CD_DISPLAY_HEIGHT_PX,
  CD_MIN_LIST_HEIGHT_PX,
  CD_PADDING_PX,
  CD_RESTART_SECONDS,
} from './constants.js';
import { createPlaylist, nextTrack, previousTrack, setShuffle } from './playlist.js';
import type { Playlist, RepeatMode } from './playlist.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The repeat modes in the order the Repeat button goes through them, and what each is called. */
const REPEATS: Record<RepeatMode, { next: RepeatMode; key: string; fallback: string }> = {
  off: { next: 'all', key: 'cdRepeatOff', fallback: 'Repeat: off' },
  all: { next: 'one', key: 'cdRepeatAll', fallback: 'Repeat: all' },
  one: { next: 'off', key: 'cdRepeatOne', fallback: 'Repeat: one' },
};

/**
 * CD Player, as a self-contained UmbraDesktop app: plays a media folder of sound files as Windows'
 * CD Player played a disc, track by track.
 *
 * **A folder is the disc.** Open takes a folder, whose sound files are the tracks in the Media
 * section's order, or one sound file, which brings the rest of its folder and starts at that track.
 * Everything in the folder that is not sound is left out, as Picture Viewer leaves out everything
 * that is not a picture (`shared/media-kinds.ts`).
 *
 * **The rules are a CD player's**, kept in `playlist.ts` as pure functions: a track that ends goes on
 * to the next and the disc stops after the last, back at track 1; shuffle plays every track once in a
 * random order from the one playing; repeat goes round the disc or round one track; and Previous a
 * few seconds into a track starts it again.
 *
 * It plays through its own column of the desktop's mixer (`shared/mixer.ts`), so Volume Control turns
 * it down with everything else. One `<audio>` element plays every track, its source swapped as the
 * playlist moves, and closing the window stops it.
 */
@customElement('umbradesktop-cd-player')
export class CdPlayerElement extends UmbLitElement {
  /** How a folder or a track is picked from the media library. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  pickMedia?: MediaPicker;

  /** How a folder's sound files are listed. The media tree unless a test says otherwise. */
  @property({ attribute: false })
  listSounds?: FolderFiles;

  /** The mixer it plays through. The desktop's one mixer unless a test says otherwise. */
  @property({ attribute: false })
  mixer: Mixer = sharedMixer;

  /** Where shuffle's randomness comes from. `Math.random` unless a test says otherwise. */
  @property({ attribute: false })
  random: () => number = Math.random;

  /** The disc's tracks, in the folder's order. */
  @state()
  private _tracks: MediaFile[] = [];

  /** The playlist over them, once a disc is open. */
  @state()
  private _list?: Playlist;

  /** The disc's name: the folder's, when a folder was opened. */
  @state()
  private _disc = '';

  /** Whether a track is playing, as the audio element last said. */
  @state()
  private _playing = false;

  /** Where the track is, in seconds. */
  @state()
  private _position = 0;

  /** Why an open, or a track, did not work. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** What it plays at: its mixer column under the master. */
  @state()
  private _level: ChannelLevel = { volume: 1, muted: false };

  /** Set when the next update should start the track it put in the audio element. */
  #playAfterUpdate = false;

  /** Stops listening to the mixer. Set while connected. */
  #unsubscribe?: () => void;

  /** The audio element. */
  get #audio(): HTMLAudioElement | null {
    return this.shadowRoot?.querySelector('audio') ?? null;
  }

  /** The track the playlist is on. */
  get #track(): MediaFile | undefined {
    return this._list ? this._tracks[this._list.current] : undefined;
  }

  /** Take the keyboard, as Media Player does, and listen to the mixer. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.addEventListener('keydown', this.#onKeyDown);
    this.#listen();
  }

  /** Stop playing when the window closes, and stop listening. */
  override disconnectedCallback(): void {
    this.#audio?.pause();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Listen to whichever mixer it was given, again if it is given another.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('mixer') && this.isConnected) this.#listen();
  }

  /**
   * Give the audio element the mixer's level, and start a track the update has just put in it. The
   * play is here, after the render, because the render is what sets the new source.
   */
  override updated(): void {
    const audio = this.#audio;
    if (!audio) return;
    if (audio.volume !== this._level.volume) audio.volume = this._level.volume;
    if (audio.muted !== this._level.muted) audio.muted = this._level.muted;
    if (this.#playAfterUpdate) {
      this.#playAfterUpdate = false;
      audio.play().catch(() => undefined);
    }
  }

  /** Start listening to the mixer, and read it now. */
  #listen(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.mixer.subscribe(() => (this._level = this.mixer.effective('cdplayer')));
    this._level = this.mixer.effective('cdplayer');
  }

  /**
   * The keys a player answers to. Ctrl+O (or Cmd+O) opens, and is claimed so the browser does not
   * open a file into the tab. With a disc in: Space plays and pauses, and the arrows go back and
   * forward a track. A key aimed at a button is left to it, as in Media Player.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'o' && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        void this.open();
      }
      return;
    }
    if (event.altKey || !this._list) return;
    const target = event.composedPath()[0];
    if (target instanceof Element && target.closest('button, input')) return;
    const action = { ' ': () => this.togglePlay(), arrowleft: () => this.previous(), arrowright: () => this.next() }[
      event.key.toLowerCase()
    ];
    if (!action) return;
    event.preventDefault();
    action();
  };

  /**
   * Pick a folder, or one sound file, and load its folder as the disc. A file that is not sound, or
   * a folder with no sound in it, is said so, and whatever was in stays in.
   */
  async open(): Promise<void> {
    const result = await (this.pickMedia ?? createMediaPicker(this))();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be opened.`, result.name ?? '');
      return;
    }
    if (result.status === 'picked' && kindOf(result.extension) !== 'audio') {
      this._notice = this.#term('cdNotSound', `CD Player plays sound files, and ${result.name} is not one.`, result.name);
      return;
    }
    const folder = result.status === 'folder' ? result.unique : result.folder;
    const tracks = await (this.listSounds ?? createFolderFiles(this, 'audio'))(folder).catch(() => []);
    if (result.status === 'folder' && !tracks.length) {
      this._notice = this.#term('cdNoSound', `${result.name} has no sound files in it.`, result.name);
      return;
    }
    const chosen = result.status === 'picked' ? { unique: result.unique, name: result.name, url: result.url, extension: result.extension } : undefined;
    const start = chosen ? tracks.findIndex((track) => track.unique === chosen.unique) : 0;
    this.#audio?.pause();
    this._tracks = start < 0 && chosen ? [chosen] : tracks;
    this._list = createPlaylist(this._tracks.length, Math.max(start, 0));
    this._disc = result.status === 'folder' ? result.name : '';
    this._playing = false;
    this._position = 0;
    this._notice = '';
  }

  /** Play if paused, pause if playing. A play the browser refuses is left showing Play. */
  togglePlay(): void {
    const audio = this.#audio;
    if (!audio || !this._list) return;
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  }

  /** Stop: pause and go back to the start of the track. */
  stop(): void {
    const audio = this.#audio;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  /** Go to the next track; past the last, round to the first with repeat on, otherwise back to track 1, stopped. */
  next(): void {
    if (!this._list) return;
    const next = nextTrack(this._list, { pressed: true });
    if (next) this.#go(next, this._playing);
    else this.#go({ ...this._list, current: this._list.order[0] }, false);
  }

  /** Start the track again a few seconds in; otherwise go back a track. */
  previous(): void {
    const audio = this.#audio;
    if (!this._list || !audio) return;
    if (audio.currentTime > CD_RESTART_SECONDS) {
      audio.currentTime = 0;
      return;
    }
    const previous = previousTrack(this._list);
    if (previous) this.#go(previous, this._playing);
  }

  /** Turn shuffle on or off, staying on the track playing. */
  toggleShuffle(): void {
    if (this._list) this._list = setShuffle(this._list, !this._list.shuffle, this.random);
  }

  /** Go on to the next repeat mode: off, all, one, and off again. */
  cycleRepeat(): void {
    if (this._list) this._list = { ...this._list, repeat: REPEATS[this._list.repeat].next };
  }

  /**
   * Move the playlist to a track, and play it or leave it ready. The same track again starts it from
   * the beginning, which is what repeat one is.
   * @param list The playlist on the track to go to.
   * @param play Whether to play it.
   */
  #go(list: Playlist, play: boolean): void {
    const same = this._list?.current === list.current;
    this._list = list;
    this._position = 0;
    const audio = this.#audio;
    if (same && audio) {
      audio.currentTime = 0;
      if (play) audio.play().catch(() => undefined);
      return;
    }
    this.#playAfterUpdate = play;
  }

  /** A track ended: on to the next, playing, or at the end of the disc back to its first track, stopped. */
  #onEnded(): void {
    if (!this._list) return;
    const next = nextTrack(this._list);
    if (next) this.#go(next, true);
    else this.#go({ ...this._list, current: this._list.order[0] }, false);
  }

  /**
   * Follow the audio element's own account of itself, as Media Player does.
   * @param event Any of its events this listens to.
   */
  #onAudio(event: Event): void {
    const audio = event.target as HTMLAudioElement;
    this._playing = !audio.paused && !audio.ended;
    this._position = audio.currentTime;
  }

  /** A track the browser cannot decode. */
  #onError(): void {
    const name = this.#track?.name ?? '';
    this._notice = this.#term('playerCannotPlay', `${name} cannot be played in this browser.`, name);
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @param args Values for `%0%`-style placeholders.
   * @returns The localised string.
   */
  #term(key: string, fallback: string, ...args: unknown[]): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback, ...args);
  }

  /**
   * One of the transport's icon buttons, with its name as label and tooltip.
   * @param action The `data-action`, for tests and styling.
   * @param icon The Umbraco icon.
   * @param label What it does.
   * @param run What it runs.
   * @param options Whether it is unavailable, and whether it is a switch that is on.
   * @returns The button.
   */
  #button(action: string, icon: string, label: string, run: () => void, options: { disabled?: boolean; pressed?: boolean } = {}) {
    return html`<button
      class="control icon"
      data-action=${action}
      title=${label}
      aria-label=${label}
      aria-pressed=${options.pressed === undefined ? nothing : options.pressed ? 'true' : 'false'}
      ?disabled=${options.disabled ?? false}
      @click=${run}
    >
      <umb-icon name=${icon}></umb-icon>
    </button>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, the display, the transport and the track list.
   */
  override render() {
    const list = this._list;
    const track = this.#track;
    const repeat = REPEATS[list?.repeat ?? 'off'];
    const playLabel = this._playing ? this.#term('playerPause', 'Pause') : this.#term('playerPlay', 'Play');
    return html`
      <div class="toolbar">
        <button class="control" data-action="open" title=${this.#term('openTitle', 'Open from the media library (Ctrl+O)')} @click=${() => this.open()}>
          ${this.#term('open', 'Open…')}
        </button>
        ${this._notice ? html`<span class="notice muted" role="status">${this._notice}</span>` : nothing}
      </div>
      <div class="display sunken">
        <span class="track-number">${list ? String(list.current + 1).padStart(2, '0') : '--'}</span>
        <span class="details">
          <span class="disc">${this._disc}</span>
          <span class="track-name">${track?.name ?? ''}</span>
        </span>
        <span class="time">${formatTime(this._position)}</span>
      </div>
      <div class="transport">
        ${this.#button('play', this._playing ? 'icon-pause' : 'icon-play', playLabel, () => this.togglePlay(), { disabled: !list })}
        ${this.#button('stop', 'icon-stop', this.#term('playerStop', 'Stop'), () => this.stop(), { disabled: !list })}
        ${this.#button('previous', 'icon-previous-media', this.#term('cdPrevious', 'Previous track'), () => this.previous(), { disabled: !list })}
        ${this.#button('next', 'icon-next-media', this.#term('cdNext', 'Next track'), () => this.next(), { disabled: !list })}
        <span class="spacer"></span>
        ${this.#button('shuffle', 'icon-axis-rotation', this.#term('cdShuffle', 'Shuffle'), () => this.toggleShuffle(), {
          disabled: !list,
          pressed: !!list?.shuffle,
        })}
        <button
          class="control icon repeat"
          data-action="repeat"
          title=${this.#term(repeat.key, repeat.fallback)}
          aria-label=${this.#term(repeat.key, repeat.fallback)}
          aria-pressed=${list && list.repeat !== 'off' ? 'true' : 'false'}
          ?disabled=${!list}
          @click=${() => this.cycleRepeat()}
        >
          <umb-icon name=${list?.repeat === 'one' ? 'icon-repeat-one' : 'icon-repeat'}></umb-icon>
        </button>
      </div>
      <div class="tracks sunken" role="list" aria-label=${this.#term('cdTracks', 'Tracks')}>
        ${this._tracks.length
          ? this._tracks.map(
              (item, index) => html`<button
                class="track"
                role="listitem"
                aria-current=${list?.current === index ? 'true' : 'false'}
                @click=${() => list && this.#go({ ...list, current: index }, true)}
              >
                <span class="number">${index + 1}</span>
                <span class="name">${item.name}</span>
              </button>`,
            )
          : html`<div class="empty muted">${this.#term('cdEmpty', 'Select Open… to play a media folder of sound files, or one track and the rest of its folder.')}</div>`}
      </div>
      <audio
        preload="auto"
        src=${track?.url ?? nothing}
        @play=${this.#onAudio}
        @pause=${this.#onAudio}
        @timeupdate=${this.#onAudio}
        @seeked=${this.#onAudio}
        @ended=${this.#onEnded}
        @error=${this.#onError}
      ></audio>
    `;
  }

  /**
   * The shared look, plus a display in a CD player's colours under every theme (green figures on
   * black, as a hi-fi's were) and a track list that takes whatever height is left.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        padding: ${CD_PADDING_PX}px;
        gap: ${CD_PADDING_PX}px;
        height: 100%;
        outline: none;
      }

      .toolbar,
      .transport {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: none;
        height: ${CD_BAR_HEIGHT_PX}px;
        min-width: 0;
      }

      .toolbar {
        flex-wrap: nowrap;
      }

      .control {
        height: ${CD_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control.icon {
        width: ${CD_BAR_HEIGHT_PX}px;
        padding: 0;
        font-size: 16px;
      }

      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.85em;
      }

      .spacer {
        flex: 1;
      }

      .display {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: none;
        height: ${CD_DISPLAY_HEIGHT_PX}px;
        padding: 0 12px;
        background: #000;
        color: #3ddc84;
        font-variant-numeric: tabular-nums;
      }

      .track-number {
        font-size: 30px;
        font-family: ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace;
      }

      .details {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }

      .disc {
        font-size: 0.8em;
        opacity: 0.75;
      }

      .disc,
      .track-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .time {
        font-size: 18px;
        font-family: ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace;
      }

      .tracks {
        flex: 1;
        min-height: ${CD_MIN_LIST_HEIGHT_PX}px;
        overflow-y: auto;
        padding: 2px;
      }

      .track {
        display: flex;
        gap: 10px;
        width: 100%;
        padding: 3px 8px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .track:hover {
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      }

      .track[aria-current='true'] {
        background: var(--umbradesktop-app-accent, var(--uui-color-selected));
        color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
      }

      .track:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: -2px;
      }

      .track .number {
        min-width: 2ch;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .track .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .empty {
        padding: 12px 16px;
        text-align: center;
      }
    `,
  ];
}

export { CdPlayerElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-cd-player': CdPlayerElement;
  }
}
