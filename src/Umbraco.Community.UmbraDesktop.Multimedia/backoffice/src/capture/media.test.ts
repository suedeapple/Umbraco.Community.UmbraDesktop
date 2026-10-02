import { expect } from '@open-wc/testing';
import { CaptureError, captureProblemOf, grabFrame, startVideoRecording, stopStream, videoFormat } from './media.js';

/**
 * The capture core Camera and Snipping Tool share, against a real stream: a canvas animating, which
 * Chrome turns into a video track just as it does a webcam or a shared screen.
 */

/**
 * A live video stream of a coloured canvas, ticking over so frames keep coming.
 * @param w Its width.
 * @param h Its height.
 * @returns The stream.
 */
function canvasStream(w = 64, h = 48): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  let hue = 0;
  const draw = () => {
    context.fillStyle = `hsl(${hue++ % 360}, 70%, 50%)`;
    context.fillRect(0, 0, w, h);
    if (stream.getVideoTracks()[0]?.readyState === 'live') requestAnimationFrame(draw);
  };
  const stream = canvas.captureStream(30);
  draw();
  return stream;
}

it('grabs one frame of a stream, at the stream’s own size', async () => {
  const stream = canvasStream(64, 48);
  const frame = await grabFrame(stream);
  expect([frame.width, frame.height]).to.deep.equal([64, 48]);
  stopStream(stream);
});

it('stops every track of a stream, which turns the camera light and the sharing bar off', () => {
  const stream = canvasStream();
  stopStream(stream);
  expect(stream.getTracks().every((track) => track.readyState === 'ended')).to.equal(true);
});

/** VP9 or VP8 in WebM where the browser has them, which Umbraco's Video type accepts; MP4 in Safari. */
it('records video in the best format the browser has', () => {
  expect(videoFormat((type) => type.startsWith('video/webm'))).to.deep.equal({ mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' });
  expect(videoFormat((type) => type === 'video/mp4')).to.deep.equal({ mimeType: 'video/mp4', extension: 'mp4' });
  expect(videoFormat(() => false)).to.deep.equal({ mimeType: '', extension: 'webm' });
});

it('records a stream to a video file', async () => {
  const stream = canvasStream();
  const recording = startVideoRecording(stream);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const { blob, extension } = await recording.stop();
  expect(blob.size).to.be.greaterThan(0);
  expect(blob.type).to.match(/^video\//);
  expect(extension).to.equal('webm');
  stopStream(stream);
});

/** The person ending a screen share from the browser's own bar ends the recording, as Stop would. */
it('finishes a recording by itself when the stream ends', async () => {
  const stream = canvasStream();
  const recording = startVideoRecording(stream);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const ended = recording.ended;
  stopStream(stream);
  stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));
  const { blob } = await ended;
  expect(blob.size).to.be.greaterThan(0);
});

/** Each way a capture can fail is told apart, since each is said differently and fixed differently. */
it('tells the ways a capture can fail apart', () => {
  expect(captureProblemOf(new DOMException('', 'NotAllowedError'), 'camera')).to.equal('denied');
  expect(captureProblemOf(new DOMException('', 'NotAllowedError'), 'screen'), 'closing the screen picker is cancelling').to.equal('cancelled');
  expect(captureProblemOf(new DOMException('', 'NotFoundError'), 'camera')).to.equal('missing');
  expect(captureProblemOf(new DOMException('', 'NotReadableError'), 'camera')).to.equal('unavailable');
  expect(captureProblemOf(new CaptureError('insecure'), 'camera')).to.equal('insecure');
});
