import { problemOf } from '../sound-recorder/microphone.js';
import type { MicrophoneProblem } from '../sound-recorder/microphone.js';

/**
 * The capture core Camera and Snipping Tool share: getting a stream from the webcam or the screen,
 * grabbing a still from it, recording it, and letting go of it.
 *
 * Letting go is the part that matters most. A stream that keeps a track open keeps the webcam's
 * light on, or the browser's "sharing your screen" bar up, with no window left to turn it off, so
 * every way out of a capture ends in {@link stopStream}.
 */

/** Why a capture could not start: the microphone's reasons, and closing the screen picker. */
export type CaptureProblem = MicrophoneProblem | 'cancelled';

/** Thrown by a {@link StreamSource} that could not start, saying why. */
export class CaptureError extends Error {
  /**
   * @param problem Why.
   */
  constructor(readonly problem: CaptureProblem) {
    super(problem);
  }
}

/**
 * Where a stream comes from: the webcam or the screen. An interface over one function, so an element
 * can be handed a stream of a canvas in a test, where there is no camera and no screen to share.
 * @returns The stream.
 * @throws {CaptureError} When it cannot start.
 */
export type StreamSource = () => Promise<MediaStream>;

/**
 * Which problem a refused capture is.
 *
 * The one difference from the microphone's reading (`microphone.ts`) is the screen: the browser
 * reports closing its screen picker as `NotAllowedError`, the same as refusing permission, and for a
 * screen that is someone changing their mind, not a refusal to explain.
 * @param error What the browser rejected with.
 * @param from Which source it came from.
 * @returns The problem.
 */
export function captureProblemOf(error: unknown, from: 'camera' | 'screen'): CaptureProblem {
  if (error instanceof CaptureError) return error.problem;
  const problem = problemOf(error);
  return from === 'screen' && problem === 'denied' ? 'cancelled' : problem;
}

/**
 * The webcam, with the microphone if there is one: a camera with no microphone still takes photos
 * and silent video, so a missing microphone is asked again without it rather than failing.
 * @returns The stream.
 */
export const cameraStream: StreamSource = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new CaptureError('insecure');
  const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch (error) {
    if ((error as { name?: string }).name !== 'NotFoundError') throw new CaptureError(captureProblemOf(error, 'camera'));
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video });
  } catch (error) {
    throw new CaptureError(captureProblemOf(error, 'camera'));
  }
};

/**
 * The screen, a window or a tab, as the person chooses in the browser's own picker, with its sound
 * where the browser offers it. The picker is the browser's, and the only way in: nothing here can
 * see the screen without the person choosing what to share each time.
 * @returns The stream.
 */
export const screenStream: StreamSource = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new CaptureError('insecure');
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (error) {
    throw new CaptureError(captureProblemOf(error, 'screen'));
  }
};

/**
 * Let go of a stream: stop every track, which turns the webcam's light off and takes down the
 * browser's screen-sharing bar.
 * @param stream The stream.
 */
export function stopStream(stream: MediaStream | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * One still frame of a stream, at the stream's own size, by playing it in a video element nobody
 * sees and drawing the first frame that arrives.
 * @param stream The stream.
 * @returns The frame.
 */
export async function grabFrame(stream: MediaStream): Promise<HTMLCanvasElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new CaptureError('unavailable'));
  });
  await video.play().catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0);
  video.pause();
  video.srcObject = null;
  return canvas;
}

/** A format to record video in, and the extension it saves with. */
export interface VideoFormat {
  /** The type to ask `MediaRecorder` for, or empty for the browser's default. */
  mimeType: string;
  /** The extension, without the dot. */
  extension: string;
}

/**
 * The format to record video in: VP9, then VP8, in WebM, which Umbraco's Video media type accepts,
 * and MP4 where that is all there is (Safari).
 * @param isSupported `MediaRecorder.isTypeSupported`, or a test's stand-in.
 * @returns The format.
 */
export function videoFormat(isSupported: (mimeType: string) => boolean): VideoFormat {
  const formats: VideoFormat[] = [
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ];
  return formats.find((format) => isSupported(format.mimeType)) ?? { mimeType: '', extension: 'webm' };
}

/** A finished video recording. */
export interface VideoRecording {
  /** The video. */
  blob: Blob;
  /** The extension it saves with. */
  extension: string;
}

/** A video recording in progress. */
export interface VideoRecorder {
  /**
   * Finish the recording. The stream is left running, for a camera that goes on previewing.
   * @returns The recording.
   */
  stop(): Promise<VideoRecording>;
  /** Settles with the recording however it finished: by {@link stop}, or by the stream ending. */
  ended: Promise<VideoRecording>;
  /** Throw the recording away. */
  cancel(): void;
}

/**
 * Record a stream to video. Its data is handed over every second, so a recording stopped by the
 * window closing has lost at most that much. When the stream's video ends by itself, as a screen
 * share does when the person selects Stop sharing in the browser's bar, the recording finishes as if
 * Stop had been pressed.
 * @param stream The stream.
 * @returns The recorder.
 */
export function startVideoRecording(stream: MediaStream): VideoRecorder {
  const format = videoFormat((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, format.mimeType ? { mimeType: format.mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  const ended = new Promise<VideoRecording>((resolve) => {
    recorder.addEventListener(
      'stop',
      () => {
        const type = (recorder.mimeType || format.mimeType || 'video/webm').split(';')[0];
        resolve({ blob: new Blob(chunks, { type }), extension: type === 'video/mp4' ? 'mp4' : 'webm' });
      },
      { once: true },
    );
  });
  const finish = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  stream.getVideoTracks()[0]?.addEventListener('ended', finish, { once: true });
  recorder.start(1000);
  return {
    stop: () => {
      finish();
      return ended;
    },
    ended,
    cancel: finish,
  };
}
