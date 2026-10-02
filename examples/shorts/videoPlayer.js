let videoPlayer;

function gameInit()
{
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 20;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(0,0,.1);

    // video player
    const videoSize = vec2(480, 270);
    const filename = 'video.webm';
    const autoplay = true;
    videoPlayer = new UIVideo(vec2(0, -50), videoSize, filename, autoplay);
    videoPlayer.lineWidth = 5;
    videoPlayer.lineColor = WHITE;

    // play/pause button
    const buttonSize = vec2(200, 100);
    const playButton = new UIButton(vec2(-130, 170), buttonSize);
    playButton.onClick = ()=> videoPlayer.isPaused() ?
        videoPlayer.play() : videoPlayer.pause();
    playButton.onUpdate = ()=> playButton.text =
        videoPlayer.isPaused() ? 'Play' : 'Pause';

    // status text
    const statusText = new UIText(vec2(130, 170), vec2(250, 90));
    statusText.textColor = WHITE;
    statusText.onUpdate = ()=> statusText.text = 
        videoPlayer.hasEnded() ? 'Ended' :
        videoPlayer.isPlaying() ? 'Playing' : 'Paused';
}

/* info
A video file playing inside the game, drawn by the UI plugin. The
button pauses and plays it, and the text beside it says whether the
video is playing, paused or has ended.

## How it works
`new UIVideo(pos, size, src, autoplay)` is a UI object that shows a
video. It makes a hidden HTML video element for the file and draws
the element's current picture onto the canvas every frame, stretched
to the object's size. Like every UI object its position and size are
in pixels, measured from the center of the canvas with y going down,
so `vec2(0, -50)` puts it a little above the middle.

The video's size here, 480 by 270, is the size it is drawn at, not
the size of the file. Two more arguments can follow `autoplay`:
whether to loop, and a volume.

With `autoplay` true the video is asked to play as soon as it is
made. A browser may refuse to start a video with sound before the
user has clicked on the page. If it does, the video stays paused and
the button reads Play.

`lineWidth` and `lineColor` are properties every UI object has. They
draw a white outline around the video with a line width of 5.

### The controls
The button's `onClick` reads the state and does the opposite:
`play()` when `isPaused()` is true, `pause()` when it is not.

There is no `gameUpdate` in this example. Every UI object has an
`onUpdate` that the plugin calls each frame, and the button and the
text each use theirs to set their own `text` from the video's state:

- `isPaused()` is true when the video is paused or was never started.
- `hasEnded()` is true when it has played to the end.
- `isPlaying()` is true when it is not paused, has not ended and has
  loaded enough to show a picture.

The text checks `hasEnded()` first, then `isPlaying()`, and anything
else is shown as Paused, which includes the time the file is still
loading.

`UIText` is clear by default, with no background, and its
`textColor` is set to white to show against the dark canvas.

## Try it
- Change `const autoplay = true;` to `false`: the video waits for the
  button.
- Loop it: add `, true` after `autoplay` in the `new UIVideo` call.
- Play at double speed: add `videoPlayer.setPlaybackRate(2);` after
  the line that sets `lineColor`.
- Draw it smaller: change `vec2(480, 270)` to `vec2(320, 180)`.

## See also
Music does the same for an audio file, and UI System shows the other
UI objects. `UIVideo` also has `stop`, `setTime`, `setVolume`,
`getCurrentTime` and `getDuration`.
*/
