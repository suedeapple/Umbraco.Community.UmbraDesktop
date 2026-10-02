import { expect } from '@open-wc/testing';
import { History, crop, flip, normaliseRect, resize, rotate, sizeKeepingAspect } from './transform.js';

/**
 * Photo Editor's operations, on real canvases: each is checked by where a marked pixel lands, which
 * is the only way to tell a rotation right from a rotation left.
 */

/**
 * A white canvas with one red pixel.
 * @param w Its width.
 * @param h Its height.
 * @param x The red pixel's column.
 * @param y Its row.
 * @returns The canvas.
 */
function marked(w: number, h: number, x = 0, y = 0): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, w, h);
  context.fillStyle = '#f00';
  context.fillRect(x, y, 1, 1);
  return canvas;
}

/** Where the red pixel is. */
function red(canvas: HTMLCanvasElement): [number, number] | undefined {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200 && data[i + 1] < 60) return [(i / 4) % canvas.width, Math.floor(i / 4 / canvas.width)];
  }
  return undefined;
}

it('rotates a quarter turn right and left, swapping width and height', () => {
  const right = rotate(marked(3, 2), 1);
  expect([right.width, right.height]).to.deep.equal([2, 3]);
  expect(red(right), 'the top-left corner goes to the top right').to.deep.equal([1, 0]);
  const left = rotate(marked(3, 2), -1);
  expect([left.width, left.height]).to.deep.equal([2, 3]);
  expect(red(left), 'the top-left corner goes to the bottom left').to.deep.equal([0, 2]);
});

it('flips across and down', () => {
  expect(red(flip(marked(3, 2), 'horizontal'))).to.deep.equal([2, 0]);
  expect(red(flip(marked(3, 2), 'vertical'))).to.deep.equal([0, 1]);
});

it('crops to a rectangle', () => {
  const cropped = crop(marked(10, 10, 6, 7), { x: 4, y: 5, w: 3, h: 4 });
  expect([cropped.width, cropped.height]).to.deep.equal([3, 4]);
  expect(red(cropped)).to.deep.equal([2, 2]);
});

it('resizes to a new size', () => {
  const resized = resize(marked(40, 20), { w: 10, h: 5 });
  expect([resized.width, resized.height]).to.deep.equal([10, 5]);
});

/** A crop drawn from any corner to any other, even off the picture, is the rectangle between them, inside it. */
it('turns a drag into a rectangle inside the picture', () => {
  expect(normaliseRect({ x: 50, y: 40 }, { x: 10, y: 5 }, { w: 100, h: 100 })).to.deep.equal({ x: 10, y: 5, w: 40, h: 35 });
  expect(normaliseRect({ x: -20, y: 90 }, { x: 30.6, y: 140 }, { w: 100, h: 100 })).to.deep.equal({ x: 0, y: 90, w: 31, h: 10 });
});

/** Resize keeps the picture's shape unless told otherwise: change one side and the other follows. */
it('works out the other side from one, keeping the shape', () => {
  expect(sizeKeepingAspect({ w: 1600, h: 1000 }, { w: 800 })).to.deep.equal({ w: 800, h: 500 });
  expect(sizeKeepingAspect({ w: 1600, h: 1000 }, { h: 250 })).to.deep.equal({ w: 400, h: 250 });
  expect(sizeKeepingAspect({ w: 3, h: 1000 }, { h: 10 }), 'never down to nothing').to.deep.equal({ w: 1, h: 10 });
});

/** Undo goes back one edit at a time, and remembers only so many: a photo is megabytes per step. */
it('undoes edits in turn, keeping only the last few', () => {
  const history = new History(2);
  const [a, b, c] = [marked(1, 1), marked(2, 2), marked(3, 3)];
  expect(history.canUndo).to.equal(false);
  history.push(a);
  history.push(b);
  history.push(c);
  expect(history.undo()).to.equal(c);
  expect(history.undo()).to.equal(b);
  expect(history.undo(), 'the oldest was let go of').to.equal(undefined);
  history.push(a);
  history.clear();
  expect(history.canUndo).to.equal(false);
});
