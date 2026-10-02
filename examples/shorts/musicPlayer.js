let musicVolume = .8, musicSound, musicInstance;
let musicPlayer, playButton, stopButton, progressBar;

function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 20;
    uiSystem.defaultGradientColor = WHITE;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.9,.3,.2);

    // setup music player UI
    musicPlayer = new UIObject(vec2(), vec2(500, 300));
    const title = new UIText(vec2(0, -100), vec2(500, 40),
        'LittleJS Music Player');
    musicPlayer.addChild(title);

    // drop zone text
    const dropZoneText = new UIText(vec2(0, -60), vec2(450, 20),
        'Drag & Drop Audio Files Here!');
    dropZoneText.textColor = GRAY;
    musicPlayer.addChild(dropZoneText);

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

    // progress bar and slider for seeking
    progressBar = new UISlider(vec2(0, 120), vec2(400, 30), 0);
    progressBar.disabledColor = RED;
    progressBar.onChange = ()=> 
    {
        // control music seek position
        const wasPlaying = musicInstance?.isPlaying();
        if (!musicInstance)
            musicInstance = musicSound.playMusic(musicVolume, true, true);
        progressBar.value = min(progressBar.value, .999); // prevent wrap
        const seekTime = progressBar.value * musicSound.getDuration();
        musicInstance.start(seekTime);
        if (!wasPlaying)
            musicInstance.pause();
    };
    musicPlayer.addChild(progressBar);

    {
        // setup drag and drop for audio files
        function onDragEnter() { musicPlayer.color = RED; };
        function onDragLeave() { musicPlayer.color = WHITE; };
        function onDrop(e)
        {
            musicPlayer.color = WHITE;

            // get the dropped file
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('audio'))
                return;
                
            // create new sound from dropped file
            const fileURL = URL.createObjectURL(file);
            musicSound = new Sound(fileURL);
            dropZoneText.text = file.name;
            
            // reset UI
            musicInstance?.stop();
            musicInstance = undefined;
            progressBar.value = 0;
        }
        uiSystem.setupDragAndDrop(onDrop, onDragEnter, onDragLeave);
    }
}

function gameUpdate()
{
    // disable buttons while loading
    const isDisabled = !musicSound || !musicSound.isLoaded();
    playButton.disabled  = isDisabled
    stopButton.disabled  = isDisabled
    progressBar.disabled = isDisabled

    // update ui
    if (!musicSound)
    {
        // waiting for file
        progressBar.text = 'No File Loaded';
    }
    else if (isDisabled)
    {
        progressBar.text = 'Loading...';
    }
    else
    {
        // update ui text
        const isPlaying = musicInstance?.isPlaying();
        playButton.text = isPlaying ? 'Pause' : 'Play';
        const current = musicInstance?.getCurrentTime() || 0;
        const duration = musicSound.getDuration();
        progressBar.text = formatTime(current) +
            ' / ' + formatTime(duration);
        if (!progressBar.isActiveObject())
            progressBar.value = current / duration;
    }
}

/* info
A music player for your own files. Drag an audio file from your
computer onto the example and it loads. Play and Stop control it, the
slider above them is the volume, and the bar at the bottom shows the
place in the track and can be dragged to seek.

## How it works
This builds on the Music example, which explains `Sound`,
`SoundInstance` and the UI objects. Three things are new here.

### Nothing loaded yet
`musicSound` starts as `undefined`, since there is no file until one
is dropped. `gameUpdate` treats that the same as a file still
loading: it sets `disabled` on the buttons and the bar, and a
disabled UI object does not take clicks. That is why `onClick` can
use `musicSound` without checking that it exists. The bar's text says
which of the two cases it is.

### Drag and drop
`uiSystem.setupDragAndDrop(onDrop, onDragEnter, onDragLeave)` listens
for files dragged over the page and stops the browser doing what it
normally would with one, which is to open it. The three functions are
called when a file is dropped, when a drag comes onto the window and
when it leaves. Enter and leave only change the panel's color, to
show the page is ready to take the file.

`onDrop` is given the browser's drag event. The dropped files are in
`e.dataTransfer.files`, and each has a `type` such as `audio/mpeg`,
which is checked so a picture or a document is ignored.

`URL.createObjectURL(file)` makes a temporary address for the file's
contents. `new Sound` takes a filename or a URL, so it loads the
dropped file as it would load one from the server. The old instance
is stopped and forgotten, since it belongs to the old sound.

### Seeking
The progress bar is a `UISlider`, so it has a `value` from 0 to 1 and
calls `onChange` when the user moves it.

- `value * getDuration()` turns the bar's position into seconds.
- `musicInstance.start(seconds)` starts the playback again from that
  place in the track.
- If the music was not playing before, it is paused again at once, so
  dragging the bar while paused moves the place and stays silent.
- If Play has never been pressed there is no instance to seek, so one
  is made with `playMusic(volume, true, true)`: looping, and the last
  argument starts it paused.
- The value is kept below 1 with `min(progressBar.value, .999)`. On a
  looping track the very end is the same place as the start, so a
  drag to the end would jump back to 0.

In the other direction, `gameUpdate` sets the bar's `value` from
`getCurrentTime() / getDuration()` every frame. It skips that while
`isActiveObject()` is true, which is while the user is holding the
bar, or the two would fight over it.

`disabledColor` is the color a UI object is drawn in while disabled,
so the bar is red until a file is ready.

## Try it
- Start with a track loaded: change `musicSound, musicInstance;` in
  the first line to
  `musicSound = new Sound('song.mp3'), musicInstance;`
- Show progress as a filling bar: add `progressBar.fillMode = true;`
  after the line that sets `disabledColor`.
- Change the color of the panel while a file is over it: in
  `onDragEnter`, change `RED` to `hsl(.3,1,.5)`.
- Drop a file that is not audio, and see that nothing changes.

## See also
Music is the simpler player this grew from. Sound Effects and Audio
Effects cover generated sounds and effects, and 3D Mesh takes dropped
model files.
*/
