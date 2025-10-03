// Music player variables
let musicSound = new SoundWave('song.mp3');
let musicVolume = 1;
let musicInstance;

// UI elements
let playButton, stopButton, progressBar;

function gameInit()
{
    // load ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 20;

    // setup music player UI
    const musicPlayer = new UIObject(mainCanvasSize.scale(.5), vec2(500, 300));

    // title
    const title = new UIText(vec2(0, -100), vec2(500, 40), 'LittleJS Music Player');
    musicPlayer.addChild(title);

    // volume slider
    const volumeSlider = new UIScrollbar(vec2(0, -40), vec2(400, 30), musicVolume, 'Music Volume');
    musicPlayer.addChild(volumeSlider);
    volumeSlider.onChange = () => 
    {
        musicVolume = volumeSlider.value;
        if (musicInstance) 
            musicInstance.setVolume(musicVolume);
    };

    // play button
    playButton = new UIButton(vec2(-90, 30), vec2(140, 50), 'Play');
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
    stopButton = new UIButton(vec2(90, 30), vec2(140, 50), 'Stop');
    musicPlayer.addChild(stopButton);
    stopButton.onClick = ()=>
    {
        if (!musicInstance)
            return;

        // stop sound
        musicInstance.stop();
    };

    // progress bar and scrollbar for seeking
    progressBar = new UIScrollbar(vec2(0, 100), vec2(400, 30), 0, 'Progress');
    musicPlayer.addChild(progressBar);
    progressBar.onChange = ()=> 
    {
        // control music seek position
        const wasPlaying = musicInstance && musicInstance.isPlaying();
        if (!musicInstance)
            musicInstance = musicSound.playMusic(musicVolume, true, true);
        progressBar.value = min(progressBar.value, .999); // prevent looping around
        const seekTime = progressBar.value * musicSound.getDuration();
        musicInstance.start(seekTime);
        if (!wasPlaying)
            musicInstance.pause();
    };
}

function gameUpdate()
{
    // disable buttons while loading or waiting for interaction
    const isDisabled = !musicSound.isLoaded() || !audioIsRunning();
    playButton.disabled  = isDisabled
    stopButton.disabled  = isDisabled
    progressBar.disabled = isDisabled

    // update ui
    if (!musicSound.isLoaded())
    {
        // update loading progress
        const loadingPercent = musicSound.loadedPercent * 100;
        progressBar.text = `Loading: ${(loadingPercent).toFixed(2)}%`;
    }
    else
    {
        // update ui text
        playButton.text = !musicInstance || !musicInstance.isPlaying() ? 'Play' : 'Pause';
        const currentTime = musicInstance ? musicInstance.getCurrentTime() : 0;
        const duration = musicSound.getDuration();
        if (!progressBar.mouseIsHeld)
            progressBar.value = currentTime / duration;
        const timeText = `${formatTime(currentTime)} / ${formatTime(duration)}`;
        progressBar.text = audioIsRunning() ? timeText : 'Click to Enable Audio';
    }
}