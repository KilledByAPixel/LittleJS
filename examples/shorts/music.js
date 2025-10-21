const musicSound = new SoundWave('song.mp3');
let musicVolume = 1, musicInstance;

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
    const center = mainCanvasSize.scale(.5);
    musicPlayer = new UIObject(center, vec2(500, 220));

    // infomation text
    infoText = new UIText(vec2(0, -70), vec2(400, 50));
    musicPlayer.addChild(infoText);

    // volume slider
    const volumeSlider = new UIScrollbar(vec2(0, -20), vec2(400, 30), 
        musicVolume, 'Music Volume');
    musicPlayer.addChild(volumeSlider);
    volumeSlider.onChange = () => 
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
        // update loading progress
        const loadingPercent = musicSound.loadedPercent * 100|0;
        infoText.text = `Loading: ${loadingPercent}%`;
    }
    else
    {
        // update ui text
        const isPlaying = musicInstance?.isPlaying();
        playButton.text = isPlaying ? 'Pause' : 'Play';
        const current = formatTime(musicInstance?.getCurrentTime());
        const duration = formatTime(musicSound.getDuration());
        infoText.text = current + ' / ' + duration;
    }
}