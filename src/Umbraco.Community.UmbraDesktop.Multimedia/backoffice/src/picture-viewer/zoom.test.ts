import { expect } from '@open-wc/testing';
import { ZOOM_STEPS, fitScale, zoomIn, zoomOut } from './zoom.js';

/** Picture Viewer's zoom: fitting a picture to the window, and the steps either side of it. */

/**
 * A picture is fitted whole into the screen, and never blown up past its own size to do it: a
 * small logo shown at 400% is blurry, which is why every viewer opens it at 100%.
 */
it('fits a large picture into the screen, and leaves a small one at its own size', () => {
  expect(fitScale({ w: 4000, h: 3000 }, { w: 400, h: 400 })).to.equal(0.1);
  expect(fitScale({ w: 1000, h: 2000 }, { w: 500, h: 500 })).to.equal(0.25);
  expect(fitScale({ w: 100, h: 50 }, { w: 500, h: 500 })).to.equal(1);
});

/** An SVG without a size of its own reports none; it is shown fitted, not at zero. */
it('fits a picture that does not know its size', () => {
  expect(fitScale({ w: 0, h: 0 }, { w: 500, h: 400 })).to.equal(1);
});

it('zooms in and out through the steps, from wherever it is', () => {
  expect(zoomIn(1)).to.equal(1.5);
  expect(zoomOut(1)).to.equal(0.75);
  // A fitted picture sits between steps; the next step either side is where it goes.
  expect(zoomIn(0.4)).to.equal(0.5);
  expect(zoomOut(0.4)).to.equal(0.33);
});

it('stops at either end', () => {
  const [smallest] = ZOOM_STEPS;
  const largest = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  expect(zoomOut(smallest)).to.equal(smallest);
  expect(zoomIn(largest)).to.equal(largest);
});
