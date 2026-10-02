import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { createMediaPicker } from '../shared/media-library.js';
import type { MediaPicker } from '../shared/media-library.js';
import { formatTime } from '../media-player/time.js';
import { INFO_BAR_HEIGHT_PX, INFO_PADDING_PX } from './constants.js';
import { formatBytes, formatCoordinates, formatExposure } from './facts.js';
import { createMediaInspector } from './inspect.js';
import type { MediaFacts, MediaInspector } from './inspect.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** One fact: what it is called, and what it is. */
interface Fact {
  /** The label. */
  label: string;
  /** The value, as shown. */
  value: string;
}

/** A group of facts under a heading, as Windows' Properties grouped them. */
interface FactGroup {
  /** The group's id, for tests and styling. */
  id: 'file' | 'picture' | 'media' | 'camera' | 'place';
  /** Its heading. */
  heading: string;
  /** Its facts. Only those the file has: an empty group is not shown. */
  facts: Fact[];
}

/**
 * Media Info, as a self-contained UmbraDesktop app: everything about one media file, as Windows'
 * Properties dialog told you about a file on the computer.
 *
 * The file, its media type, size, format and dates; a picture's dimensions and focal point; a sound's
 * or a video's length; and for a photo, what the camera wrote: the camera, when it was taken, the
 * exposure and where. Only what the file has is shown, so a PDF is one short group and a phone photo
 * five. Finding it all out is `inspect.ts`, which reads no more of the file than it must.
 *
 * Copy puts every fact on the clipboard as plain lines, ready for a support request or a ticket, as
 * System Information in the Accessories package does.
 */
@customElement('umbradesktop-media-info')
export class MediaInfoElement extends UmbLitElement {
  /** How a file is picked from the media library. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  pickMedia?: MediaPicker;

  /** How a file is looked into. The backoffice's repositories and the file itself unless a test says otherwise. */
  @property({ attribute: false })
  inspect?: MediaInspector;

  /** How text reaches the clipboard. The browser's clipboard unless a test says otherwise. */
  @property({ attribute: false })
  copy: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text);

  /** What was found about the open file. */
  @state()
  private _facts?: MediaFacts;

  /** Whether a file is being looked into. */
  @state()
  private _busy = false;

  /** The last thing worth telling the person. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** Listen for presses, as every app here does. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
  }

  /** Pick a file, and find out everything about it. A folder is said to be one. */
  async open(): Promise<void> {
    const result = await (this.pickMedia ?? createMediaPicker(this))();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be opened.`, result.name ?? '');
      return;
    }
    if (result.status === 'folder') {
      this._notice = this.#term('infoFolder', `${result.name} is a folder. Media Info describes one file at a time.`, result.name);
      return;
    }
    this._busy = true;
    this._notice = '';
    try {
      this._facts = await (this.inspect ?? createMediaInspector(this))({
        unique: result.unique,
        name: result.name,
        url: result.url,
        extension: result.extension,
      });
    } finally {
      this._busy = false;
    }
  }

  /** Copy every fact shown, one `Label: value` per line. */
  async copyAll(): Promise<void> {
    const lines = this.#groups().flatMap((group) => group.facts.map((fact) => `${fact.label}: ${fact.value}`));
    if (!lines.length) return;
    await this.copy(lines.join('\n'));
    this._notice = this.#term('infoCopied', 'Copied.');
  }

  /**
   * The facts to show, grouped, leaving out every fact the file does not have and every group left
   * empty.
   * @returns The groups.
   */
  #groups(): FactGroup[] {
    const facts = this._facts;
    if (!facts) return [];
    const t = (key: string, fallback: string, ...args: unknown[]) => this.#term(key, fallback, ...args);
    const fact = (label: string, value: string | undefined): Fact[] => (value ? [{ label, value }] : []);
    const pixels = (w?: number, h?: number) => (w && h ? t('infoPixels', `${w} × ${h} pixels`, w, h) : undefined);
    const date = (value?: string) => (value ? this.localize.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : undefined);
    const exif = facts.exif;
    const focal = facts.focalPoint;
    const groups: FactGroup[] = [
      {
        id: 'file',
        heading: t('infoGroupFile', 'File'),
        facts: [
          ...fact(t('infoName', 'Name'), facts.name),
          ...fact(t('infoFileName', 'File name'), facts.fileName),
          ...fact(t('infoMediaType', 'Media type'), facts.mediaType),
          ...fact(t('infoFormat', 'Format'), facts.mimeType),
          ...fact(t('infoSize', 'Size'), facts.size === undefined ? undefined : formatBytes(facts.size)),
          ...fact(t('infoCreated', 'Created'), date(facts.created)),
          ...fact(t('infoUpdated', 'Changed'), date(facts.updated)),
          ...fact(t('infoLocation', 'Location'), facts.url),
        ],
      },
      {
        id: 'picture',
        heading: t('infoGroupPicture', 'Picture'),
        facts:
          facts.kind === 'image'
            ? [
                ...fact(t('infoDimensions', 'Dimensions'), pixels(facts.width, facts.height)),
                ...fact(
                  t('infoFocalPoint', 'Focal point'),
                  focal
                    ? t(
                        'infoFocalPointValue',
                        `${Math.round(focal.left * 100)}% across, ${Math.round(focal.top * 100)}% down`,
                        Math.round(focal.left * 100),
                        Math.round(focal.top * 100),
                      )
                    : undefined,
                ),
              ]
            : [],
      },
      {
        id: 'media',
        heading: t('infoGroupMedia', 'Sound and video'),
        facts:
          facts.kind === 'audio' || facts.kind === 'video'
            ? [
                ...fact(t('infoLength', 'Length'), facts.duration === undefined || !Number.isFinite(facts.duration) ? undefined : formatTime(facts.duration)),
                ...fact(t('infoDimensions', 'Dimensions'), pixels(facts.width, facts.height)),
              ]
            : [],
      },
      {
        id: 'camera',
        heading: t('infoGroupCamera', 'Camera'),
        facts: [
          ...fact(t('infoCamera', 'Camera'), [exif?.make, exif?.model].filter(Boolean).join(' ') || undefined),
          ...fact(t('infoTaken', 'Taken'), exif?.taken),
          ...fact(t('infoExposure', 'Exposure'), exif?.exposure ? formatExposure(exif.exposure) : undefined),
          ...fact(t('infoAperture', 'Aperture'), exif?.fNumber ? `f/${Number(exif.fNumber.toFixed(1))}` : undefined),
          ...fact(t('infoIso', 'ISO'), exif?.iso ? String(exif.iso) : undefined),
          ...fact(t('infoFocalLength', 'Focal length'), exif?.focalLength ? `${Number(exif.focalLength.toFixed(1))} mm` : undefined),
        ],
      },
      {
        id: 'place',
        heading: t('infoGroupPlace', 'Place'),
        facts:
          exif?.latitude !== undefined && exif.longitude !== undefined
            ? [{ label: t('infoCoordinates', 'Coordinates'), value: formatCoordinates(exif.latitude, exif.longitude) }]
            : [],
      },
    ];
    return groups.filter((group) => group.facts.length);
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
   * A link to the place on OpenStreetMap, which needs no account or key. Opened in a new tab, and
   * marked so Umbraco's router leaves it alone, as every link the desktop renders for itself must be
   * (CLAUDE.md).
   * @returns The link, or nothing when the photo has no place.
   */
  #renderMap() {
    const exif = this._facts?.exif;
    if (exif?.latitude === undefined || exif.longitude === undefined) return nothing;
    const { latitude: lat, longitude: lon } = exif;
    const href = `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=15/${lat.toFixed(5)}/${lon.toFixed(5)}`;
    return html`<a class="map" href=${href} target="_blank" rel="noopener noreferrer" data-router-slot="disabled">
      ${this.#term('infoMap', 'Show on a map')}
    </a>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, and the facts.
   */
  override render() {
    const groups = this.#groups();
    return html`
      <div class="toolbar">
        <button class="control" data-action="open" title=${this.#term('openTitle', 'Open from the media library (Ctrl+O)')} @click=${() => this.open()}>
          ${this.#term('open', 'Open…')}
        </button>
        <button class="control" data-action="copy" ?disabled=${!groups.length} @click=${() => this.copyAll()}>
          ${this.#term('infoCopy', 'Copy')}
        </button>
        ${this._notice ? html`<span class="notice muted" role="status">${this._notice}</span>` : nothing}
      </div>
      <div class="facts sunken" aria-busy=${this._busy ? 'true' : 'false'}>
        ${groups.length
          ? groups.map(
              (group) => html`<section data-group=${group.id}>
                <h3>${group.heading}</h3>
                <table>
                  ${group.facts.map((fact) => html`<tr><th scope="row">${fact.label}</th><td>${fact.value}</td></tr>`)}
                </table>
                ${group.id === 'place' ? this.#renderMap() : nothing}
              </section>`,
            )
          : html`<div class="empty muted">${this.#term('infoEmpty', 'Select Open… to see everything about a file in the media library.')}</div>`}
      </div>
    `;
  }

  /** The shared look, plus a sheet of facts that scrolls when there are more than fit. */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        padding: ${INFO_PADDING_PX}px;
        gap: ${INFO_PADDING_PX}px;
        height: 100%;
      }

      .toolbar {
        flex-wrap: nowrap;
        flex: none;
        height: ${INFO_BAR_HEIGHT_PX}px;
      }

      .control {
        height: ${INFO_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.85em;
      }

      .facts {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 4px 10px 10px;
      }

      h3 {
        margin: 8px 0 4px;
        font-size: 0.9em;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85em;
        table-layout: fixed;
      }

      th {
        width: 36%;
        padding: 2px 8px 2px 0;
        text-align: left;
        font-weight: normal;
        color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
        vertical-align: top;
      }

      td {
        padding: 2px 0;
        overflow-wrap: anywhere;
        user-select: text;
      }

      .map {
        display: inline-block;
        margin-top: 4px;
        font-size: 0.85em;
        color: var(--umbradesktop-app-accent, var(--uui-color-interactive));
      }

      .empty {
        padding: 24px 12px;
        text-align: center;
      }
    `,
  ];
}

export { MediaInfoElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-media-info': MediaInfoElement;
  }
}
