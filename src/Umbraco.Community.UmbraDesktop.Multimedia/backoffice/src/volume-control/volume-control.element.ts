import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { CHANNELS, mixer as sharedMixer } from '../shared/mixer.js';
import type { ChannelLevel, Mixer, MixerChannel } from '../shared/mixer.js';
import {
  VOLUME_COLUMN_GAP_PX,
  VOLUME_COLUMN_WIDTH_PX,
  VOLUME_MIN_FADER_PX,
  VOLUME_NAME_HEIGHT_PX,
  VOLUME_PADDING_PX,
  VOLUME_ROW_HEIGHT_PX,
} from './constants.js';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Each column's name in the dictionary, and its English. The apps' own names, so a column reads as the app it turns down. */
const NAMES: Record<MixerChannel, { key: string; fallback: string }> = {
  master: { key: 'volumeMaster', fallback: 'Volume' },
  mediaplayer: { key: 'mediaplayer', fallback: 'Media Player' },
  cdplayer: { key: 'cdplayer', fallback: 'CD Player' },
  soundrecorder: { key: 'soundrecorder', fallback: 'Sound Recorder' },
  camera: { key: 'camera', fallback: 'Camera' },
  snippingtool: { key: 'snippingtool', fallback: 'Snipping Tool' },
};

/**
 * Volume Control, as a self-contained UmbraDesktop app: Windows' mixer, with a column for the master
 * volume and one for each app in this package that makes sound, each with an upright fader and a
 * Mute box.
 *
 * It is a view of the desktop's one mixer (`shared/mixer.ts`) and holds nothing of its own: a
 * column moved here is heard at once in every open window of that app, and a volume changed in Media
 * Player's own slider moves its column here. The settings are remembered in the browser.
 *
 * The faders are range inputs stood upright with `writing-mode`, the way the browser itself now
 * offers a vertical slider, rather than drawn: a real input keeps the arrow keys, Page Up and Down,
 * and what a screen reader says about it.
 */
@customElement('umbradesktop-volume-control')
export class VolumeControlElement extends UmbLitElement {
  /** The mixer it shows. The desktop's one mixer unless a test says otherwise. */
  @property({ attribute: false })
  mixer: Mixer = sharedMixer;

  /** Each column's setting, as the mixer last said. */
  @state()
  private _levels = new Map<MixerChannel, ChannelLevel>();

  /** Stops listening to the mixer. Set while connected. */
  #unsubscribe?: () => void;

  /** Listen for presses, as every app here does, and to the mixer. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    this.#listen();
  }

  /** Stop listening to the mixer. */
  override disconnectedCallback(): void {
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

  /** Start listening to the mixer, and read it now. */
  #listen(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.mixer.subscribe(() => this.#read());
    this.#read();
  }

  /** Read every column. */
  #read(): void {
    this._levels = new Map(CHANNELS.map((channel) => [channel, this.mixer.get(channel)]));
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /**
   * One column: its name, its fader, its level and its Mute box.
   * @param channel Which.
   * @returns The column.
   */
  #renderColumn(channel: MixerChannel) {
    const level = this._levels.get(channel) ?? { volume: 1, muted: false };
    const name = this.#term(NAMES[channel].key, NAMES[channel].fallback);
    return html`<div class="column ${channel === 'master' ? 'master' : ''}" data-channel=${channel}>
      <span class="name">${name}</span>
      <input
        class="fader"
        type="range"
        min="0"
        max="1"
        step="0.05"
        .value=${String(level.volume)}
        aria-label=${name}
        @input=${(event: Event) => this.mixer.set(channel, { volume: Number((event.target as HTMLInputElement).value) })}
      />
      <span class="level muted">${Math.round(level.volume * 100)}%</span>
      <label class="mute">
        <input
          type="checkbox"
          .checked=${level.muted}
          @change=${(event: Event) => this.mixer.set(channel, { muted: (event.target as HTMLInputElement).checked })}
        />
        ${this.#term('volumeMute', 'Mute')}
      </label>
    </div>`;
  }

  /**
   * The whole window body: the columns, side by side.
   * @returns The mixer.
   */
  override render() {
    return html`<div class="mixer">${CHANNELS.map((channel) => this.#renderColumn(channel))}</div>`;
  }

  /**
   * The shared look, plus columns of a fixed width whose faders take whatever height the window
   * gives. The master column is set off by a line after it, as Windows set its first column apart.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        height: 100%;
      }

      .mixer {
        display: flex;
        gap: ${VOLUME_COLUMN_GAP_PX}px;
        flex: 1;
        min-height: 0;
        padding: ${VOLUME_PADDING_PX}px;
      }

      .column {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex: none;
        width: ${VOLUME_COLUMN_WIDTH_PX}px;
        min-height: 0;
      }

      .column.master {
        border-right: 1px solid var(--umbradesktop-app-border, var(--uui-color-border));
      }

      .name {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: ${VOLUME_NAME_HEIGHT_PX}px;
        width: 100%;
        overflow: hidden;
        text-align: center;
        font-size: 0.85em;
        line-height: 1.2;
      }

      /* Upright, louder at the top: vertical writing turns the slider, and right-to-left within it
         puts its maximum at the top rather than the bottom. */
      .fader {
        writing-mode: vertical-lr;
        direction: rtl;
        flex: 1;
        min-height: ${VOLUME_MIN_FADER_PX}px;
        width: 24px;
        margin: 0;
        accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
      }

      .fader:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 2px;
      }

      .level,
      .mute {
        display: flex;
        align-items: center;
        gap: 4px;
        height: ${VOLUME_ROW_HEIGHT_PX}px;
        font-size: 0.85em;
        font-variant-numeric: tabular-nums;
      }

      .mute input {
        margin: 0;
        accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
      }
    `,
  ];
}

export { VolumeControlElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-volume-control': VolumeControlElement;
  }
}
