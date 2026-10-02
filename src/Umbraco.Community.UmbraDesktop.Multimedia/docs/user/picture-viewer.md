---
id: picture-viewer
title: Picture Viewer
description: Look through the pictures in a media folder, one by one or as a slideshow, and zoom in on them.
sidebar_position: 4
---

# Picture Viewer

Picture Viewer shows the pictures in the media library: JPEG, PNG, GIF, WebP, AVIF, SVG, BMP and ICO.
It works through a folder at a time, in the order the Media section lists it, and skips everything in
the folder that is not a picture, such as documents, videos and subfolders.

To open pictures, select **Open…** and, in Umbraco's media picker, choose either:

- a picture, to start at that picture, with the rest of its folder to move through
- a folder, to start at the first picture in it. Select the tick in the folder's corner, since
  selecting the folder itself opens it in the picker

The status bar shows the picture's name, where it is among the folder's pictures, and how far it is
zoomed. A folder with no pictures in it says so.

- To move through the folder, select **Previous picture** or **Next picture**, or press the Left or
  Right arrow. After the last picture comes the first again.
- To show the folder as a slideshow, select **Slideshow**. Each picture shows for three seconds.
  Select **Slideshow** again to stop.
- To zoom, select **Zoom in** or **Zoom out**, press + or -, or hold Ctrl and turn the mouse wheel. A
  picture larger than the window scrolls.
- To see the picture at its own size, select **Actual size** (1:1), or press 1. To fit it into the
  window again, select **Fit to window**, or press 0.

Each picture opens fitted to the window, and a small one is shown at its own size rather than blown
up. Picture Viewer only shows pictures. To change one, use Paint from the
[Accessories](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) add-on.
