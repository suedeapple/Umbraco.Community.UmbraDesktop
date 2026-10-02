---
id: photo-editor
title: Photo Editor
description: Crop, rotate, flip and resize a picture from the media library, then save it back or as a copy.
sidebar_position: 5
---

# Photo Editor

Photo Editor makes the changes a picture most often needs before it goes on a page: crop, rotate,
flip and resize. It edits JPEG, PNG, WebP, GIF and BMP pictures from the media library. An SVG is a
drawing rather than pixels, so Photo Editor does not open it.

To open a picture, select **Open…** and choose it in Umbraco's media picker. Its size in pixels shows
in the status bar.

- To turn it, select **Rotate left** or **Rotate right**. To mirror it, select **Flip horizontal** or
  **Flip vertical**.
- To crop, select **Crop**, drag across the picture to choose what to keep, then select **Crop to
  selection** or press Enter. Press Esc to stop without cropping.
- To resize, select **Resize**, type a **Width** or a **Height**, and select **Resize**. With **Keep
  shape** selected, the other side follows.
- To take back an edit, select **Undo**, or press Ctrl+Z. The last 20 edits can be undone.

## Save

- To save over the picture in the media library, select **Save**, or press Ctrl+S. If someone changed
  it in the Media section after you opened it, Photo Editor asks before overwriting their version.
- To save a copy and leave the original as it was, change the name in the status bar if you want
  to, select **Save As…**, choose a folder, and select **Choose**.

A picture is saved in its own format where it can be, so a JPEG stays a JPEG. A GIF or BMP is saved as
PNG, which loses nothing.

Unsaved edits are protected the way an unsaved page is: the window shows the unsaved dot, and closing
it, or opening another picture, asks first.
