---
id: multimedia
title: Multimedia
description: Install the Multimedia add-on and find Media Player, Picture Viewer and Sound Recorder in the launcher.
sidebar_position: 1
image: ../screenshots/multimedia-desktop.png
---

# Multimedia

UmbraDesktop Multimedia puts the programs Windows kept for sound and pictures on the desktop, each in a
window of its own and themed along with the rest of it. All three work with the files in your media
library.

## Install

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Multimedia
```

That is the whole installation. UmbraDesktop comes with it as a dependency, so it is installed too if
it is not there yet. There is no section to grant and no dashboard to enable: the programs appear in a
**Multimedia** group in the launcher for anyone who can already reach the desktop. Without the
package, the group is not there at all.

Prerequisites:

- Umbraco 17
- .NET 10
- UmbraDesktop 17.x, the same release or later, installed automatically

The package also lets the site serve three sound formats that Umbraco accepts into the media library
but ASP.NET Core does not serve on its own: `.weba`, `.opus` and `.flac`. Without that, a recording
added to the media library could not be played back from it. A format your site already serves is
left as it is.

## The programs

To open a program, open the launcher and select it in the **Multimedia** group.

| Program | What it does |
| --- | --- |
| [Media Player](media-player.md) | Plays sound and video from the media library |
| [Picture Viewer](picture-viewer.md) | Shows the pictures in a media folder, one by one or as a slideshow |
| [Sound Recorder](sound-recorder.md) | Records a clip with the microphone, to download or add to the media library |

Each program shows only what you can see in the Media section yourself: the media picker it opens is
Umbraco's own, with your start nodes and permissions.

## Versions

The add-on is released from the same tag as UmbraDesktop and always carries the same version number.
It needs UmbraDesktop of the same release or any later 17.x, because it uses things only that release
of the desktop provides, and installing or updating it brings UmbraDesktop up to that release if
needed. Updating UmbraDesktop on its own is always fine.
