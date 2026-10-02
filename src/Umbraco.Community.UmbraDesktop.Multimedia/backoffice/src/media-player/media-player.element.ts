import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { kindOf } from '../shared/media-kinds.js';
import type { MediaFile, MediaKind } from '../shared/media-kinds.js';
import { createMediaPicker } from '../shared/media-library.js';
import type { MediaPicker } from '../shared/media-library.js';
import { mixer as sharedMixer } from '../shared/mixer.js';
import type { ChannelLevel, Mixer } from '../shared/mixer.js';
import { PLAYER_BAR_HEIGHT_PX, PLAYER_MIN_SCREEN_HEIGHT_PX, PLAYER_PADDING_PX, PLAYER_SKIP_SECONDS } from './constants.js';
import { formatTime } from './time.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Media Player, as a self-contained UmbraDesktop app: plays the sound and video in the media
 * library, as Windows Media Player played the files on the computer.
 *
 * **One `<video>` element plays both.** A video element plays a sound file exactly as an audio
 * element does, so the app has one media element and one set of handlers rather than two that
 * drift apart. For a sound file the screen shows what is playing over it, since a video element
 * with no picture is a black box.
 *
 * **The browser's own controls are not used.** They would look like the browser rather than the
 * theme, and differ between Chrome, Firefox and Safari, where every other control on the desktop
 * looks the same in all three. The transport here is the shared themed controls, and the element
 * follows the media element's own events (`play`, `pause`, `timeupdate`…) rather than its own idea
 * of what it asked for, so a play the browser refused, or a file that ended, is shown as it is.
 *
 * **Its volume is its column in the mixer** (`shared/mixer.ts`): the slider and Mute here set the
 * Media Player column Volume Control shows, and what plays is that column under the master. One
 * volume, wherever it is changed from.
 *
 * The file streams from its media URL: nothing is downloaded first (`shared/media-library.ts`).
 * There is nothing to save, so the window never reports unsaved work, and closing it stops the
 * sound, since a window that is gone must not go on playing.
 */
@customElement('umbradesktop-media-player')
export class MediaPlayerElement extends UmbLitElement {
  /** How a file is picked from the media library. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  pickMedia?: MediaPicker;

  /** The mixer it plays through. The desktop's one mixer unless a test says otherwise. */
  @property({ attribute: false })
  mixer: Mixer = sharedMixer;

  /** The file that is open, and whether it is sound or video. */
  @state()
  private _file?: MediaFile & { kind: MediaKind };

  /** Whether it is playing, as the media element last said. */
  @state()
  private _playing = false;

  /** Where playback is, in seconds. */
  @state()
  private _current = 0;

  /** How long the file is, in seconds. NaN until the browser has read it. */
  @state()
  private _duration = Number.NaN;

  /** This player's own column in the mixer, which the slider and Mute show and set. */
  @state()
  private _level: ChannelLevel = { volume: 1, muted: false };

  /** What it plays at: its column under the master. */
  @state()
  private _effective: ChannelLevel = { volume: 1, muted: false };

  /** Stops listening to the mixer. Set while connected. */
  #unsubscribe?: () => void;

  /** Why an open, or the file itself, did not work. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** The media element, once rendered. */
  get #media(): HTMLVideoElement | null {
    return this.shadowRoot?.querySelector('video') ?? null;
  }

  /** Whether the open file has been read far enough to know how long it is, and so to play or seek. */
  get #ready(): boolean {
    return !!this._file && Number.isFinite(this._duration);
  }

  /**
   * Take the keyboard, as Calculator does: the app element is focusable, so the desktop hands it the
   * keyboard when its window becomes active, and Space plays straight away.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.addEventListener('keydown', this.#onKeyDown);
    this.#listen();
  }

  /**
   * Listen to whichever mixer it was given, again if it is given another.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('mixer') && this.isConnected) this.#listen();
  }

  /** Give the media element what the mixer says, after every update and every change in the mixer. */
  override updated(): void {
    const media = this.#media;
    if (!media) return;
    if (media.volume !== this._effective.volume) media.volume = this._effective.volume;
    if (media.muted !== this._effective.muted) media.muted = this._effective.muted;
  }

  /** Start listening to the mixer, and read it now. */
  #listen(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.mixer.subscribe(() => this.#readMixer());
    this.#readMixer();
  }

  /** Read this player's column and what it plays at. */
  #readMixer(): void {
    this._level = this.mixer.get('mediaplayer');
    this._effective = this.mixer.effective('mediaplayer');
  }

  /**
   * Stop playing when the window closes. The HTML spec pauses a media element taken out of the
   * document, but only once the removal has run its course; pausing here is immediate, and does not
   * rest on a rule most people have never heard of.
   */
  override disconnectedCallback(): void {
    this.#media?.pause();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /**
   * The keys every player answers to. Ctrl+O (or Cmd+O) opens, and is claimed so the browser does
   * not open a file into the tab. With a file open: Space or K plays and pauses, the arrows skip, M
   * mutes and F goes full screen.
   *
   * A key aimed at a slider or a button is left to it: a slider's arrows move the slider, and a
   * button reached with Tab presses on Space by itself, so acting on it here as well would undo the
   * press.
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
    if (event.altKey || !this.#ready) return;
    const target = event.composedPath()[0];
    if (target instanceof Element && target.closest('input, button')) return;
    const action = {
      ' ': () => this.togglePlay(),
      k: () => this.togglePlay(),
      arrowleft: () => this.skip(-PLAYER_SKIP_SECONDS),
      arrowright: () => this.skip(PLAYER_SKIP_SECONDS),
      m: () => this.toggleMute(),
      f: () => this.fullScreen(),
    }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    action();
  };

  /**
   * Pick a file from the media library and load it, ready to play.
   *
   * The media picker offers every file, since a media item does not say whether a browser can play
   * it; anything that is neither sound nor video is refused here, by name, and whatever was open
   * stays open.
   */
  async open(): Promise<void> {
    const result = await (this.pickMedia ?? createMediaPicker(this))();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be opened.`, result.name ?? '');
      return;
    }
    const kind = result.status === 'folder' ? undefined : kindOf(result.extension);
    if (result.status === 'folder' || (kind !== 'audio' && kind !== 'video')) {
      this._notice = this.#term('playerNotMedia', `Media Player plays sound and video, and ${result.name} is neither.`, result.name);
      return;
    }
    this.#media?.pause();
    this._file = { unique: result.unique, name: result.name, url: result.url, extension: result.extension, kind };
    this._playing = false;
    this._current = 0;
    this._duration = Number.NaN;
    this._notice = '';
  }

  /** Play if paused, pause if playing. A play the browser refuses is left showing Play. */
  togglePlay(): void {
    const media = this.#media;
    if (!media || !this._file) return;
    if (media.paused) media.play().catch(() => undefined);
    else media.pause();
  }

  /** Stop: pause and go back to the start, as a player's square button always has. */
  stop(): void {
    const media = this.#media;
    if (!media) return;
    media.pause();
    media.currentTime = 0;
  }

  /**
   * Skip forwards or back, never past either end.
   * @param seconds How far: negative to go back.
   */
  skip(seconds: number): void {
    const media = this.#media;
    if (!media || !this.#ready) return;
    media.currentTime = Math.min(Math.max(media.currentTime + seconds, 0), this._duration);
  }

  /** Mute this player's column, or unmute it back to the volume it had. */
  toggleMute(): void {
    this.mixer.set('mediaplayer', { muted: !this._level.muted });
  }

  /**
   * Fill the screen with the video, or come back out. Video only: a sound has no picture to fill it
   * with. The screen element rather than the video goes full screen, so the theme's black and the
   * picture's letterboxing come with it.
   */
  fullScreen(): void {
    const screen = this.shadowRoot?.querySelector<HTMLElement>('.screen');
    if (!screen || this._file?.kind !== 'video') return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void screen.requestFullscreen?.().catch(() => undefined);
  }

  /**
   * Follow the media element's own account of itself. Every state shown is read back from it, so a
   * refused play or a file that ended is shown as it is rather than as what was asked for.
   * @param event Any of the media element's events this listens to.
   */
  #onMediaEvent(event: Event): void {
    const media = event.target as HTMLVideoElement;
    this._playing = !media.paused && !media.ended;
    this._current = media.currentTime;
    this._duration = media.duration;
  }

  /** A file the browser cannot decode, such as a `.mov` in a codec it lacks. */
  #onMediaError(): void {
    const name = this._file?.name ?? '';
    this._notice = this.#term('playerCannotPlay', `${name} cannot be played in this browser.`, name);
    this._duration = Number.NaN;
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
   * One of the transport's icon buttons: an icon, with its name as label and tooltip, the way
   * Paint's toolbar names its icons.
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
   * @returns The toolbar, the screen, the seek bar and the transport.
   */
  override render() {
    const file = this._file;
    const ready = this.#ready;
    const playLabel = this._playing ? this.#term('playerPause', 'Pause') : this.#term('playerPlay', 'Play');
    const muteLabel = this.#term('playerMute', 'Mute');
    return html`
      <div class="toolbar">
        <button class="control" data-action="open" title=${this.#term('openTitle', 'Open from the media library (Ctrl+O)')} @click=${() => this.open()}>
          ${this.#term('open', 'Open…')}
        </button>
        ${this._notice ? html`<span class="notice muted" role="status">${this._notice}</span>` : nothing}
      </div>
      <div class="screen sunken" data-kind=${file?.kind ?? 'none'} @dblclick=${() => this.fullScreen()}>
        <video
          preload="metadata"
          playsinline
          src=${file?.url ?? nothing}
          @play=${this.#onMediaEvent}
          @pause=${this.#onMediaEvent}
          @ended=${this.#onMediaEvent}
          @timeupdate=${this.#onMediaEvent}
          @seeked=${this.#onMediaEvent}
          @durationchange=${this.#onMediaEvent}
          @loadedmetadata=${this.#onMediaEvent}
          @error=${this.#onMediaError}
        ></video>
        ${file
          ? file.kind === 'audio'
            ? html`<div class="now-playing"><umb-icon name="icon-music"></umb-icon><span>${file.name}</span></div>`
            : nothing
          : html`<div class="empty muted">${this.#term('playerEmpty', 'Select Open… to play a sound or video from the media library.')}</div>`}
      </div>
      <div class="seekbar">
        <input
          type="range"
          class="slider seek"
          data-action="seek"
          min="0"
          max=${ready ? this._duration : 0}
          step="any"
          .value=${String(this._current)}
          ?disabled=${!ready}
          aria-label=${this.#term('playerSeek', 'Position')}
          @input=${(event: Event) => {
            const media = this.#media;
            if (media) media.currentTime = Number((event.target as HTMLInputElement).value);
          }}
        />
        <span class="time">${formatTime(this._current)} / ${formatTime(this._duration)}</span>
      </div>
      <div class="transport">
        ${this.#button('play', this._playing ? 'icon-pause' : 'icon-play', playLabel, () => this.togglePlay(), { disabled: !ready })}
        ${this.#button('stop', 'icon-stop', this.#term('playerStop', 'Stop'), () => this.stop(), { disabled: !ready })}
        <span class="title muted">${file?.kind === 'video' ? file.name : nothing}</span>
        ${this.#button('mute', this._effective.muted ? 'icon-sound-off' : 'icon-sound', muteLabel, () => this.toggleMute(), {
          pressed: this._level.muted,
        })}
        <input
          type="range"
          class="slider volume"
          data-action="volume"
          min="0"
          max="1"
          step="0.05"
          .value=${String(this._level.volume)}
          aria-label=${this.#term('playerVolume', 'Volume')}
          @input=${(event: Event) => {
            const volume = Number((event.target as HTMLInputElement).value);
            // Turning the volume up is turning the sound back on, as on any mixer.
            this.mixer.set('mediaplayer', volume > 0 ? { volume, muted: false } : { volume });
          }}
        />
        ${this.#button('fullscreen', 'icon-fullscreen', this.#term('playerFullScreen', 'Full screen'), () => this.fullScreen(), {
          disabled: file?.kind !== 'video',
        })}
      </div>
    `;
  }

  /**
   * The shared look, plus a screen that takes whatever the three bars leave it.
   *
   * The screen is black under every theme, as a player's screen is: a picture's letterboxing in the
   * theme's surface colour would read as part of the picture. Its ring stays the theme's.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        padding: ${PLAYER_PADDING_PX}px;
        gap: ${PLAYER_PADDING_PX}px;
        height: 100%;
        outline: none;
      }

      .toolbar,
      .seekbar,
      .transport {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
        height: ${PLAYER_BAR_HEIGHT_PX}px;
        min-width: 0;
      }

      .toolbar {
        flex-wrap: nowrap;
      }

      .control {
        height: ${PLAYER_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control.icon {
        width: ${PLAYER_BAR_HEIGHT_PX}px;
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

      .screen {
        position: relative;
        flex: 1;
        min-height: ${PLAYER_MIN_SCREEN_HEIGHT_PX}px;
        overflow: hidden;
        display: grid;
        place-items: center;
      }

      .screen[data-kind='video'],
      .screen[data-kind='audio'] {
        background: #000;
      }

      video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .screen:not([data-kind='video']) video {
        visibility: hidden;
      }

      .now-playing {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        max-width: 90%;
        color: #fff;
        text-align: center;
      }

      .now-playing umb-icon {
        font-size: 40px;
      }

      .now-playing span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .empty {
        padding: 0 16px;
        text-align: center;
      }

      .slider {
        min-width: 0;
        margin: 0;
        accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
      }

      .seek {
        flex: 1;
      }

      .volume {
        flex: 0 1 80px;
        min-width: 40px;
      }

      .slider:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 2px;
      }

      .time {
        flex: none;
        font-variant-numeric: tabular-nums;
        font-size: 0.85em;
      }

      .title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.85em;
      }
    `,
  ];
}

export { MediaPlayerElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-media-player': MediaPlayerElement;
  }
}
