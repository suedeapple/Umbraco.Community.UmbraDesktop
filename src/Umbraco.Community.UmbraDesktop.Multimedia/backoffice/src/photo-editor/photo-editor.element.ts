import { multimediaStyles } from '../shared/styles.js';
import { keepFocusOnPress } from '../shared/press-focus.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { editableImageType, fileNameFor } from '../shared/media-kinds.js';
import { createMediaOpener } from '../shared/media-open.js';
import type { MediaOpener } from '../shared/media-open.js';
import { createMediaSaver, createOverwriteQuestion } from '../shared/media-save.js';
import type { MediaSaveRequest, MediaSaver, OverwriteQuestion } from '../shared/media-save.js';
import { createSaveFolderPicker } from '../shared/save-location.js';
import type { SaveFolderPicker } from '../shared/save-location.js';
import { fitScale } from '../picture-viewer/zoom.js';
import {
  EDITOR_BAR_HEIGHT_PX,
  EDITOR_MIN_WELL_HEIGHT_PX,
  EDITOR_PADDING_PX,
  EDITOR_SAVE_QUALITY,
  EDITOR_UNDO_STEPS,
} from './constants.js';
import { History, crop, flip, normaliseRect, resize, rotate, sizeKeepingAspect } from './transform.js';
import type { Point, Rect, Size } from './transform.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/** The type a picture is by its extension, for a file whose type the server did not say. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

/** The extension each format a picture is saved in is saved with. */
const EXTENSION_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** What the options bar is showing: nothing, a crop being drawn, or the resize fields. */
type Mode = 'none' | 'crop' | 'resize';

/**
 * Photo Editor, as a self-contained UmbraDesktop app: crop, rotate, flip and resize a picture in the
 * media library, then save it back or as a copy. Microsoft Photo Editor, which came with Office, did
 * this much and no more, and it is what editors mostly need before a picture goes on a page.
 *
 * **Files work as Notepad's and Paint's do.** Open fetches the picture (`shared/media-open.ts`);
 * Save writes back over the item it came from, asking first if somebody changed it in the Media
 * section meanwhile; Save As asks for a folder and saves a copy under the name in the status bar. A
 * picture is saved in its own format where a canvas can write it, so a JPEG stays a JPEG
 * (`editableImageType`). An SVG is refused: it is a drawing, and saving pixels over it would destroy
 * it.
 *
 * **Every edit makes a new canvas** (`transform.ts`), so undo is the previous canvas rather than
 * the edit worked backwards, kept for the last {@link EDITOR_UNDO_STEPS} edits. Unsaved edits are
 * reported to the desktop with {@link UNSAVED_ATTRIBUTE}, so closing the window asks first, and so
 * does Open.
 *
 * The picture is shown fitted to the window, never above its own size, by the same rule Picture
 * Viewer fits by; a crop is drawn on it with the pointer, in the picture's own pixels.
 */
@customElement('umbradesktop-photo-editor')
export class PhotoEditorElement extends UmbLitElement {
  /** How a picture is picked from the media library and read. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  openFromMedia?: MediaOpener;

  /** How a picture reaches the media library. The backoffice's media repositories unless a test says otherwise. */
  @property({ attribute: false })
  saveToMedia?: MediaSaver;

  /** Asks where a copy goes. Umbraco's folder picker unless a test says otherwise. */
  @property({ attribute: false })
  pickSaveFolder?: SaveFolderPicker;

  /** Asks whether to overwrite a picture somebody changed. Umbraco's confirm dialog unless a test says otherwise. */
  @property({ attribute: false })
  confirmOverwrite?: OverwriteQuestion;

  /** Asks whether unsaved edits may be thrown away. Umbraco's discard-changes dialog unless a test says otherwise. */
  @property({ attribute: false })
  confirmDiscard: () => Promise<boolean> = async () => {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  };

  /** The picture as it is now. */
  @state()
  private _canvas?: HTMLCanvasElement;

  /** What the picture is called: its media item's name, and a copy's. */
  @state()
  private _name = '';

  /** The name as it was opened or last saved. */
  @state()
  private _savedName = '';

  /** How many edits are applied since the picture was opened. Undo takes one off. */
  @state()
  private _depth = 0;

  /** {@link _depth} when the picture was last saved: unsaved is any other depth. */
  @state()
  private _savedDepth = 0;

  /** What the options bar shows. */
  @state()
  private _mode: Mode = 'none';

  /** The crop being drawn, in the picture's pixels. */
  @state()
  private _selection?: Rect;

  /** The resize fields. */
  @state()
  private _resizeTo: Size = { w: 0, h: 0 };

  /** Whether resizing keeps the picture's shape. */
  @state()
  private _keepShape = true;

  /** The space the well gives the picture, as last measured. */
  @state()
  private _well: Size = { w: 0, h: 0 };

  /** The last thing worth telling the person. Empty when there is nothing to say. */
  @state()
  private _notice = '';

  /** The pictures before each edit. */
  #history = new History(EDITOR_UNDO_STEPS);

  /** The media item the picture came from or was last saved as, which Save overwrites. */
  #mediaUnique?: string;

  /** When that item was last changed as far as this window knows. */
  #updateDate?: string | null;

  /** The format the picture saves in. */
  #saveType = 'image/png';

  /** Where a crop drag started, in the picture's pixels. */
  #dragFrom?: Point;

  /** Measures the well, so the picture stays fitted as the window is resized. */
  #resizeObserver = new ResizeObserver(() => this.#measure());

  /** Whether there are edits, or a rename, not saved. */
  get dirty(): boolean {
    return !!this._canvas && (this._depth !== this._savedDepth || this._name !== this._savedName);
  }

  /** Take the keyboard, as Paint does, for Ctrl+Z and the other shortcuts. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mousedown', keepFocusOnPress);
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /** Stop listening, and let go of the measuring. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.#resizeObserver.disconnect();
    super.disconnectedCallback();
  }

  /** Mirror the unsaved state onto the host, and measure the well from the first render on. */
  override updated(): void {
    this.toggleAttribute(UNSAVED_ATTRIBUTE, this.dirty);
    const well = this.shadowRoot?.querySelector('.well');
    if (well && this.isConnected) this.#resizeObserver.observe(well);
  }

  /**
   * Ctrl+Z, Ctrl+S and Ctrl+O, or Cmd on a Mac, claimed so the browser does not act on them too;
   * Enter applies a crop and Escape cancels one, or the resize fields.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const action = { z: () => this.undo(), s: () => this.save(), o: () => this.open() }[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      void action();
      return;
    }
    const target = event.composedPath()[0];
    if (event.key === 'Escape' && this._mode !== 'none') {
      event.preventDefault();
      this.#setMode('none');
    } else if (event.key === 'Enter' && this._mode === 'crop' && !(target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.applyCrop();
    }
  };

  /**
   * Open a picture from the media library. Unsaved edits are asked about first. A file that is not
   * a picture made of pixels is refused by name, and whatever was open stays open.
   */
  async open(): Promise<void> {
    if (this.dirty && !(await this.confirmDiscard())) return;
    const result = await (this.openFromMedia ?? createMediaOpener(this))();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be opened.`, result.name ?? '');
      return;
    }
    const type = editableImageType(result.blob.type || TYPE_BY_EXTENSION[result.extension] || '');
    const bitmap = type ? await createImageBitmap(result.blob).catch(() => undefined) : undefined;
    if (!type || !bitmap) {
      this._notice = this.#term('editorNotPicture', `Photo Editor edits pictures made of pixels, and ${result.name} is not one.`, result.name);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    this.#history.clear();
    this.#mediaUnique = result.unique;
    this.#updateDate = result.updateDate;
    this.#saveType = type;
    this._canvas = canvas;
    this._name = result.name;
    this._savedName = result.name;
    this._depth = 0;
    this._savedDepth = 0;
    this._notice = '';
    this.#setMode('none');
  }

  /**
   * Apply an edit: keep the picture as it was for undo, and show the new one.
   * @param edit What to do to the picture.
   */
  #edit(edit: (canvas: HTMLCanvasElement) => HTMLCanvasElement): void {
    if (!this._canvas) return;
    this.#history.push(this._canvas);
    this._canvas = edit(this._canvas);
    this._depth++;
    this._notice = '';
  }

  /** Take back the last edit. */
  undo(): void {
    const previous = this.#history.undo();
    if (!previous) return;
    this._canvas = previous;
    this._depth--;
    this.#setMode('none');
  }

  /** Crop to the rectangle drawn, if one was. */
  applyCrop(): void {
    const selection = this._selection;
    if (!selection || selection.w < 1 || selection.h < 1) return;
    this.#edit((canvas) => crop(canvas, selection));
    this.#setMode('none');
  }

  /** Resize to the size in the fields, if it is one. */
  applyResize(): void {
    const { w, h } = this._resizeTo;
    if (!(w >= 1 && h >= 1)) return;
    this.#edit((canvas) => resize(canvas, { w: Math.round(w), h: Math.round(h) }));
    this.#setMode('none');
  }

  /**
   * Show the crop hint, the resize fields, or neither, starting each fresh.
   * @param mode Which.
   */
  #setMode(mode: Mode): void {
    this._mode = mode;
    this._selection = undefined;
    this.#dragFrom = undefined;
    if (mode === 'resize' && this._canvas) this._resizeTo = { w: this._canvas.width, h: this._canvas.height };
  }

  /**
   * Save over the media item the picture came from, asking first if somebody changed it since. A
   * picture with no item behind it (one saved as nothing yet) goes through Save As instead.
   */
  async save(): Promise<void> {
    if (!this._canvas) return;
    if (!this.#mediaUnique) return this.saveAs();
    await this.#write({ existing: this.#mediaUnique, folder: null });
  }

  /** Save a copy, in the folder Save As is told, under the name in the status bar. The original is left alone. */
  async saveAs(): Promise<void> {
    if (!this._canvas) return;
    const choice = await (this.pickSaveFolder ?? createSaveFolderPicker(this))();
    if (choice.status === 'cancelled') return;
    await this.#write({ existing: undefined, folder: choice.folder });
  }

  /**
   * Write the picture to the media library.
   * @param target The item to overwrite, or the folder a new one goes in.
   * @param target.existing The item, for Save.
   * @param target.folder The folder, for Save As.
   */
  async #write(target: { existing?: string; folder: string | null }): Promise<void> {
    const canvas = this._canvas!;
    const depth = this._depth;
    const untitled = this.#term('editorUntitled', 'Untitled');
    const name = this._name.trim() || untitled;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, this.#saveType, EDITOR_SAVE_QUALITY));
    if (!blob) return;
    const extension = EXTENSION_BY_TYPE[blob.type] ?? 'png';
    const saver = this.saveToMedia ?? createMediaSaver(this);
    const request: MediaSaveRequest = {
      file: new File([blob], fileNameFor(this._name, untitled, extension), { type: blob.type }),
      name,
      folder: target.folder,
      existing: target.existing,
      expectedUpdateDate: target.existing ? this.#updateDate : undefined,
    };
    let result = await saver(request);
    if (!result.ok && result.conflict) {
      const label = this._savedName.trim() || untitled;
      if (!(await (this.confirmOverwrite ?? createOverwriteQuestion(this))(label))) {
        this._notice = this.#term('overwriteDeclined', `Not saved: ${label} was changed in the media library.`, label);
        return;
      }
      result = await saver({ ...request, force: true });
    }
    if (!result.ok) {
      this._notice = this.#term('editorNotSaved', `Not saved. ${result.message ?? ''}`, result.message ?? '');
      return;
    }
    this.#mediaUnique = result.unique;
    this.#updateDate = result.updateDate;
    this._savedDepth = depth;
    this._savedName = this._name;
    this._notice = this.#term('editorSaved', 'Saved to the media library.');
  }

  /** Measure the space the well gives the picture. */
  #measure(): void {
    const well = this.shadowRoot?.querySelector<HTMLElement>('.well');
    if (!well) return;
    const size = { w: well.clientWidth, h: well.clientHeight };
    if (size.w !== this._well.w || size.h !== this._well.h) this._well = size;
  }

  /**
   * A pointer position in the picture's own pixels.
   * @param event The pointer event, over the picture.
   * @returns The point.
   */
  #toPicture(event: PointerEvent): Point {
    const canvas = this._canvas!;
    const box = canvas.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * canvas.width, y: ((event.clientY - box.top) / box.height) * canvas.height };
  }

  /**
   * Start drawing a crop.
   * @param event The press on the picture.
   */
  #onPointerDown(event: PointerEvent): void {
    if (this._mode !== 'crop' || !this._canvas) return;
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Uncaptured, the crop still follows while the pointer is over the picture.
    }
    this.#dragFrom = this.#toPicture(event);
    this._selection = undefined;
  }

  /**
   * Draw the crop as the pointer moves.
   * @param event The move.
   */
  #onPointerMove(event: PointerEvent): void {
    if (!this.#dragFrom || !this._canvas) return;
    this._selection = normaliseRect(this.#dragFrom, this.#toPicture(event), { w: this._canvas.width, h: this._canvas.height });
  }

  /** Finish drawing the crop. */
  #onPointerUp(): void {
    this.#dragFrom = undefined;
  }

  /**
   * Change a resize field, working out the other from it when the shape is kept.
   * @param side Which field.
   * @param value What was typed.
   */
  #onResizeField(side: 'w' | 'h', value: string): void {
    const number = Number(value);
    if (!this._canvas || !(number > 0)) {
      this._resizeTo = { ...this._resizeTo, [side]: number };
      return;
    }
    this._resizeTo = this._keepShape
      ? sizeKeepingAspect({ w: this._canvas.width, h: this._canvas.height }, { [side]: number })
      : { ...this._resizeTo, [side]: number };
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
   * One of the tools: an icon, with its name as label and tooltip.
   * @param action The `data-action`, for tests and styling.
   * @param icon The Umbraco icon.
   * @param label What it does.
   * @param run What it runs.
   * @param options Whether it is unavailable, and whether it is a switch that is on.
   * @returns The button.
   */
  #tool(action: string, icon: string, label: string, run: () => void, options: { disabled?: boolean; pressed?: boolean } = {}) {
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
   * The bar under the toolbar: the crop hint and its buttons, or the resize fields, or nothing.
   * @returns The bar.
   */
  #renderOptions() {
    if (this._mode === 'crop') {
      return html`<div class="options">
        <span class="muted hint">${this.#term('editorCropHint', 'Drag across the picture to choose what to keep.')}</span>
        <button class="control" data-action="apply-crop" ?disabled=${!this._selection?.w || !this._selection?.h} @click=${() => this.applyCrop()}>
          ${this.#term('editorApplyCrop', 'Crop to selection')}
        </button>
        <button class="control" data-action="cancel" @click=${() => this.#setMode('none')}>${this.#term('editorCancel', 'Cancel')}</button>
      </div>`;
    }
    if (this._mode === 'resize') {
      return html`<div class="options">
        <label>
          ${this.#term('editorWidth', 'Width')}
          <input
            class="number sunken"
            type="number"
            min="1"
            data-field="width"
            .value=${String(this._resizeTo.w || '')}
            @input=${(event: Event) => this.#onResizeField('w', (event.target as HTMLInputElement).value)}
          />
        </label>
        <label>
          ${this.#term('editorHeight', 'Height')}
          <input
            class="number sunken"
            type="number"
            min="1"
            data-field="height"
            .value=${String(this._resizeTo.h || '')}
            @input=${(event: Event) => this.#onResizeField('h', (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="keep">
          <input type="checkbox" .checked=${this._keepShape} @change=${(event: Event) => (this._keepShape = (event.target as HTMLInputElement).checked)} />
          ${this.#term('editorKeepShape', 'Keep shape')}
        </label>
        <button class="control" data-action="apply-resize" @click=${() => this.applyResize()}>${this.#term('editorApplyResize', 'Resize')}</button>
        <button class="control" data-action="cancel" @click=${() => this.#setMode('none')}>${this.#term('editorCancel', 'Cancel')}</button>
      </div>`;
    }
    return nothing;
  }

  /**
   * The picture in its well, fitted, with the crop drawn over it.
   * @param canvas The picture.
   * @returns The stage.
   */
  #renderPicture(canvas: HTMLCanvasElement) {
    const scale = fitScale({ w: canvas.width, h: canvas.height }, this._well);
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
    const s = this._selection;
    return html`<div
      class="stage ${this._mode === 'crop' ? 'cropping' : ''}"
      @pointerdown=${this.#onPointerDown}
      @pointermove=${this.#onPointerMove}
      @pointerup=${this.#onPointerUp}
      @pointercancel=${this.#onPointerUp}
    >
      ${canvas}
      ${s
        ? html`<div
            class="selection"
            style="left: ${s.x * scale}px; top: ${s.y * scale}px; width: ${s.w * scale}px; height: ${s.h * scale}px"
          ></div>`
        : nothing}
    </div>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, the options bar, the picture and the status bar.
   */
  override render() {
    const canvas = this._canvas;
    const none = !canvas;
    const untitled = this.#term('editorUntitled', 'Untitled');
    return html`
      <div class="toolbar">
        <button class="control" data-action="open" title=${this.#term('openTitle', 'Open from the media library (Ctrl+O)')} @click=${() => this.open()}>
          ${this.#term('open', 'Open…')}
        </button>
        <button class="control" data-action="save" title=${this.#term('editorSaveTitle', 'Save over the picture in the media library (Ctrl+S)')} ?disabled=${none} @click=${() => this.save()}>
          ${this.#term('editorSave', 'Save')}
        </button>
        <button class="control" data-action="save-as" title=${this.#term('editorSaveAsTitle', 'Save a copy in the media library')} ?disabled=${none} @click=${() => this.saveAs()}>
          ${this.#term('editorSaveAs', 'Save As…')}
        </button>
        <span class="separator"></span>
        ${this.#tool('undo', 'icon-history', this.#term('editorUndo', 'Undo (Ctrl+Z)'), () => this.undo(), { disabled: none || !this.#history.canUndo })}
        <span class="separator"></span>
        ${this.#tool('rotate-left', 'icon-undo', this.#term('editorRotateLeft', 'Rotate left'), () => this.#edit((c) => rotate(c, -1)), { disabled: none })}
        ${this.#tool('rotate-right', 'icon-redo', this.#term('editorRotateRight', 'Rotate right'), () => this.#edit((c) => rotate(c, 1)), { disabled: none })}
        ${this.#tool('flip-horizontal', 'icon-navigation-horizontal', this.#term('editorFlipHorizontal', 'Flip horizontal'), () => this.#edit((c) => flip(c, 'horizontal')), { disabled: none })}
        ${this.#tool('flip-vertical', 'icon-navigation-vertical', this.#term('editorFlipVertical', 'Flip vertical'), () => this.#edit((c) => flip(c, 'vertical')), { disabled: none })}
        ${this.#tool('crop', 'icon-crop', this.#term('editorCrop', 'Crop'), () => this.#setMode(this._mode === 'crop' ? 'none' : 'crop'), {
          disabled: none,
          pressed: this._mode === 'crop',
        })}
        ${this.#tool('resize', 'icon-resize', this.#term('editorResize', 'Resize'), () => this.#setMode(this._mode === 'resize' ? 'none' : 'resize'), {
          disabled: none,
          pressed: this._mode === 'resize',
        })}
      </div>
      ${this.#renderOptions()}
      <div class="well sunken">
        ${canvas ? this.#renderPicture(canvas) : html`<div class="empty muted">${this.#term('editorEmpty', 'Select Open… to edit a picture from the media library.')}</div>`}
      </div>
      <div class="status muted">
        <input
          class="name sunken"
          data-field="name"
          .value=${this._name}
          placeholder=${untitled}
          aria-label=${this.#term('editorName', 'Name')}
          ?disabled=${none}
          @input=${(event: Event) => (this._name = (event.target as HTMLInputElement).value)}
        />
        ${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : nothing}
        <span class="size">${canvas ? `${canvas.width} × ${canvas.height}` : ''}</span>
      </div>
    `;
  }

  /**
   * The shared look, plus a well that fits the picture and a crop drawn as a dashed rectangle over a
   * dimmed picture. The selection is drawn in the accent, with a dark ring so it shows on any photo.
   */
  static override styles = [
    multimediaStyles,
    css`
      :host {
        padding: ${EDITOR_PADDING_PX}px;
        gap: ${EDITOR_PADDING_PX}px;
        height: 100%;
        outline: none;
      }

      .toolbar,
      .options {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: none;
        flex-wrap: nowrap;
        height: ${EDITOR_BAR_HEIGHT_PX}px;
        min-width: 0;
      }

      .options {
        gap: 8px;
        font-size: 0.85em;
      }

      .control {
        height: ${EDITOR_BAR_HEIGHT_PX - 4}px;
        flex: none;
      }

      .control.icon {
        width: ${EDITOR_BAR_HEIGHT_PX}px;
        padding: 0;
        font-size: 16px;
      }

      .separator {
        width: 1px;
        align-self: stretch;
        margin: 4px 2px;
        background: var(--umbradesktop-app-border, var(--uui-color-border));
      }

      .hint {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .options label {
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      .number {
        width: 5.5em;
        height: ${EDITOR_BAR_HEIGHT_PX - 8}px;
        padding: 0 4px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      .well {
        flex: 1;
        min-height: ${EDITOR_MIN_WELL_HEIGHT_PX}px;
        overflow: hidden;
        display: grid;
      }

      .stage {
        position: relative;
        margin: auto;
        line-height: 0;
        touch-action: none;
      }

      .stage.cropping {
        cursor: crosshair;
      }

      .stage canvas {
        display: block;
      }

      .stage.cropping canvas {
        filter: brightness(0.75);
      }

      .selection {
        position: absolute;
        outline: 2px dashed var(--umbradesktop-app-accent, var(--uui-color-selected));
        box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6);
        background: rgb(255 255 255 / 0.15);
        pointer-events: none;
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
        height: ${EDITOR_BAR_HEIGHT_PX - 8}px;
        padding: 0 2px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      .name {
        flex: 0 1 14em;
        min-width: 6em;
        height: ${EDITOR_BAR_HEIGHT_PX - 10}px;
        padding: 0 6px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      .name:focus-visible,
      .number:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .size {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

export { PhotoEditorElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-photo-editor': PhotoEditorElement;
  }
}
