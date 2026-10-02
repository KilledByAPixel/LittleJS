const musicSound = new Sound('song.mp3');
let musicVolume = .8, musicInstance;
let musicPlayer, infoText, playButton, stopButton;

function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 20;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.9,.3,.2);

    // setup music player UI
    musicPlayer = new UIObject(vec2(), vec2(500, 220));

    // information text
    infoText = new UIText(vec2(0, -70), vec2(400, 50));
    musicPlayer.addChild(infoText);

    // volume slider
    const volumeSlider = new UISlider(vec2(0, -20), vec2(400, 30), 
        musicVolume, 'Music Volume');
    volumeSlider.fillMode = true;
    musicPlayer.addChild(volumeSlider);
    volumeSlider.onChange = ()=> 
    {
        musicVolume = volumeSlider.value;
        musicInstance?.setVolume(musicVolume);
    };

    // play button
    playButton = new UIButton(vec2(-90, 50), vec2(140, 50), 'Play');
    musicPlayer.addChild(playButton);
    playButton.onClick = ()=>
    {
        if (!musicSound.isLoaded())
            return;
        
        // handle play/pause toggle
        if (!musicInstance)
            musicInstance = musicSound.playMusic(musicVolume);
        else if (musicInstance.isPaused())
            musicInstance.resume();
        else
            musicInstance.pause();
    };

    // stop button
    stopButton = new UIButton(vec2(90, 50), vec2(140, 50), 'Stop');
    stopButton.onClick = ()=>  musicInstance?.stop();
    musicPlayer.addChild(stopButton);
}

function gameUpdate()
{
    // disable buttons while loading
    const isDisabled = !musicSound.isLoaded();
    playButton.disabled = stopButton.disabled = isDisabled;

    // update ui
    if (isDisabled)
    {
        infoText.text = 'Loading...';
    }
    else
    {
        // update ui text
        const isPlaying = musicInstance?.isPlaying();
        playButton.text = isPlaying ? 'Pause' : 'Play';
        const current = formatTime(musicInstance?.getCurrentTime() || 0);
        const duration = formatTime(musicSound.getDuration());
        infoText.text = current + ' / ' + duration;
    }
}

/* info
A music track loaded from a file, with a small player made from the UI
plugin. Play starts the music and then turns into Pause, Stop puts it
back to the start, and the slider sets the volume. The text shows how
far into the track it is and how long the track is.

## How it works
### A sound and its instances
`new Sound('song.mp3')` with a filename loads and decodes an audio
file. A `Sound` is the audio itself and can be played any number of
times. Each play returns a `SoundInstance`, which is that one
playback, and the instance is what can be paused, stopped or changed
while it plays.

`musicSound.playMusic(volume)` plays the sound as music: it loops, and
it has no position in the world and no random pitch. The instance it
returns is kept in `musicInstance`, which is `undefined` until Play is
first pressed. That is why the other calls are written
`musicInstance?.`, which does nothing while there is no instance.

- `pause()` stops the playback and remembers the place, and
  `resume()` starts it again from there.
- `stop()` stops it and puts the place back to the start.
- `isPlaying()` is true while it sounds. `isPaused()` is the
  opposite, so it is true after a stop as well as after a pause. The
  Play button relies on that: after Stop, `resume()` starts the track
  from the beginning.
- `setVolume(volume)` changes the volume of this one instance.
- `getCurrentTime()` is the place in the track in seconds, and
  `musicSound.getDuration()` is the length of the whole track.

### The player
`new UISystemPlugin` starts the UI plugin. The settings on `uiSystem`
are the defaults for every UI object made after them: a sound when
one is pressed, another when it is clicked, rounded corners and a
shadow.

UI positions and sizes are in pixels. `musicPlayer` is a plain
`UIObject`, a 500 by 220 panel in the center of the canvas, and the
other objects are added to it with `addChild`. A child's position is
measured from the center of its parent, with y going down, so the
text at y `-70` is near the top of the panel and the buttons at `50`
are near the bottom.

- `new UIText(pos, size)` shows text, fitted to its size.
- `new UISlider(pos, size, value, text)` holds a `value` from 0 to 1
  and calls `onChange` whenever it changes. `fillMode` draws it filled
  up to the value, like a progress bar, in place of a handle.
- `new UIButton(pos, size, text)` calls `onClick` when clicked.

### gameUpdate
This runs 60 times a second and brings the UI in line with the music.
`isLoaded()` is false until the file has been loaded and decoded, and
until then the buttons are `disabled`. After that the Play button's
text follows `isPlaying()`, and `formatTime` turns each number of
seconds into text like `1:05`.

## Try it
- Play the track once and not on a loop: change
  `playMusic(musicVolume)` to `playMusic(musicVolume, false)`.
- Fade out over two seconds: change `musicInstance?.stop()` to
  `musicInstance?.stop(2)`.
- Start quieter: change `musicVolume = .8` to `musicVolume = .2`.
- Change the frequency of the click sound, `440`, to `880`.

## See also
Music Player adds seeking and playing a file dropped onto the page.
Sound Effects makes sounds with no file at all, and UI System shows
the rest of the UI plugin.
*/
