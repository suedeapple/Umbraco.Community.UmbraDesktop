import { CaptureElement } from './capture.element.js';
import type { CaptureConfig } from './capture.element.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';

/** The webcam, as Windows' Camera app: photos as JPEG, video with the microphone where there is one. */
const CAMERA: CaptureConfig = {
  from: 'camera',
  channel: 'camera',
  photo: { type: 'image/jpeg', extension: 'jpg' },
  terms: {
    photo: ['cameraPhoto', 'Take photo'],
    record: ['cameraRecord', 'Record video'],
    empty: ['cameraEmpty', 'Select Start camera to take a photo or record a video.'],
    photoName: ['cameraPhotoName', 'Photo'],
    videoName: ['cameraVideoName', 'Video'],
    problems: {
      denied: ['cameraDenied', 'The camera was not allowed. Allow it for this site in the browser, then try again.'],
      missing: ['cameraMissing', 'No camera was found.'],
      insecure: ['cameraInsecure', 'The browser only allows the camera when the backoffice is on HTTPS.'],
      unavailable: ['cameraUnavailable', 'The camera could not be started. It may be in use by another program.'],
    },
  },
};

/**
 * Camera, as a self-contained UmbraDesktop app: take a photo or record a video with the webcam, then
 * download it or add it to the media library. Everything but what makes it the camera is
 * {@link CaptureElement}, which Snipping Tool shares.
 *
 * The camera stays off until Start camera, so its light never comes on just because the window was
 * opened, and goes off again for every capture's review.
 */
@customElement('umbradesktop-camera')
export class CameraElement extends CaptureElement {
  /** What makes this the Camera. */
  protected readonly config = CAMERA;
}

export { CameraElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-camera': CameraElement;
  }
}
