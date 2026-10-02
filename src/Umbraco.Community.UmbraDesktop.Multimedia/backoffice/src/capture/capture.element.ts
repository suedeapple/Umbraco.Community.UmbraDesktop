import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { createMediaAdder } from '../shared/media-save.js';
import type { MediaAdder } from '../shared/media-save.js';
import { createSaveFolderPicker } from '../shared/save-location.js';
import type { SaveFolderPicker } from '../shared/save-location.js';
import { mixer as sharedMixer } from '../shared/mixer.js';
import type { ChannelLevel, Mixer, MixerChannel } from '../shared/mixer.js';
import { formatTime } from '../media-player/time.js';
import { fileNameFor, recordingName } from '../sound-recorder/format.js';
import {
  CAPTURE_BAR_HEIGHT_PX,
  CAPTURE_MAX_SECONDS,
  CAPTURE_MIN_SCREEN_HEIGHT_PX,
  CAPTURE_PADDING_PX,
  CAPTURE_PHOTO_QUALITY,
} from './constants.js';
import { CaptureError, cameraStream, grabFrame, screenStream, startVideoRecording, stopStream } from './media.js';
import type { CaptureProblem, StreamSource, VideoRecorder } from './media.js';
import { css, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/** A dictionary key and its English. */
type Term = readonly [key: string, fallback: string];

/** What makes a capture app the Camera or the Snipping Tool. */
export interface CaptureConfig {
  /** Where its stream comes from. */
  from: 'camera' | 'screen';
  /** Its column in Volume Control, for playing a recording back. */
  channel: MixerChannel;
  /** The format a still is saved in: a photo as JPEG, a screenshot as PNG, where text must stay sharp. */
  photo: { type: 'image/jpeg' | 'image/png'; extension: string };
  /** The words it uses where the two differ. */
  terms: {
    photo: Term;
    record: Term;
    empty: Term;
    photoName: Term;
    videoName: Term;
    problems: Record<Exclude<CaptureProblem, 'cancelled'>, Term>;
  };
}

/** Where a capture app is: nothing yet, a live preview (Camera only), recording, or holding a capture. */
type CaptureState = 'idle' | 'live' | 'recording' | 'review';

/** What was captured. */
interface Capture {
  /** A still or a video. */
  kind: 'photo' | 'video';
  /** The file. */
  blob: Blob;
  /** The extension it saves with. */
  extension: string;
  /** Its object URL, which the result is shown from. */
  url: string;
}

/**
 * Hand a file to the browser to save in the person's downloads, as Sound Recorder does: a link that
 * is never put in the document, so Umbraco's router never hears of it.
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
 * Camera and Snipping Tool: one app in two configurations, since they differ only in where the
 * picture comes from.
 *
 * **Capture.** Camera shows a live preview once started and takes a photo or records a video from
 * it; Snipping Tool asks the browser for a screen, a window or a tab each time, takes one frame of it
 * for a screenshot or records it. Every capture ends by letting go of the stream (`media.ts`), so the
 * webcam's light or the browser's sharing bar is only up while something is being captured. Closing
 * the window lets go too, and Snipping Tool's recording ends by itself when the person stops sharing
 * from the browser's own bar.
 *
 * **Keep.** A capture is reviewed in the window and kept as Sound Recorder keeps a recording: named
 * for when it was made, then downloaded or added to the media library through Save As. Until it is
 * kept, the window reports unsaved work, so closing it asks, and so does capturing again over it. A
 * video plays back through the app's own column in Volume Control.
 *
 * Subclasses supply {@link config} and register the element; everything else is here.
 */
export abstract class CaptureElement extends UmbLitElement {
  /** What this app is. */
  protected abstract readonly config: CaptureConfig;

  /** Where the stream comes from. The webcam or the screen, by {@link config}, unless a test says otherwise. */
  @property({ attribute: false })
  source?: StreamSource;

  /** The longest a video may be, in seconds. A test makes it short. */
  @property({ attribute: false })
  maxSeconds = CAPTURE_MAX_SECONDS;

  /** How a capture reaches the person's downloads. */
  @property({ attribute: false })
  download: (blob: Blob, name: string) => void = saveToDownloads;

  /** How a capture reaches the media library. The backoffice's media repositories unless a test says otherwise. */
  @property({ attribute: false })
  addToMedia?: MediaAdder;

  /** Asks which folder a capture goes in. Umbraco's folder picker unless a test says otherwise. */
  @property({ attribute: false })
  pickSaveFolder?: SaveFolderPicker;

  /** The mixer playback goes through. The desktop's one mixer unless a test says otherwise. */
  @property({ attribute: false })
  mixer: Mixer = sharedMixer;

  /** Asks whether a capture that was not kept may be thrown away. Umbraco's discard-changes dialog unless a test says otherwise. */
  @property({ attribute: false })
  confirmDiscard: () => Promise<boolean> = async () => {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  };

  /** Where the app is. */
  @state()
  private _state: CaptureState = 'idle';

  /** The stream being previewed or recorded. */
  @state()
  private _stream?: MediaStream;

  /** What was captured, once something was. */
  @state()
  private _capture?: Capture;

  /** The capture's name: its media item's, and its file's. */
  @state()
  private _name = '';

  /** Whether the capture was downloaded or added, and so is safe. */
  @state()
  private _kept = false;

  /** Whether it was added to the media library, which is done once per capture. */
  @state()
  private _added = false;

  /** Whether an add is under way. */
  @state()
  private _adding = false;

  /** How long the recording is so far, in seconds. */
  @state()
  private _elapsed = 0;

  /** Whether a video result is playing. */
  @state()
  private _playing = false;

  /** What playback plays at: the app's mixer column under the master. */
  @state()
  private _level: ChannelLevel = { volume: 1, muted: false };

  /** The last thing worth telling the person. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** The recording in progress. */
  #recorder?: VideoRecorder;

  /** Counts the recording's length. */
  #ticker?: ReturnType<typeof setInterval>;

  /** When the recording started, by `performance.now()`. */
  #started = 0;

  /** Stops listening to the mixer. Set while connected. */
  #unsubscribe?: () => void;

  /** Whether there is a capture, or a recording under way, that has not been kept. */
  get dirty(): boolean {
    return this._state === 'recording' || (this._state === 'review' && !this._kept);
  }

  /** Listen for presses and to the mixer. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    this.#listen();
  }

  /**
   * Let go of everything when the window closes: a recording is thrown away and the stream stopped,
   * which turns the webcam's light off and takes the sharing bar down.
   */
  override disconnectedCallback(): void {
    this.#recorder?.cancel();
    this.#recorder = undefined;
    clearInterval(this.#ticker);
    stopStream(this._stream);
    this._stream = undefined;
    if (this._state !== 'review') this._state = 'idle';
    this.shadowRoot?.querySelector<HTMLVideoElement>('video.result')?.pause();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    super.disconnectedCallback();
  }

  /**
   * Listen to whichever mixer it was given, again if it is given another.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('mixer') && this.isConnected) this.#listen();
  }

  /** Mirror the unsaved state onto the host, and give a video result the mixer's level. */
  override updated(): void {
    this.toggleAttribute(UNSAVED_ATTRIBUTE, this.dirty);
    const video = this.shadowRoot?.querySelector<HTMLVideoElement>('video.result');
    if (video && video.volume !== this._level.volume) video.volume = this._level.volume;
    if (video && video.muted !== this._level.muted) video.muted = this._level.muted;
  }

  /** Start listening to the mixer, and read it now. */
  #listen(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.mixer.subscribe(() => (this._level = this.mixer.effective(this.config.channel)));
    this._level = this.mixer.effective(this.config.channel);
  }

  /** Ask before throwing away a capture that was not kept. @returns True to go ahead. */
  async #mayDiscard(): Promise<boolean> {
    return this._state !== 'review' || this._kept || (await this.confirmDiscard());
  }

  /**
   * Get a stream from the source, saying why if there is none. Closing the screen picker is changing
   * one's mind, and says nothing.
   * @returns The stream, or undefined.
   */
  async #open(): Promise<MediaStream | undefined> {
    this._notice = '';
    try {
      return await (this.source ?? (this.config.from === 'camera' ? cameraStream : screenStream))();
    } catch (error) {
      const problem = error instanceof CaptureError ? error.problem : 'unavailable';
      if (problem !== 'cancelled') {
        const [key, fallback] = this.config.terms.problems[problem];
        this._notice = this.#term(key, fallback);
      }
      return undefined;
    }
  }

  /** Turn the camera on and show its preview. Camera only: the screen is asked for at each capture. */
  async start(): Promise<void> {
    if (this._state === 'live' || this._state === 'recording' || !(await this.#mayDiscard())) return;
    const stream = await this.#open();
    if (!stream) return;
    this.#clearCapture();
    this._stream = stream;
    this._state = 'live';
  }

  /** Turn the camera off. */
  turnOff(): void {
    stopStream(this._stream);
    this._stream = undefined;
    this._state = 'idle';
  }

  /**
   * Take a still: the camera's preview as it is now, or one frame of a screen the browser is asked
   * for. The stream is let go of straight after, so a screenshot has the sharing bar up for a moment.
   */
  async takePhoto(): Promise<void> {
    let stream = this._stream;
    if (this.config.from === 'screen') {
      if (!(await this.#mayDiscard())) return;
      stream = await this.#open();
    }
    if (!stream) return;
    const frame = await grabFrame(stream).catch(() => undefined);
    stopStream(stream);
    this._stream = undefined;
    if (!frame) {
      const [key, fallback] = this.config.terms.problems.unavailable;
      this._notice = this.#term(key, fallback);
      this._state = 'idle';
      return;
    }
    const { type, extension } = this.config.photo;
    const blob = await new Promise<Blob | null>((resolve) => frame.toBlob(resolve, type, CAPTURE_PHOTO_QUALITY));
    if (!blob) return;
    this.#review({ kind: 'photo', blob, extension, url: URL.createObjectURL(blob) }, this.config.terms.photoName);
  }

  /** Start recording video: the camera's preview, or a screen the browser is asked for. */
  async record(): Promise<void> {
    let stream = this._stream;
    if (this.config.from === 'screen') {
      if (!(await this.#mayDiscard())) return;
      stream = await this.#open();
      if (stream) this.#clearCapture();
      this._stream = stream;
    }
    if (!stream) return;
    this.#recorder = startVideoRecording(stream);
    this._state = 'recording';
    this._elapsed = 0;
    this.#started = performance.now();
    this.#ticker = setInterval(() => this.#tick(), 250);
    void this.#recorder.ended.then((recording) => {
      if (this.#recorder === undefined) return;
      this.#recorder = undefined;
      clearInterval(this.#ticker);
      stopStream(this._stream);
      this._stream = undefined;
      this.#review(
        { kind: 'video', blob: recording.blob, extension: recording.extension, url: URL.createObjectURL(recording.blob) },
        this.config.terms.videoName,
      );
    });
  }

  /** Stop recording; the recording finishes and shows for review. */
  stopRecording(): void {
    void this.#recorder?.stop();
  }

  /** Count the recording's length, and stop it at the limit. */
  #tick(): void {
    this._elapsed = (performance.now() - this.#started) / 1000;
    if (this._elapsed >= this.maxSeconds) {
      const limit = formatTime(this.maxSeconds);
      this.stopRecording();
      this._notice = this.#term('captureLimit', `Recording stopped at the ${limit} limit.`, limit);
    }
  }

  /**
   * Show a capture for review, named for when it was made.
   * @param capture What was captured.
   * @param word What a capture of its kind is called.
   */
  #review(capture: Capture, word: Term): void {
    this.#clearCapture();
    this._capture = capture;
    this._name = recordingName(this.#term(word[0], word[1]), new Date());
    this._kept = false;
    this._added = false;
    this._state = 'review';
  }

  /** Throw away the capture held, and its object URL. */
  #clearCapture(): void {
    if (this._capture) URL.revokeObjectURL(this._capture.url);
    this._capture = undefined;
    this._playing = false;
  }

  /** The capture's name: as typed, or the one it was given. */
  #currentName(): string {
    const word = this._capture?.kind === 'video' ? this.config.terms.videoName : this.config.terms.photoName;
    return this._name.trim() || recordingName(this.#term(word[0], word[1]), new Date());
  }

  /** Download the capture under its name. That keeps it. */
  saveDownload(): void {
    if (!this._capture) return;
    this.download(this._capture.blob, fileNameFor(this.#currentName(), this._capture.extension));
    this._kept = true;
  }

  /** Add the capture to the media library, in the folder Save As is told, as Sound Recorder adds a recording. */
  async add(): Promise<void> {
    const capture = this._capture;
    if (!capture || this._added || this._adding) return;
    const choice = await (this.pickSaveFolder ?? createSaveFolderPicker(this))();
    if (choice.status === 'cancelled') return;
    const name = this.#currentName();
    this._adding = true;
    const result = await (this.addToMedia ?? createMediaAdder(this))({
      file: new File([capture.blob], fileNameFor(name, capture.extension), { type: capture.blob.type }),
      name,
      folder: choice.folder,
    }).finally(() => (this._adding = false));
    if (!result.ok) {
      this._notice = this.#term('captureNotAdded', `Not added. ${result.message ?? ''}`, result.message ?? '');
      return;
    }
    this._added = true;
    this._kept = true;
    this._notice = this.#term('captureAdded', 'Added to the media library.');
  }

  /** Play a video result, or pause it. */
  togglePlay(): void {
    const video = this.shadowRoot?.querySelector<HTMLVideoElement>('video.result');
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
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
   * A toolbar button with words, since these are the app's main actions and few.
   * @param action The `data-action`.
   * @param term Its words.
   * @param run What it runs.
   * @param disabled Whether it is unavailable.
   * @returns The button.
   */
  #action(action: string, term: Term, run: () => unknown, disabled = false) {
    return html`<button class="control" data-action=${action} ?disabled=${disabled} @click=${run}>${this.#term(term[0], term[1])}</button>`;
  }

  /**
   * The toolbar: what can be done from where the app is.
   * @returns The buttons.
   */
  #renderActions() {
    const { terms, from } = this.config;
    if (this._state === 'recording') return this.#action('stop', ['captureStop', 'Stop'], () => this.stopRecording());
    if (from === 'screen') {
      return html`${this.#action('photo', terms.photo, () => this.takePhoto())} ${this.#action('record', terms.record, () => this.record())}`;
    }
    if (this._state === 'live') {
      return html`${this.#action('photo', terms.photo, () => this.takePhoto())} ${this.#action('record', terms.record, () => this.record())}
      ${this.#action('off', ['cameraOff', 'Turn off camera'], () => this.turnOff())}`;
    }
    if (this._state === 'review') return this.#action('again', ['cameraAgain', 'Back to camera'], () => this.start());
    return this.#action('start', ['cameraStart', 'Start camera'], () => this.start());
  }

  /**
   * The screen: the preview, the capture, or how to start.
   * @returns Its contents.
   */
  #renderScreen() {
    const capture = this._capture;
    if (this._state === 'review' && capture) {
      return capture.kind === 'photo'
        ? html`<img class="result" src=${capture.url} alt=${this._name} />`
        : html`<video
            class="result"
            src=${capture.url}
            playsinline
            @play=${() => (this._playing = true)}
            @pause=${() => (this._playing = false)}
            @ended=${() => (this._playing = false)}
          ></video>`;
    }
    if (this._stream) {
      return html`<video class="preview ${this.config.from}" .srcObject=${this._stream} autoplay muted playsinline></video>
        ${this._state === 'recording'
          ? html`<span class="live">● ${this.#term('captureRecording', 'Recording')} ${formatTime(this._elapsed)}</span>`
          : nothing}`;
    }
    const [key, fallback] = this.config.terms.empty;
    return html`<div class="empty muted">${this.#term(key, fallback)}</div>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, the screen, the keeping row and the status line.
   */
  override render() {
    const review = this._state === 'review';
    const playLabel = this._playing ? this.#term('playerPause', 'Pause') : this.#term('playerPlay', 'Play');
    return html`
      <div class="capture" data-state=${this._state}>
        <div class="toolbar">${this.#renderActions()}</div>
        <div class="screen sunken">${this.#renderScreen()}</div>
        <div class="keep">
          ${this._capture?.kind === 'video' && review
            ? html`<button class="control icon" data-action="play" title=${playLabel} aria-label=${playLabel} @click=${() => this.togglePlay()}>
                <umb-icon name=${this._playing ? 'icon-pause' : 'icon-play'}></umb-icon>
              </button>`
            : nothing}
          <input
            class="name sunken"
            data-field="name"
            .value=${this._name}
            ?disabled=${!review}
            aria-label=${this.#term('captureName', 'Name')}
            @input=${(event: Event) => (this._name = (event.target as HTMLInputElement).value)}
          />
          <button class="control" data-action="download" ?disabled=${!review} @click=${() => this.saveDownload()}>
            ${this.#term('captureDownload', 'Download')}
          </button>
          <button class="control" data-action="add" ?disabled=${!review || this._added || this._adding} @click=${() => this.add()}>
            ${this.#term('captureAdd', 'Add to Media')}
          </button>
        </div>
        <div class="status muted">${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : nothing}</div>
      </div>
    `;
  }

  /**
   * The shared look, plus a black screen under every theme, as a viewfinder is, that takes whatever
   * the bars leave. The camera's preview is mirrored, as every camera app shows a selfie, so moving
   * left moves left on screen; the photo it takes is not, so text in it reads the right way round.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        height: 100%;
      }

      .capture {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        padding: ${CAPTURE_PADDING_PX}px;
        gap: ${CAPTURE_PADDING_PX}px;
      }

      .toolbar,
      .keep {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
        height: ${CAPTURE_BAR_HEIGHT_PX}px;
        min-width: 0;
      }

      .control {
        height: ${CAPTURE_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control.icon {
        width: ${CAPTURE_BAR_HEIGHT_PX}px;
        padding: 0;
        font-size: 16px;
      }

      .screen {
        position: relative;
        flex: 1;
        min-height: ${CAPTURE_MIN_SCREEN_HEIGHT_PX}px;
        overflow: hidden;
        display: grid;
        place-items: center;
        background: #000;
      }

      .preview,
      .result {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .preview.camera {
        transform: scaleX(-1);
      }

      .live {
        position: absolute;
        top: 6px;
        right: 8px;
        font-size: 0.8em;
        color: #ff4d4d;
        font-variant-numeric: tabular-nums;
      }

      .empty {
        padding: 0 16px;
        text-align: center;
        color: #bbb;
      }

      .name {
        flex: 1;
        min-width: 0;
        height: ${CAPTURE_BAR_HEIGHT_PX - 8}px;
        padding: 0 6px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      .name:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .status {
        flex: none;
        height: ${CAPTURE_BAR_HEIGHT_PX - 8}px;
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
