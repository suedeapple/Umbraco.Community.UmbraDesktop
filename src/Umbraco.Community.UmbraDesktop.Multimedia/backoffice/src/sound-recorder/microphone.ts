import { extensionFor, recordingFormat } from './format.js';

/** Why the microphone could not be used, each of which the app says differently. */
export type MicrophoneProblem =
  /** The page is not on HTTPS (or localhost), where browsers do not offer a microphone at all. */
  | 'insecure'
  /** The person, or the browser's settings, said no. */
  | 'denied'
  /** There is no microphone. */
  | 'missing'
  /** Anything else: the device is in use elsewhere, or the browser cannot record. */
  | 'unavailable';

/** Thrown by a {@link Microphone} that could not start, saying why. */
export class MicrophoneError extends Error {
  /**
   * @param problem Why.
   */
  constructor(readonly problem: MicrophoneProblem) {
    super(problem);
  }
}

/** A finished recording. */
export interface Recording {
  /** The sound. */
  blob: Blob;
  /** The extension it saves with, matching the type the browser recorded in. */
  extension: string;
}

/** A recording in progress. */
export interface MicrophoneSession {
  /**
   * Copy the sound's latest waveform into `into`, as `AnalyserNode.getByteTimeDomainData` does:
   * 128 is silence, 0 and 255 the loudest either way. For the live trace while recording.
   * @param into Where to copy it.
   */
  wave(into: Uint8Array): void;
  /**
   * Finish, and let go of the microphone.
   * @returns The recording.
   */
  stop(): Promise<Recording>;
  /** Throw the recording away and let go of the microphone: the window closed mid-recording. */
  cancel(): void;
}

/**
 * Ask for the microphone and start recording.
 *
 * An interface over one function, so the element can be handed a fake in a test: a test runner has
 * no microphone, and in CI not even a fake one.
 * @returns The session.
 * @throws {MicrophoneError} When recording cannot start.
 */
export type Microphone = () => Promise<MicrophoneSession>;

/**
 * Which problem a `getUserMedia` refusal is, by the error's name.
 * @param error What `getUserMedia` rejected with.
 * @returns The problem.
 */
export function problemOf(error: unknown): MicrophoneProblem {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'unavailable';
}

/**
 * The real microphone: `getUserMedia` for the sound, `MediaRecorder` to record it, and an
 * `AnalyserNode` beside the recorder for the live trace.
 *
 * The browser asks the person the first time, in its own words, and remembers their answer for the
 * site; nothing here can ask for them. Every track is stopped and the audio context closed when the
 * recording stops or is cancelled, which is what turns the browser's recording indicator off: a tab
 * that keeps a track open shows a red dot until it is closed.
 *
 * The recorder hands its data over every quarter second rather than once at the end, so a recording
 * ended by the window closing has lost at most that much, and memory grows in step rather than in
 * one copy at the end.
 * @returns The session.
 */
export const openMicrophone: Microphone = async () => {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new MicrophoneError('insecure');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new MicrophoneError(problemOf(error));
  }

  const format = recordingFormat((type) => MediaRecorder.isTypeSupported(type));
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, format.mimeType ? { mimeType: format.mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    throw new MicrophoneError('unavailable');
  }
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  const context = new AudioContext();
  // An audio context made without a recent press starts suspended and hands the analyser silence,
  // which would draw a flat trace over a recording that is working. Record is a press, but
  // getUserMedia's prompt can outlast its activation, so the context is asked to run either way.
  void context.resume().catch(() => undefined);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);

  /** Let go of the microphone and the audio context. */
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => undefined);
  };

  recorder.start(250);
  return {
    wave: (into) => analyser.getByteTimeDomainData(into as Uint8Array<ArrayBuffer>),
    stop: () =>
      new Promise<Recording>((resolve) => {
        recorder.addEventListener(
          'stop',
          () => {
            const type = recorder.mimeType || format.mimeType;
            release();
            resolve({ blob: new Blob(chunks, { type }), extension: extensionFor(type) });
          },
          { once: true },
        );
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
};
