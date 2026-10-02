/**
 * Photo Editor's operations: each takes a canvas and returns a new one, leaving the old one as it
 * was, which is what lets undo keep the previous canvas rather than work out how to reverse an edit.
 *
 * Pure in that sense, and drawn with the browser's own canvas, so a rotation is the browser's exact
 * quarter turn and a resize its high-quality resampling.
 */

/** A width and a height, in px. */
export interface Size {
  /** Width. */
  w: number;
  /** Height. */
  h: number;
}

/** A point, in the picture's own pixels. */
export interface Point {
  /** From the left. */
  x: number;
  /** From the top. */
  y: number;
}

/** A rectangle, in the picture's own pixels. */
export interface Rect extends Point, Size {}

/**
 * A new canvas of a size, with its 2D context.
 * @param size Its size.
 * @returns The canvas and context.
 */
function blank(size: Size): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  return { canvas, context: canvas.getContext('2d')! };
}

/**
 * Turn the picture a quarter turn.
 * @param source The picture.
 * @param turns 1 for clockwise (right), -1 for anticlockwise (left).
 * @returns The turned picture, its width and height swapped.
 */
export function rotate(source: HTMLCanvasElement, turns: 1 | -1): HTMLCanvasElement {
  const { canvas, context } = blank({ w: source.height, h: source.width });
  context.translate(turns === 1 ? source.height : 0, turns === 1 ? 0 : source.width);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Mirror the picture.
 * @param source The picture.
 * @param axis `horizontal` swaps left and right; `vertical` swaps top and bottom.
 * @returns The mirrored picture.
 */
export function flip(source: HTMLCanvasElement, axis: 'horizontal' | 'vertical'): HTMLCanvasElement {
  const { canvas, context } = blank({ w: source.width, h: source.height });
  if (axis === 'horizontal') {
    context.translate(source.width, 0);
    context.scale(-1, 1);
  } else {
    context.translate(0, source.height);
    context.scale(1, -1);
  }
  context.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Keep only a rectangle of the picture.
 * @param source The picture.
 * @param rect The part to keep, inside the picture.
 * @returns The cropped picture.
 */
export function crop(source: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const { canvas, context } = blank(rect);
  context.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return canvas;
}

/**
 * Scale the picture to a new size, with the browser's best resampling.
 * @param source The picture.
 * @param size The new size.
 * @returns The resized picture.
 */
export function resize(source: HTMLCanvasElement, size: Size): HTMLCanvasElement {
  const { canvas, context } = blank(size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size.w, size.h);
  return canvas;
}

/**
 * The rectangle a crop drag describes: between its two corners whichever way it was drawn, kept
 * inside the picture, and in whole pixels.
 * @param a Where the drag started.
 * @param b Where it is now.
 * @param bounds The picture's size.
 * @returns The rectangle.
 */
export function normaliseRect(a: Point, b: Point, bounds: Size): Rect {
  const clampX = (x: number) => Math.min(Math.max(x, 0), bounds.w);
  const clampY = (y: number) => Math.min(Math.max(y, 0), bounds.h);
  const left = Math.round(Math.min(clampX(a.x), clampX(b.x)));
  const right = Math.round(Math.max(clampX(a.x), clampX(b.x)));
  const top = Math.round(Math.min(clampY(a.y), clampY(b.y)));
  const bottom = Math.round(Math.max(clampY(a.y), clampY(b.y)));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * A new size from one changed side, keeping the picture's shape, never below a pixel.
 * @param original The picture's size now.
 * @param change The side that was changed.
 * @returns The new size.
 */
export function sizeKeepingAspect(original: Size, change: { w?: number; h?: number }): Size {
  if (change.w !== undefined) return { w: change.w, h: Math.max(1, Math.round((change.w * original.h) / original.w)) };
  const h = change.h ?? original.h;
  return { w: Math.max(1, Math.round((h * original.w) / original.h)), h };
}

/**
 * Undo, as the canvases before each edit.
 *
 * Bounded, because a photograph's canvas is megabytes, and twenty edits on a 24-megapixel photo held
 * whole would be gigabytes of memory in a browser tab. The oldest step is let go of first.
 */
export class History {
  /** The canvases before each edit, oldest first. */
  #steps: HTMLCanvasElement[] = [];

  /**
   * @param limit How many steps are kept.
   */
  constructor(private readonly limit: number) {}

  /** Whether there is anything to undo. */
  get canUndo(): boolean {
    return this.#steps.length > 0;
  }

  /**
   * Remember the picture as it was before an edit.
   * @param canvas The picture before the edit.
   */
  push(canvas: HTMLCanvasElement): void {
    this.#steps.push(canvas);
    if (this.#steps.length > this.limit) this.#steps.shift();
  }

  /**
   * Take back the last edit.
   * @returns The picture as it was before it, or undefined when there is nothing to undo.
   */
  undo(): HTMLCanvasElement | undefined {
    return this.#steps.pop();
  }

  /** Forget every step, for a picture opened fresh. */
  clear(): void {
    this.#steps = [];
  }
}
