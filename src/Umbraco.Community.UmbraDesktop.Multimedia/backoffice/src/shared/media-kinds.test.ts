import { expect } from '@open-wc/testing';
import { extensionOf, filesIn, kindOf, picturesIn } from './media-kinds.js';

/**
 * Which media files each app opens, decided from the file alone, since the media picker cannot be
 * told: a media item's type says Image or File, not whether a browser can play it.
 */

it('reads an extension from a URL, ignoring a query string and the case', () => {
  expect(extensionOf('/media/abc/Song.MP3?v=2')).to.equal('mp3');
  expect(extensionOf('/media/abc/photo.jpeg#top')).to.equal('jpeg');
  expect(extensionOf('/media/abc/README')).to.equal('');
});

/** The formats a current browser plays or shows, and what Umbraco's own Audio and Video types accept. */
it('tells sound, video and pictures apart', () => {
  for (const extension of ['mp3', 'wav', 'oga', 'ogg', 'opus', 'weba', 'm4a', 'aac', 'flac']) {
    expect(kindOf(extension), extension).to.equal('audio');
  }
  for (const extension of ['mp4', 'webm', 'ogv', 'm4v', 'mov']) {
    expect(kindOf(extension), extension).to.equal('video');
  }
  for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico']) {
    expect(kindOf(extension), extension).to.equal('image');
  }
});

it('claims nothing it cannot play or show', () => {
  for (const extension of ['pdf', 'docx', 'txt', 'tiff', 'psd', '']) expect(kindOf(extension), extension).to.equal(undefined);
});

/**
 * A folder's pictures, in the folder's own order, which is the order the Media section shows. A
 * subfolder, a document, an item in the recycle bin and an item with no file are all left out, as
 * a slideshow that stopped on a PDF or a folder would be no slideshow.
 */
it('lists the pictures in a folder, in its order, and nothing else', () => {
  const items = [
    { unique: 'a', name: 'Beach', isTrashed: false, hasChildren: false },
    { unique: 'f', name: 'Holidays', isTrashed: false, hasChildren: true },
    { unique: 'b', name: 'Brochure', isTrashed: false, hasChildren: false },
    { unique: 'c', name: 'Old', isTrashed: true, hasChildren: false },
    { unique: 'd', name: 'Logo', isTrashed: false, hasChildren: false },
    { unique: 'e', name: 'Empty', isTrashed: false, hasChildren: false },
  ];
  const urls = [
    { unique: 'd', url: '/media/d/logo.svg' },
    { unique: 'a', url: '/media/a/beach.jpg?rnd=1' },
    { unique: 'b', url: '/media/b/brochure.pdf' },
    { unique: 'c', url: '/media/c/old.png' },
    { unique: 'f', url: undefined },
    { unique: 'e' },
  ];
  expect(picturesIn(items, urls)).to.deep.equal([
    { unique: 'a', name: 'Beach', url: '/media/a/beach.jpg?rnd=1', extension: 'jpg' },
    { unique: 'd', name: 'Logo', url: '/media/d/logo.svg', extension: 'svg' },
  ]);
});

/** CD Player's disc is the same listing for sound: a folder's sound files, in its order, nothing else. */
it('lists the sound files in a folder, in its order, and nothing else', () => {
  const items = [
    { unique: 'a', name: 'Intro', isTrashed: false, hasChildren: false },
    { unique: 'b', name: 'Cover', isTrashed: false, hasChildren: false },
    { unique: 'c', name: 'Outro', isTrashed: false, hasChildren: false },
    { unique: 'd', name: 'Trailer', isTrashed: false, hasChildren: false },
  ];
  const urls = [
    { unique: 'a', url: '/media/a/intro.mp3' },
    { unique: 'b', url: '/media/b/cover.jpg' },
    { unique: 'c', url: '/media/c/outro.weba' },
    { unique: 'd', url: '/media/d/trailer.mp4' },
  ];
  expect(filesIn(items, urls, 'audio').map((file) => file.name)).to.deep.equal(['Intro', 'Outro']);
});
