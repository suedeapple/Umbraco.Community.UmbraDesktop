/**
 * English (en) strings for the `umbraDesktopMultimedia` area.
 *
 * This package's own dictionary: the Multimedia group's heading, which this package's catalogue
 * manifest defines, each app's name, which its manifest points at through `meta.label`, and
 * everything the apps themselves say.
 *
 * The elements pass each key to `localize.termOrDefault` with the same English as its fallback, so a
 * backoffice where this dictionary failed to load renders words rather than raw tokens. The
 * duplication is deliberate: the dictionary wins when it is there, and these are the strings the
 * Dutch file translates.
 */
export default {
  umbraDesktopMultimedia: {
    // The launcher group this package's catalogue manifest defines (bundle.manifests.ts).
    groupMultimedia: 'Multimedia',
    // The window titles, taskbar labels and launcher tile text, all from meta.label.
    mediaplayer: 'Media Player',
    pictureviewer: 'Picture Viewer',
    soundrecorder: 'Sound Recorder',
    volumecontrol: 'Volume Control',
    cdplayer: 'CD Player',
    mediainfo: 'Media Info',
    photoeditor: 'Photo Editor',
    camera: 'Camera',
    snippingtool: 'Snipping Tool',
    // Shared by the apps that open a file.
    open: 'Open…',
    openTitle: 'Open from the media library (Ctrl+O)',
    openFailed: '%0% could not be opened.',
    // Media Player, and the transport words Sound Recorder shares with it.
    playerPlay: 'Play',
    playerPause: 'Pause',
    playerStop: 'Stop',
    playerMute: 'Mute',
    playerVolume: 'Volume',
    playerSeek: 'Position',
    playerFullScreen: 'Full screen',
    playerEmpty: 'Select Open… to play a sound or video from the media library.',
    playerNotMedia: 'Media Player plays sound and video, and %0% is neither.',
    playerCannotPlay: '%0% cannot be played in this browser.',
    // Picture Viewer.
    viewerPrevious: 'Previous picture',
    viewerNext: 'Next picture',
    viewerSlideshow: 'Slideshow',
    viewerZoomIn: 'Zoom in',
    viewerZoomOut: 'Zoom out',
    viewerActualSize: 'Actual size',
    viewerFit: 'Fit to window',
    viewerPosition: '%0% of %1%',
    viewerEmpty: 'Select Open… to look at the pictures in a media folder.',
    viewerNotPicture: 'Picture Viewer shows pictures, and %0% is not one.',
    viewerCannotShow: '%0% could not be shown.',
    viewerNoPictures: '%0% has no pictures in it.',
    // Sound Recorder.
    recorderRecord: 'Record',
    recorderLive: 'Recording',
    recorderRecording: 'Recording',
    recorderName: 'Name',
    recorderDownload: 'Download',
    recorderAdd: 'Add to Media',
    recorderAdded: 'Added to the media library.',
    recorderNotAdded: 'Not added. %0%',
    recorderLimit: 'Recording stopped at the %0% limit.',
    recorderDenied: 'The microphone was not allowed. Allow it for this site in the browser, then select Record again.',
    recorderMissing: 'No microphone was found.',
    recorderInsecure: 'The browser only allows recording when the backoffice is on HTTPS.',
    recorderUnavailable: 'The microphone could not be started. It may be in use by another program.',
    // Volume Control.
    volumeMaster: 'Volume',
    volumeMute: 'Mute',
    // CD Player.
    cdEmpty: 'Select Open… to play a media folder of sound files, or one track and the rest of its folder.',
    cdNotSound: 'CD Player plays sound files, and %0% is not one.',
    cdNoSound: '%0% has no sound files in it.',
    cdPrevious: 'Previous track',
    cdNext: 'Next track',
    cdShuffle: 'Shuffle',
    cdRepeatOff: 'Repeat: off',
    cdRepeatAll: 'Repeat: all',
    cdRepeatOne: 'Repeat: one',
    cdTracks: 'Tracks',
    // Media Info.
    infoEmpty: 'Select Open… to see everything about a file in the media library.',
    infoFolder: '%0% is a folder. Media Info describes one file at a time.',
    infoCopy: 'Copy',
    infoCopied: 'Copied.',
    infoGroupFile: 'File',
    infoGroupPicture: 'Picture',
    infoGroupMedia: 'Sound and video',
    infoGroupCamera: 'Camera',
    infoGroupPlace: 'Place',
    infoName: 'Name',
    infoFileName: 'File name',
    infoMediaType: 'Media type',
    infoFormat: 'Format',
    infoSize: 'Size',
    infoCreated: 'Created',
    infoUpdated: 'Changed',
    infoLocation: 'Location',
    infoDimensions: 'Dimensions',
    infoPixels: '%0% × %1% pixels',
    infoFocalPoint: 'Focal point',
    infoFocalPointValue: '%0%% across, %1%% down',
    infoLength: 'Length',
    infoCamera: 'Camera',
    infoTaken: 'Taken',
    infoExposure: 'Exposure',
    infoAperture: 'Aperture',
    infoIso: 'ISO',
    infoFocalLength: 'Focal length',
    infoCoordinates: 'Coordinates',
    infoMap: 'Show on a map',
  },
};
