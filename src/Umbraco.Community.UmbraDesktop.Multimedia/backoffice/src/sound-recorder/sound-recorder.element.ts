import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { createMediaAdder } from '../shared/media-save.js';
import type { MediaAdder } from '../shared/media-save.js';
import { createSaveFolderPicker } from '../shared/save-location.js';
import type { SaveFolderPicker } from '../shared/save-location.js';
import { formatTime } from '../media-player/time.js';
import { mixer as sharedMixer } from '../shared/mixer.js';
import type { ChannelLevel, Mixer } from '../shared/mixer.js';
import { RECORDER_BAR_HEIGHT_PX, RECORDER_MAX_SECONDS, RECORDER_MIN_WAVE_HEIGHT_PX, RECORDER_PADDING_PX } from './constants.js';
import { fileNameFor, recordingName } from './format.js';
import { MicrophoneError, openMicrophone } from './microphone.js';
import type { Microphone, MicrophoneProblem, MicrophoneSession, Recording } from './microphone.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/** Where the recorder is: nothing yet, recording, or holding a finished recording. */
type RecorderState = 'idle' | 'recording' | 'recorded';

/** What each microphone problem is called in the dictionary, and its English. */
const PROBLEMS: Record<MicrophoneProblem, { key: string; fallback: string }> = {
  denied: {
    key: 'recorderDenied',
    fallback: 'The microphone was not allowed. Allow it for this site in the browser, then select Record again.',
  },
  missing: { key: 'recorderMissing', fallback: 'No microphone was found.' },
  insecure: { key: 'recorderInsecure', fallback: 'The browser only allows recording when the backoffice is on HTTPS.' },
  unavailable: { key: 'recorderUnavailable', fallback: 'The microphone could not be started. It may be in use by another program.' },
};

/**
 * Hand a file to the browser to save in the person's downloads, as a link with `download` does.
 *
 * The link is never put in the document, so Umbraco's router, which takes every link click at the
 * window and would navigate the backoffice away from the desktop, never hears of it. The object URL
 * is revoked a moment later rather than at once: revoked synchronously, Firefox can lose the
 * download it has only just started.
 * @param blob The file.
 * @param name Its file name.
 */
function saveToDownloads(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sound Recorder, as a self-contained UmbraDesktop app: records a clip from the microphone, plays
 * it back, and keeps it, by downloading it or adding it to the media library, as Windows' Sound
 * Recorder recorded a clip and saved it.
 *
 * **The browser asks for the microphone, not this app.** The first Record shows the browser's own
 * permission prompt, which it remembers for the site. Nothing is recorded or sent anywhere until
 * Record is selected, and the microphone is let go of the moment recording stops, so the browser's
 * recording indicator goes out with it (`microphone.ts`).
 *
 * **A recording is work until it is kept.** From Record until it is downloaded or added to the media
 * library, the window reports unsaved work with {@link UNSAVED_ATTRIBUTE}, so its close button asks
 * first, and recording again asks too. Adding goes through Save As, the folder picker Notepad and
 * Paint use for a new file, and then creates the item the way dragging a file into the Media section
 * does; a recording is only ever added, never saved back over an item, so a kept recording is not
 * added a second time.
 *
 * Playback goes through the Sound Recorder column of the desktop's mixer (`shared/mixer.ts`), so
 * Volume Control turns it down or mutes it with everything else.
 *
 * The trace is drawn live from an analyser on the microphone while recording: the green line on
 * black Windows' Sound Recorder drew.
 */
@customElement('umbradesktop-sound-recorder')
export class SoundRecorderElement extends UmbLitElement {
  /** The microphone. The browser's unless a test says otherwise. */
  @property({ attribute: false })
  microphone: Microphone = openMicrophone;

  /** The longest a recording may be, in seconds. A test makes it short. */
  @property({ attribute: false })
  maxSeconds = RECORDER_MAX_SECONDS;

  /** How a recording reaches the person's downloads. A link with `download` unless a test says otherwise. */
  @property({ attribute: false })
  download: (blob: Blob, name: string) => void = saveToDownloads;

  /** How a recording reaches the media library. The backoffice's media repositories unless a test says otherwise. */
  @property({ attribute: false })
  addToMedia?: MediaAdder;

  /** Asks which folder a recording goes in. Umbraco's folder picker unless a test says otherwise. */
  @property({ attribute: false })
  pickSaveFolder?: SaveFolderPicker;

  /** The mixer playback goes through. The desktop's one mixer unless a test says otherwise. */
  @property({ attribute: false })
  mixer: Mixer = sharedMixer;

  /** What playback plays at: the Sound Recorder column under the master. */
  @state()
  private _level: ChannelLevel = { volume: 1, muted: false };

  /** Stops listening to the mixer. Set while connected. */
  #unsubscribe?: () => void;

  /**
   * Ask whether a recording that was not kept may be thrown away. Umbraco's own discard-changes
   * dialog unless a test says otherwise, as Notepad asks.
   */
  @property({ attribute: false })
  confirmDiscard: () => Promise<boolean> = async () => {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  };

  /** Where the recorder is. */
  @state()
  private _state: RecorderState = 'idle';

  /** How long the recording is, or has been so far, in seconds. */
  @state()
  private _length = 0;

  /** Where playback is, in seconds. */
  @state()
  private _position = 0;

  /** Whether the recording is playing back. */
  @state()
  private _playing = false;

  /** What the recording is called: its media item's name, and its file's. */
  @state()
  private _name = '';

  /** Whether the recording was downloaded or added to the media library, and so is safe. */
  @state()
  private _kept = false;

  /** Whether it was added to the media library, which is done once per recording. */
  @state()
  private _added = false;

  /** Whether an add is under way, so a second press does not start a second one. */
  @state()
  private _adding = false;

  /** The last thing worth telling the person. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** The recording in progress. */
  #session?: MicrophoneSession;

  /** The finished recording. */
  #recording?: Recording;

  /** The finished recording's object URL, which the playback element plays. */
  @state()
  private _url?: string;

  /** When recording started, by `performance.now()`. */
  #started = 0;

  /** Counts the recording's length while it records. */
  #ticker?: ReturnType<typeof setInterval>;

  /** The trace's animation frame, while recording. */
  #frame = 0;

  /** The analyser's output for one frame of the trace. */
  #wave = new Uint8Array(1024);

  /** Whether there is a recording, or one being made, that has not been kept. */
  get dirty(): boolean {
    return this._state === 'recording' || (this._state === 'recorded' && !this._kept);
  }

  /** Listen for presses, as every app here does. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    this.#listen();
  }

  /**
   * Listen to whichever mixer it was given, again if it is given another.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('mixer') && this.isConnected) this.#listen();
  }

  /** Start listening to the mixer, and read it now. */
  #listen(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.mixer.subscribe(() => (this._level = this.mixer.effective('soundrecorder')));
    this._level = this.mixer.effective('soundrecorder');
  }

  /**
   * Let go of everything when the window closes: a recording in progress is cancelled, which lets go
   * of the microphone, or the browser's recording indicator would stay on with no window to stop it.
   */
  override disconnectedCallback(): void {
    if (this._state === 'recording') {
      this.#session?.cancel();
      this.#session = undefined;
      this._state = this.#recording ? 'recorded' : 'idle';
    }
    this.#stopTimers();
    this.shadowRoot?.querySelector('audio')?.pause();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    super.disconnectedCallback();
  }

  /**
   * Mirror the unsaved state onto the host as the desktop's unsaved-work attribute, give playback
   * the mixer's level, and draw the trace flat whenever nothing is recording.
   */
  override updated(): void {
    this.toggleAttribute(UNSAVED_ATTRIBUTE, this.dirty);
    const audio = this.shadowRoot?.querySelector('audio');
    if (audio && audio.volume !== this._level.volume) audio.volume = this._level.volume;
    if (audio && audio.muted !== this._level.muted) audio.muted = this._level.muted;
    if (this._state !== 'recording') this.#draw(undefined);
  }

  /**
   * Start recording. A recording that was not kept is asked about first, since recording again
   * replaces it.
   */
  async record(): Promise<void> {
    if (this._state === 'recording') return;
    if (this._state === 'recorded' && !this._kept && !(await this.confirmDiscard())) return;
    this._notice = '';
    let session: MicrophoneSession;
    try {
      session = await this.microphone();
    } catch (error) {
      const { key, fallback } = PROBLEMS[error instanceof MicrophoneError ? error.problem : 'unavailable'];
      this._notice = this.#term(key, fallback);
      return;
    }
    this.#discardRecording();
    this.#session = session;
    this._state = 'recording';
    this._length = 0;
    this._name = '';
    this.#started = performance.now();
    this.#ticker = setInterval(() => this.#tick(), 200);
    this.#frame = requestAnimationFrame(() => this.#animate());
  }

  /** Stop: finish a recording in progress, or stop playing one back and go to its start. */
  async stop(): Promise<void> {
    if (this._state === 'recording') {
      await this.#finish();
      return;
    }
    const audio = this.shadowRoot?.querySelector('audio');
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  /** Play the recording back, or pause it. A play the browser refuses is left showing Play. */
  togglePlay(): void {
    const audio = this.shadowRoot?.querySelector('audio');
    if (!audio || this._state !== 'recorded') return;
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  }

  /** Download the recording under its name. That keeps it. */
  saveDownload(): void {
    if (!this.#recording) return;
    this.download(this.#recording.blob, fileNameFor(this.#currentName(), this.#recording.extension));
    this._kept = true;
  }

  /**
   * Add the recording to the media library, in the folder Save As is told. Cancelling Save As adds
   * nothing; a folder that refuses sound says so in Umbraco's own words, and the recording is kept
   * in the window to try somewhere else.
   */
  async add(): Promise<void> {
    if (!this.#recording || this._added || this._adding) return;
    const choice = await (this.pickSaveFolder ?? createSaveFolderPicker(this))();
    if (choice.status === 'cancelled') return;
    const name = this.#currentName();
    const recording = this.#recording;
    this._adding = true;
    const result = await (this.addToMedia ?? createMediaAdder(this))({
      file: new File([recording.blob], fileNameFor(name, recording.extension), { type: recording.blob.type }),
      name,
      folder: choice.folder,
    }).finally(() => (this._adding = false));
    if (!result.ok) {
      this._notice = this.#term('recorderNotAdded', `Not added. ${result.message ?? ''}`, result.message ?? '');
      return;
    }
    this._added = true;
    this._kept = true;
    this._notice = this.#term('recorderAdded', 'Added to the media library.');
  }

  /** The recording's name: as typed, or the one it was given when it was made. */
  #currentName(): string {
    return this._name.trim() || recordingName(this.#term('recorderRecording', 'Recording'), new Date());
  }

  /** Count the recording's length, and stop it at the limit. */
  #tick(): void {
    this._length = (performance.now() - this.#started) / 1000;
    if (this._length >= this.maxSeconds) {
      const limit = formatTime(this.maxSeconds);
      void this.#finish().then(() => {
        this._notice = this.#term('recorderLimit', `Recording stopped at the ${limit} limit.`, limit);
      });
    }
  }

  /** Stop the recorder, and hold what it recorded, named for when it was made. */
  async #finish(): Promise<void> {
    const session = this.#session;
    if (!session) return;
    this.#session = undefined;
    this.#stopTimers();
    this._length = Math.min((performance.now() - this.#started) / 1000, this.maxSeconds);
    const recording = await session.stop();
    this.#recording = recording;
    this._url = URL.createObjectURL(recording.blob);
    this._name = recordingName(this.#term('recorderRecording', 'Recording'), new Date());
    this._position = 0;
    this._kept = false;
    this._added = false;
    this._state = 'recorded';
  }

  /** Throw away the finished recording and its object URL. */
  #discardRecording(): void {
    if (this._url) URL.revokeObjectURL(this._url);
    this._url = undefined;
    this.#recording = undefined;
    this._playing = false;
    this._position = 0;
  }

  /** Stop counting and drawing. */
  #stopTimers(): void {
    clearInterval(this.#ticker);
    this.#ticker = undefined;
    cancelAnimationFrame(this.#frame);
  }

  /** Draw one frame of the live trace, and ask for the next while recording. */
  #animate(): void {
    if (!this.#session) return;
    this.#session.wave(this.#wave);
    this.#draw(this.#wave);
    this.#frame = requestAnimationFrame(() => this.#animate());
  }

  /**
   * Draw the trace: the waveform across the display, or a flat line through the middle when there is
   * none, as a sound recorder showed silence. In the canvas's own CSS colour, sized to the display in
   * device pixels so it is sharp on a high-density screen.
   * @param wave One frame of the analyser's output, or undefined for silence.
   */
  #draw(wave: Uint8Array | undefined): void {
    const canvas = this.shadowRoot?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    context.clearRect(0, 0, w, h);
    context.strokeStyle = getComputedStyle(canvas).color;
    context.lineWidth = Math.max(1, ratio * 1.5);
    context.beginPath();
    if (!wave) {
      context.moveTo(0, h / 2);
      context.lineTo(w, h / 2);
    } else {
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w;
        const y = (wave[i] / 255) * h;
        if (i) context.lineTo(x, y);
        else context.moveTo(x, y);
      }
    }
    context.stroke();
  }

  /**
   * Follow the playback element's own account of itself, as Media Player does.
   * @param event Any of its events this listens to.
   */
  #onAudio(event: Event): void {
    const audio = event.target as HTMLAudioElement;
    this._playing = !audio.paused && !audio.ended;
    this._position = audio.currentTime;
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
   * @param disabled Whether it is unavailable.
   * @returns The button.
   */
  #button(action: string, icon: string, label: string, run: () => unknown, disabled: boolean) {
    return html`<button class="control icon" data-action=${action} title=${label} aria-label=${label} ?disabled=${disabled} @click=${run}>
      <umb-icon name=${icon}></umb-icon>
    </button>`;
  }

  /**
   * The whole window body.
   * @returns The trace, the counter and name, the transport and the status line.
   */
  override render() {
    const recording = this._state === 'recording';
    const recorded = this._state === 'recorded';
    const recordLabel = this.#term('recorderRecord', 'Record');
    const playLabel = this._playing ? this.#term('playerPause', 'Pause') : this.#term('playerPlay', 'Play');
    return html`
      <div class="recorder" data-state=${this._state}>
        <div class="wave sunken">
          <canvas aria-hidden="true"></canvas>
          ${recording ? html`<span class="live">${this.#term('recorderLive', 'Recording')}</span>` : nothing}
        </div>
        <div class="counter">
          <span class="time">${recorded ? `${formatTime(this._position)} / ${formatTime(this._length)}` : formatTime(this._length)}</span>
          ${recorded
            ? html`<input
                class="name sunken"
                data-field="name"
                .value=${this._name}
                aria-label=${this.#term('recorderName', 'Name')}
                @input=${(event: Event) => (this._name = (event.target as HTMLInputElement).value)}
              />`
            : nothing}
        </div>
        <div class="transport">
          <button
            class="control icon record"
            data-action="record"
            title=${recordLabel}
            aria-label=${recordLabel}
            ?disabled=${recording}
            @click=${() => this.record()}
          >
            <span class="dot"></span>
          </button>
          ${this.#button('stop', 'icon-stop', this.#term('playerStop', 'Stop'), () => this.stop(), !recording && !recorded)}
          ${this.#button('play', this._playing ? 'icon-pause' : 'icon-play', playLabel, () => this.togglePlay(), !recorded)}
          <span class="spacer"></span>
          <button class="control" data-action="download" ?disabled=${!recorded} @click=${() => this.saveDownload()}>
            ${this.#term('recorderDownload', 'Download')}
          </button>
          <button class="control" data-action="add" ?disabled=${!recorded || this._added || this._adding} @click=${() => this.add()}>
            ${this.#term('recorderAdd', 'Add to Media')}
          </button>
        </div>
        <div class="status muted">
          ${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : nothing}
        </div>
        <audio
          src=${this._url ?? nothing}
          preload="auto"
          @play=${this.#onAudio}
          @pause=${this.#onAudio}
          @ended=${this.#onAudio}
          @timeupdate=${this.#onAudio}
          @seeked=${this.#onAudio}
        ></audio>
      </div>
    `;
  }

  /**
   * The shared look, plus a wave display that takes whatever the bars leave it.
   *
   * The display is black with a green trace under every theme, as a sound recorder's always was. Not
   * the theme's accent: the accent was tried first, and the Umbraco theme's navy all but vanished on
   * black, as Windows 98's would. The canvas reads its stroke from its own `color`, so the colour
   * lives here in CSS, where a theme-specific rule could still change it, and not in the drawing code.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        height: 100%;
      }

      .recorder {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        padding: ${RECORDER_PADDING_PX}px;
        gap: ${RECORDER_PADDING_PX}px;
      }

      .wave {
        position: relative;
        flex: 1;
        min-height: ${RECORDER_MIN_WAVE_HEIGHT_PX}px;
        background: #000;
        overflow: hidden;
      }

      canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        color: #3ddc84;
      }

      .live {
        position: absolute;
        top: 6px;
        right: 8px;
        font-size: 0.8em;
        color: #ff4d4d;
      }

      .counter,
      .transport {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
        height: ${RECORDER_BAR_HEIGHT_PX}px;
        min-width: 0;
      }

      .time {
        flex: none;
        font-size: 1.2em;
        font-variant-numeric: tabular-nums;
      }

      .name {
        flex: 1;
        min-width: 0;
        height: ${RECORDER_BAR_HEIGHT_PX - 8}px;
        padding: 0 6px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      .name:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .control {
        height: ${RECORDER_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control.icon {
        width: ${RECORDER_BAR_HEIGHT_PX}px;
        padding: 0;
        font-size: 16px;
      }

      /* Record is the one red button on every recorder ever made, under every theme. */
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #d42a2a;
      }

      .spacer {
        flex: 1;
      }

      .status {
        flex: none;
        height: ${RECORDER_BAR_HEIGHT_PX - 8}px;
        display: flex;
        align-items: center;
        padding: 0 2px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      .notice {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];
}

export { SoundRecorderElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-sound-recorder': SoundRecorderElement;
  }
}
