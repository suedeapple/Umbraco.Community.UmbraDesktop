/**
 * Picture Viewer's zoom, as numbers: a scale of 1 is the picture's own pixels, one to one.
 *
 * Pure functions, so the rule for where a zoom lands can be tested without laying anything out.
 */

/** A width and a height, in px. */
export interface Size {
  /** Width. */
  w: number;
  /** Height. */
  h: number;
}

/**
 * The scales Zoom in and Zoom out step through, smallest first: the ones Windows' photo viewers and
 * every browser offer, so a scale reads as a number people have seen before.
 */
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

/**
 * The scale that shows the whole picture in the screen, never above 1: a picture smaller than the
 * screen is shown at its own size, since blowing up a small logo only blurs it. A picture that
 * reports no size, as an SVG without width and height does, is shown at 1 and fitted by the layout.
 * @param picture The picture's own size.
 * @param screen The space it is shown in.
 * @returns The scale.
 */
export function fitScale(picture: Size, screen: Size): number {
  if (picture.w <= 0 || picture.h <= 0) return 1;
  return Math.min(1, screen.w / picture.w, screen.h / picture.h);
}

/**
 * The next step up from a scale. A fitted picture is usually between two steps, and goes to the one
 * above, so one press always makes it bigger.
 * @param scale The scale now.
 * @returns The next step up, or the largest.
 */
export function zoomIn(scale: number): number {
  return ZOOM_STEPS.find((step) => step > scale + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

/**
 * The next step down from a scale, the mirror of {@link zoomIn}.
 * @param scale The scale now.
 * @returns The next step down, or the smallest.
 */
export function zoomOut(scale: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - 1e-6) ?? ZOOM_STEPS[0];
}
