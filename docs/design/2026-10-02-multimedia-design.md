# Multimedia: Media Player, CD Player, Picture Viewer, Photo Editor, Sound Recorder, Camera, Snipping Tool, Media Info and Volume Control

The third optional add-on, `Umbraco.Community.UmbraDesktop.Multimedia`: the programs Windows kept
for sound and pictures, as desktop apps over the media library. It follows the Accessories add-on
([`2026-09-24-accessories-design.md`](2026-09-24-accessories-design.md)) wherever that design already
answers the question, and this records only where it does not.

## 1. Why a separate package

For the reasons Accessories gives in its §1: an add-on someone chooses, released from the same tag at
the same version, that changes nothing when it is absent. It is not folded into Accessories because
the two answer different wants. Accessories is the tools you write and look things up with; these
are for looking at and listening to what is in the media library, and someone who wants one need not
want the other. Neither imports anything from the other or from the host, so `styles.ts`,
`press-focus.ts`, `save-location.ts` and the media-adding half of Accessories' `media-save.ts` are
copied rather than shared, each saying so at its top. A shared npm package for four files was judged
more machinery than the duplication costs.

## 2. The `multimedia` group, at 57

The package's own catalogue defines the group, as Accessories and Entertainment define theirs.
At 57 it sorts after Accessories (55) and before Games (60): Windows kept Media Player and Sound
Recorder beside the tools under Accessories > Entertainment, and both before the games.
`docs/developer/package-catalogues.md` §4 lists it with the other two.

## 3. The apps

| App | Size (content) | What it is |
| --- | --- | --- |
| Media Player | 520 × 400, min 360 × 216 | Plays sound and video from the media library |
| Picture Viewer | 560 × 480, min 360 × 178 | Shows a picture and the rest of its folder, with zoom and a slideshow |
| Sound Recorder | 440 × 260, min 340 × 186 | Records from the microphone, to download or add to the media library |
| Volume Control | 492 × 280, min 492 × 186 | The desktop's mixer: the master and one column per app that makes sound |
| CD Player | 380 × 400, min 320 × 214 | Plays a media folder of sound files as a disc, with shuffle and repeat |
| Media Info | 420 × 480, min 300 × 190 | Everything about one media file, EXIF included |
| Photo Editor | 640 × 520, min 500 × 226 | Crops, rotates, flips and resizes a picture, then saves it back or as a copy |
| Camera | 560 × 438, min 420 × 208 | Takes a photo or records a video with the webcam |
| Snipping Tool | 520 × 398, min 420 × 208 | Takes a screenshot, or records a screen, window or tab |

The first three shipped first; the other six were added on the same branch, ranked from a longer
list of candidates by how well each fits the add-on (a Windows multimedia program, useful to an
editor, and working with the media library). In the launcher the players and viewers come first,
then the apps that make something, then Media Info, and Volume Control last, as Windows kept it apart.

Every number is derived in the app's `constants.ts` and measured by `fits.test.ts` under every theme
id, as in Accessories.

## 4. Reading the media library without downloading it

Notepad and Paint fetch a file because they edit its contents. Media Player and Picture Viewer only
show it, so they hand its URL to a `<video>` or `<img>` and let the browser stream it: a two-hour video
starts at once and is never held in memory twice. The URL comes from `UmbMediaUrlRepository`, the
name and folder from `UmbMediaItemRepository`, both public, after Umbraco's own
`UMB_MEDIA_PICKER_MODAL`, so start nodes and permissions are the backoffice's.

**Which files each app takes is decided by extension, after the pick.** The picker lists media items,
not files, and a media type is no guide to whether a browser can play something: sites rename,
remove and add types. `shared/media-kinds.ts` holds the lists. A file that is not the app's kind is
refused by name, and whatever was open stays open.

## 5. Media Player

**One `<video>` plays both sound and video.** A video element plays a sound file exactly as an audio
element does, so there is one media element and one set of handlers. For sound, the screen shows the
file's name over black, since a video element with no picture is a black box.

**The browser's controls are not used.** They look like the browser rather than the theme, and
differ between browsers. The transport is the shared themed controls, and every state shown (playing,
time, volume, muted) is read back from the media element's own events rather than from what was
asked for, so a refused play or a finished file shows as it is.

## 6. Picture Viewer

**Open a picture, and its folder comes with it; or open the folder.** Opening the picture you meant
is how every desktop viewer works, and choosing a folder starts at its first picture. The media
picker lets a folder be chosen whatever its `pickableFilter` says, because Umbraco sets `isFolder` on
no media item, so a pick with no file behind it is recognised as a folder the way Save As recognises
one: a media type with a collection, or children already under it. Media Player refuses a folder.
Either way only pictures are gone through: subfolders and every file that is not a picture are left
out of the set, so a folder of photos and PDFs is a slideshow of the photos. The folder's pictures come from
the media tree (`UmbMediaTreeRepository`) rather than the collection, because the tree is what start
nodes are applied to and its order is the order the Media section shows. Up to 1,000 items are read.

**One zoom, two ways in.** Fitted, the scale is whatever shows the whole picture (never above 1, so a
small logo is not blurred up); zoomed, it is a step the person chose. The picture is always drawn at
natural size times scale, so both are one code path and the status bar can say what fitting came
to. A `ResizeObserver` refits as the window is resized or maximized. The picture is centred with auto
margins in a grid, not `place-items: center`, which pushes a picture wider than the screen off its
left edge where no scroll bar reaches.

**Actual size is written `1:1`.** It was first a magnifier icon, which read as a third zoom button
beside Zoom in and Zoom out.

## 7. Sound Recorder

**The browser asks for the microphone.** Nothing here can, and nothing is recorded until Record is
selected. Every track is stopped and the audio context closed when recording stops or the window
closes mid-recording, which is what turns the browser's recording indicator off.

**Format.** Opus, in the container the browser has: WebM in Chrome and Edge, Ogg in Firefox; Safari
records AAC in MP4. WebM sound is saved as `.weba`, never `.webm`: Umbraco's Audio media type accepts
`weba`, `oga`, `opus` and `mp3`, and files `webm` under Video, where a recording would show as a film
with no picture.

**A recording is work until it is kept**: downloaded, or added to the media library through Save As.
Until then the window carries the unsaved attribute, so closing it asks, and so does recording again.
A recording is only ever added, never saved back over an item, so a kept recording cannot be added
twice. Ten minutes at most: it is held in memory until it is kept.

**The trace is green on black under every theme.** It was the theme's accent first; the Umbraco
theme's navy all but vanished on black.

## 8. The one piece of server code: serving `.weba`

Found by adding a recording to a running site: the media item was created, as Audio, and its file
answered 404. ASP.NET Core's static file middleware refuses any extension it has no content type for,
and it has none for `.weba`, `.opus` or `.flac`, though Umbraco's own Audio type accepts the first
two. So a site takes such a file into its media library and then will not hand it to anyone, the
Media section included. This is a gap in Umbraco rather than in this package, but a recorder whose
recordings cannot be played back is broken, so the package fills it.

`Media/MultimediaComposer.cs` post-configures `StaticFileOptions`: when the site uses ASP.NET Core's
own `FileExtensionContentTypeProvider` (or none, which the middleware treats the same way), the three
extensions are added where missing. A mapping the site made itself is kept, and a provider of
another kind is left alone, since that site has decided what it serves. Tested by
`Umbraco.Community.UmbraDesktop.Multimedia.Tests`, which is why the package has a test project and is
in the CI's list of them.

The alternatives were worse. Saving as `.webm` would file a recording under Video. Encoding WAV
ourselves would make a ten-minute recording 20MB and land it as a File item rather than Audio.

## 9. Volume Control: one mixer for the desktop

`shared/mixer.ts` is one module instance that every app imports: a master and a column per app that
makes sound. An app plays at its column times the master, muted if either is, and listens for
changes, so a fader moved in Volume Control is heard at once in every open window. Media Player's own
slider and Mute *are* its column, rather than a second volume that could disagree with it. A module
instance rather than a context, because everything that reads it is in this bundle, which loads once.

The settings are remembered in `localStorage`, as a computer keeps its volume: a per-person, per-
machine convenience, read and written inside try/catch so a private window still has a mixer for the
session, and shared across tabs through the `storage` event. The faders are range inputs stood
upright with `writing-mode`, so they keep the keyboard and the screen reader.

## 10. CD Player

A folder is the disc, listed by the same `filesIn` that lists Picture Viewer's pictures, so a folder of
sound and liner notes plays the sound. The rules (next after the end of a track, stop after the last
back at track 1, shuffle from the track playing, repeat all and one, Previous a few seconds in
restarts) are pure functions over an immutable playlist (`playlist.ts`), and the element swaps one
playlist for the next. The display is green on black under every theme, as the trace is.

## 11. Media Info

Nothing is downloaded whole: size and type from a `HEAD` (or a one-byte range, whose
`Content-Range` gives the size), dimensions and length from the browser decoding a picture or a
media file's metadata, and EXIF from the first 128 KB of a JPEG. The EXIF reader (`exif.ts`) reads
only the tags shown, bounds-checks everything, and is tested on JPEGs built byte by byte in both byte
orders; a damaged or cut-short file gives what could be read. The place links to OpenStreetMap,
which needs no key, in a new tab, with `data-router-slot="disabled"`.

## 12. Photo Editor

Open and Save are the Accessories package's opener and saver, copied (§1): Save writes back over the
item with the overwrite check, Save As asks for a folder and saves a copy. Sound Recorder's adder is
now the create-only case of the same saver. Every edit returns a new canvas, so undo is the previous
canvas, bounded at 20 steps because a photograph's canvas is megabytes. The picture keeps its own
format where a canvas can write it, and an SVG is refused.

## 13. Camera and Snipping Tool

One element in two configurations (`capture.element.ts`), over a core (`capture/media.ts`) that gets
the stream, grabs a frame, records, and always lets go of the stream. The camera stays off until
Start camera and goes off for every review, so its light is on only while capturing; a screenshot
stops sharing as soon as its frame is taken; and Stop sharing in the browser's own bar ends a screen
recording as Stop does. The camera's preview is mirrored, as every camera app shows a selfie; the
photo is not. A capture is kept exactly as a recording is: Download, or Add to Media through Save As,
unsaved until then. Closing the browser's screen picker is changing one's mind and says nothing.

## 14. What the build taught

- **Chrome refuses `play()` from a scripted click.** `element.click()` carries no user activation, so
  in a test the media element stays paused and the button never says Pause. The playback tests press
  the button with `sendMouse`, the real mouse; the keyboard tests already used `sendKeys` and passed
  first time for the same reason.
- **A media element plays a WAV made in the test.** The player and recorder tests build a WAV of
  silence in memory, so loading, durations, seeking and the end of a file are the browser's own. A
  test runner has no microphone, and CI not even a fake one, so the recorder's microphone is
  injected; the real one was driven in a running backoffice with Chrome's
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- **Chrome's fake microphone is silent here.** It records, but the analyser sees nothing, so the
  trace looked broken when it was not. `--use-file-for-fake-audio-capture=<a .wav>` gives it
  something to say.
- **Under Puppeteer the titlebar's pointer capture does not take.** `setPointerCapture` fails for the
  synthetic mouse, and the host carries on uncaptured, as its comment says, so a scripted drag only
  follows while every move still lands on the titlebar. Moving a window in big steps left it where
  it was, and looked like the window could not be dragged. Drag in steps of a few pixels.
- **The Linux SQLite harness can hang its database when a browser is closed mid-request.** Every later
  login then waits on a lock until the site is restarted. Seen twice, both times right after a script
  closed the browser; leaving the page for `about:blank` and waiting a moment before closing avoided
  it. A harness trap, not a package one, but the symptom (the backoffice stuck on its loading
  spinner) points nowhere near the cause.
- **Check the served file, not just the created item.** The `.weba` gap passed every test and every
  look at the Media section; only fetching the item's URL showed the 404.

Added with the second six:

- **A canvas is a webcam in a test.** `canvas.captureStream()` gives a live video track Chrome treats
  as it treats a camera or a shared screen, so the capture tests run the real `MediaRecorder` and
  frame grab. Calling `track.stop()` does not fire the track's `ended` event (only the browser ending
  it does), so the test of Stop sharing dispatches it.
- **Chrome's fakes go further than expected.** With `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream`, the webcam is a 1280 × 720 test pattern and `getDisplayMedia`
  hands over an 800 × 450 screen with no picker, so Camera and Snipping Tool were both driven in a
  running backoffice.
- **Check icons by looking at them.** `icon-pictures` draws a camera, not pictures, and there is no
  `icon-camera`; the first launcher had Picture Viewer with a camera and Camera with a CCTV camera.
  Camera now has `icon-pictures` and Picture Viewer `icon-photo-album`. `icon-undo` was both Undo and
  Rotate left until Undo took `icon-history`.
- **A scripted drag that lands on the wrong window selects text.** Placing windows for a screenshot,
  the first one dragged to the front covered the others' titlebars, and the next drags selected the
  words in its toolbar. Place the top-most window first. The crop area now also refuses to start a
  text selection, which a real drag past the picture's edge would have done too.
- **The harness hangs its database after a script dies mid-request,** not only after a clean close,
  and every later login then shows "Your session has timed out". Leave the page in a `catch` as well
  as at the end, and restart the site when the login page appears.
- **Under the Windows 98 theme the Start menu is a cascade**, and an app low in it can be off-screen
  for a script; open the windows under the Umbraco theme's launcher, then switch theme for the shot.
