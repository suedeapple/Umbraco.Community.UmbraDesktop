import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { kindOf } from '../shared/media-kinds.js';
import type { MediaFile } from '../shared/media-kinds.js';
import { createFolderPictures, createMediaPicker } from '../shared/media-library.js';
import type { FolderPictures, MediaPicker } from '../shared/media-library.js';
import { VIEWER_BAR_HEIGHT_PX, VIEWER_MIN_SCREEN_HEIGHT_PX, VIEWER_PADDING_PX, VIEWER_SLIDESHOW_MS } from './constants.js';
import { fitScale, zoomIn, zoomOut } from './zoom.js';
import type { Size } from './zoom.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Picture Viewer, as a self-contained UmbraDesktop app: looks through the pictures in a media
 * folder, as Windows' Picture and Fax Viewer looked through the pictures in a folder on the
 * computer.
 *
 * **Open a picture, and its folder comes with it.** The person picks one picture with Umbraco's own
 * media picker; the viewer then lists the other pictures in the same folder, in the Media section's
 * order, and Previous, Next and the slideshow go through those. Picking a folder instead would need
 * a picker the backoffice does not have for media, and opening the picture you meant first is how
 * every desktop viewer works.
 *
 * **One zoom, two ways in.** Fitted, the scale is whatever shows the whole picture in the window
 * ({@link fitScale}), recomputed as the window is resized; zoomed, it is a step the person chose.
 * Either way the picture is drawn at its natural size times the scale, so the two are one code path,
 * and the status bar can say what fitting came to. Past the window's edges the picture scrolls.
 *
 * Pictures stream from their media URLs: nothing is downloaded first, and nothing can be changed,
 * so the window never reports unsaved work. Paint, in the Accessories package, is for changing one.
 */
@customElement('umbradesktop-picture-viewer')
export class PictureViewerElement extends UmbLitElement {
  /** How a picture is picked from the media library. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  pickMedia?: MediaPicker;

  /** How a folder's pictures are listed. The media tree unless a test says otherwise. */
  @property({ attribute: false })
  listPictures?: FolderPictures;

  /** How long the slideshow shows each picture, in ms. A test makes it short. */
  @property({ attribute: false })
  slideshowMs = VIEWER_SLIDESHOW_MS;

  /** The pictures Previous and Next go through: the open picture's folder. */
  @state()
  private _pictures: MediaFile[] = [];

  /** Which of them is showing. */
  @state()
  private _index = 0;

  /** The showing picture's own size, once it has loaded. Zero until then. */
  @state()
  private _natural: Size = { w: 0, h: 0 };

  /** The space the screen gives a picture, as last measured. */
  @state()
  private _screen: Size = { w: 0, h: 0 };

  /** The scale the person zoomed to, or undefined while the picture is fitted to the window. */
  @state()
  private _zoom?: number;

  /** Whether the slideshow is running. */
  @state()
  private _slideshow = false;

  /** Why an open, or a picture, did not work. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** The slideshow's timer, while it runs. */
  #timer?: ReturnType<typeof setInterval>;

  /** Measures the screen, so a fitted picture follows the window as it is resized. */
  #resize = new ResizeObserver(() => this.#measure());

  /** The picture showing, if any. */
  get #current(): MediaFile | undefined {
    return this._pictures[this._index];
  }

  /** The scale the picture is drawn at: the chosen zoom, or whatever fits it in the window. */
  get scale(): number {
    return this._zoom ?? fitScale(this._natural, this._screen);
  }

  /** Take the keyboard, as Media Player does, so the arrows work as soon as the window is active. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /**
   * Stop the slideshow and the measuring. A closed window must not go on running a timer behind it,
   * and a window opened again starts with the slideshow off, as it does the first time.
   */
  override disconnectedCallback(): void {
    this.#setSlideshow(false);
    this.#resize.disconnect();
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Measure the screen: from the first render, and again after a reconnect, since disconnecting let
   * the observer go. Observing an element already observed does nothing, so this costs nothing on
   * every other update.
   */
  override updated(): void {
    if (this.isConnected) {
      const screen = this.shadowRoot?.querySelector('.screen');
      if (screen) this.#resize.observe(screen);
    }
  }

  /**
   * The keys every picture viewer answers to. Ctrl+O (or Cmd+O) opens, and is claimed so the browser
   * does not open a file into the tab. With a picture open: the arrows go back and forward, plus and
   * minus zoom, 0 fits the picture to the window and 1 shows it at its own size.
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
    if (event.altKey || !this.#current) return;
    const target = event.composedPath()[0];
    if (target instanceof Element && target.closest('button')) return;
    const action = {
      arrowleft: () => this.previous(),
      arrowright: () => this.next(),
      '+': () => this.zoomIn(),
      '=': () => this.zoomIn(),
      '-': () => this.zoomOut(),
      '0': () => this.fit(),
      '1': () => this.actualSize(),
    }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    action();
  };

  /**
   * Ctrl and the wheel zoom, as they do in every viewer; the wheel on its own scrolls a zoomed
   * picture, which the screen does by itself.
   * @param event The wheel.
   */
  #onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey) || !this.#current) return;
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn();
    else if (event.deltaY > 0) this.zoomOut();
  }

  /**
   * Pick a picture from the media library and show it, with the rest of its folder to go through.
   *
   * The media picker offers every file; anything that is not a picture is refused here, by name, and
   * whatever was open stays open. A folder listing that does not include the picked picture (one
   * that failed, or a picture in the recycle bin) leaves the picture on its own.
   */
  async open(): Promise<void> {
    const result = await (this.pickMedia ?? createMediaPicker(this))();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be opened.`, result.name ?? '');
      return;
    }
    if (kindOf(result.extension) !== 'image') {
      this._notice = this.#term('viewerNotPicture', `Picture Viewer shows pictures, and ${result.name} is not one.`, result.name);
      return;
    }
    const chosen: MediaFile = { unique: result.unique, name: result.name, url: result.url, extension: result.extension };
    const folder = await (this.listPictures ?? createFolderPictures(this))(result.folder).catch(() => []);
    const index = folder.findIndex((picture) => picture.unique === chosen.unique);
    this.#setSlideshow(false);
    this._pictures = index >= 0 ? folder : [chosen];
    this.#show(Math.max(index, 0));
  }

  /** Show the next picture, going round to the first after the last. */
  next(): void {
    if (this._pictures.length > 1) this.#show((this._index + 1) % this._pictures.length);
  }

  /** Show the previous picture, going round to the last before the first. */
  previous(): void {
    if (this._pictures.length > 1) this.#show((this._index - 1 + this._pictures.length) % this._pictures.length);
  }

  /** Zoom in a step from whatever the scale is now, fitted included. */
  zoomIn(): void {
    if (this.#current) this._zoom = zoomIn(this.scale);
  }

  /** Zoom out a step. */
  zoomOut(): void {
    if (this.#current) this._zoom = zoomOut(this.scale);
  }

  /** Show the picture at its own size, one pixel to one. */
  actualSize(): void {
    if (this.#current) this._zoom = 1;
  }

  /** Fit the whole picture in the window again, and keep it fitted as the window is resized. */
  fit(): void {
    this._zoom = undefined;
  }

  /** Start the slideshow, or stop it. */
  toggleSlideshow(): void {
    this.#setSlideshow(!this._slideshow);
  }

  /**
   * Start or stop the slideshow's timer. Only with more than one picture: a slideshow of one is a
   * picture.
   * @param on Whether it should run.
   */
  #setSlideshow(on: boolean): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
    this._slideshow = on && this._pictures.length > 1;
    if (this._slideshow) this.#timer = setInterval(() => this.next(), this.slideshowMs);
  }

  /**
   * Show one of the pictures, fitted, as every viewer opens a picture. A slideshow that is running
   * starts its count again, so a picture someone moved to by hand gets its full time.
   * @param index Which.
   */
  #show(index: number): void {
    this._index = index;
    this._natural = { w: 0, h: 0 };
    this._zoom = undefined;
    this._notice = '';
    if (this._slideshow) this.#setSlideshow(true);
  }

  /** Measure the space the screen gives a picture: its inside, without the scroll bars. */
  #measure(): void {
    const screen = this.shadowRoot?.querySelector<HTMLElement>('.screen');
    if (!screen) return;
    const size = { w: screen.clientWidth, h: screen.clientHeight };
    if (size.w !== this._screen.w || size.h !== this._screen.h) this._screen = size;
  }

  /**
   * Note the picture's own size once it has loaded, which is what fitting and zooming scale.
   * @param event The image's load.
   */
  #onLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    this._natural = { w: image.naturalWidth, h: image.naturalHeight };
    this.#measure();
  }

  /** A picture the browser could not show, such as a damaged file. */
  #onError(): void {
    const name = this.#current?.name ?? '';
    this._notice = this.#term('viewerCannotShow', `${name} could not be shown.`, name);
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
   * One of the toolbar's icon buttons: an icon, with its name as label and tooltip.
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
   * The picture, drawn at its natural size times the scale. Before it has loaded its size is not
   * known, so it is drawn fitted by the layout alone, which is also how a picture that never reports
   * a size (an SVG without one) stays fitted rather than collapsing to nothing.
   * @param picture The picture.
   * @returns The image.
   */
  #renderPicture(picture: MediaFile) {
    const sized = this._natural.w > 0 && this._natural.h > 0;
    const style = sized
      ? `width: ${this._natural.w * this.scale}px; height: ${this._natural.h * this.scale}px`
      : 'max-width: 100%; max-height: 100%';
    return html`<img
      src=${picture.url}
      alt=${picture.name}
      style=${style}
      draggable="false"
      @load=${this.#onLoad}
      @error=${this.#onError}
    />`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, the screen and the status bar.
   */
  override render() {
    const picture = this.#current;
    const several = this._pictures.length > 1;
    return html`
      <div class="toolbar">
        <button class="control" data-action="open" title=${this.#term('openTitle', 'Open from the media library (Ctrl+O)')} @click=${() => this.open()}>
          ${this.#term('open', 'Open…')}
        </button>
        <span class="group">
          ${this.#button('previous', 'icon-previous-media', this.#term('viewerPrevious', 'Previous picture'), () => this.previous(), {
            disabled: !several,
          })}
          ${this.#button('next', 'icon-next-media', this.#term('viewerNext', 'Next picture'), () => this.next(), { disabled: !several })}
          ${this.#button('slideshow', 'icon-slideshow', this.#term('viewerSlideshow', 'Slideshow'), () => this.toggleSlideshow(), {
            disabled: !several,
            pressed: this._slideshow,
          })}
        </span>
        <span class="group">
          ${this.#button('zoom-out', 'icon-zoom-out', this.#term('viewerZoomOut', 'Zoom out'), () => this.zoomOut(), { disabled: !picture })}
          ${this.#button('zoom-in', 'icon-zoom-in', this.#term('viewerZoomIn', 'Zoom in'), () => this.zoomIn(), { disabled: !picture })}
          <button
            class="control icon ratio"
            data-action="actual"
            title=${this.#term('viewerActualSize', 'Actual size')}
            aria-label=${this.#term('viewerActualSize', 'Actual size')}
            aria-pressed=${picture && this._zoom === 1 ? 'true' : 'false'}
            ?disabled=${!picture}
            @click=${() => this.actualSize()}
          >
            1:1
          </button>
          ${this.#button('fit', 'icon-fullscreen', this.#term('viewerFit', 'Fit to window'), () => this.fit(), {
            disabled: !picture,
            pressed: !!picture && this._zoom === undefined,
          })}
        </span>
      </div>
      <div class="screen sunken" @wheel=${this.#onWheel}>
        ${picture
          ? this.#renderPicture(picture)
          : html`<div class="empty muted">${this.#term('viewerEmpty', 'Select Open… to look at the pictures in a media folder.')}</div>`}
      </div>
      <div class="status muted">
        ${picture ? html`<span class="name">${picture.name}</span>` : nothing}
        ${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : nothing}
        ${picture
          ? html`<span class="position">${this.#term('viewerPosition', `${this._index + 1} of ${this._pictures.length}`, this._index + 1, this._pictures.length)}</span>
              <span class="zoom">${Math.round(this.scale * 100)}%</span>`
          : nothing}
      </div>
    `;
  }

  /**
   * The shared look, plus a screen that takes whatever the two bars leave and scrolls a picture
   * larger than itself.
   *
   * The picture is centred by auto margins in a grid rather than by `place-items: center`: centring
   * by alignment pushes a picture wider than the screen off its left edge, where no scroll bar can
   * reach, while auto margins centre what fits and fall to zero for what does not.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        padding: ${VIEWER_PADDING_PX}px;
        gap: ${VIEWER_PADDING_PX}px;
        height: 100%;
        outline: none;
      }

      .toolbar {
        flex-wrap: nowrap;
        min-height: ${VIEWER_BAR_HEIGHT_PX}px;
        gap: 8px;
      }

      .group {
        display: flex;
        gap: 2px;
      }

      .control {
        height: ${VIEWER_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control.icon {
        width: ${VIEWER_BAR_HEIGHT_PX}px;
        padding: 0;
        font-size: 16px;
      }

      /* Actual size is written 1:1, as photo viewers write it, rather than drawn: every magnifier
         icon reads as one more zoom button beside Zoom in and Zoom out. */
      .control.ratio {
        font-size: 0.8em;
        font-variant-numeric: tabular-nums;
      }

      .screen {
        flex: 1;
        min-height: ${VIEWER_MIN_SCREEN_HEIGHT_PX}px;
        overflow: auto;
        display: grid;
      }

      img {
        margin: auto;
        display: block;
        object-fit: contain;
      }

      .empty {
        margin: auto;
        padding: 0 16px;
        text-align: center;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: none;
        height: ${VIEWER_BAR_HEIGHT_PX - 8}px;
        padding: 0 2px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      .name,
      .notice {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Whatever is left after the name and the notice, so the position and the zoom keep to the
         right-hand end. */
      .position {
        margin-left: auto;
      }

      .zoom {
        min-width: 3.5em;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

export { PictureViewerElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-picture-viewer': PictureViewerElement;
  }
}
