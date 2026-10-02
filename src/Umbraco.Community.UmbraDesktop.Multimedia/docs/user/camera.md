---
id: camera
title: Camera
description: Take a photo or record a video with the webcam, then download it or add it to the media library.
sidebar_position: 7
---

# Camera

Camera takes photos and records video with your webcam. The camera stays off until you start it, and
goes off again as soon as you take a photo or stop recording.

1. Select **Start camera**. The first time, the browser asks whether the site may use the camera, and
   the microphone for video. Allow it. The preview appears, mirrored as in any camera app.
2. To take a photo, select **Take photo**. To record a video, select **Record video**, then **Stop**
   when you are done. A video can be up to ten minutes long, and stops by itself at that point.
3. Change the name if you want to, then keep it:
   - To save it on your computer, select **Download**.
   - To add it to the media library, select **Add to Media**, choose a folder, and select **Choose**.

Photos are saved as JPEG and videos as WebM, which Umbraco files as Image and Video. To play a video
back first, select **Play**. It plays through the Camera column in
[Volume Control](volume-control.md).

To take another, select **Back to camera**. To turn the camera off without taking anything, select
**Turn off camera**. Closing the window turns it off too.

Until a photo or video is downloaded or added to the media library, the window shows the unsaved dot,
and closing it, or selecting **Back to camera**, asks first. Nothing leaves your browser until you
select **Add to Media**.

## When the camera does not start

The message in the window says which of these it is:

- The camera was not allowed. Allow it for the site in the browser's address bar, then try again.
- No camera was found.
- The backoffice is not on HTTPS. Browsers only allow the camera on a secure address, or on
  `localhost`.
- The camera is in use by another program. Close that program and try again.
