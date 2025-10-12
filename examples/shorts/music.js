let musicPlayer, playButton, stopButton, infoText;
let musicSound = new SoundWave('song.mp3');
let musicVolume = 1;
let music;

function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 20;
    canvasClearColor = hsl(.9,.3,.2); // background color

    // setup music player UI
    musicPlayer = new UIObject(mainCanvasSize.scale(.5), vec2(500, 220));

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
        if (music) 
            music.setVolume(musicVolume);
    };

    // play button
    playButton = new UIButton(vec2(-90, 50), vec2(140, 50), 'Play');
    musicPlayer.addChild(playButton);
    playButton.onClick = ()=>
    {
        if (!musicSound.isLoaded())
            return;
        
        // handle play/pause toggle
        if (!music)
            music = musicSound.playMusic(musicVolume);
        else if (music.isPaused())
            music.resume();
        else
            music.pause();
    };

    // stop button
    stopButton = new UIButton(vec2(90, 50), vec2(140, 50), 'Stop');
    stopButton.onClick = ()=>  music && music.stop();
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
        const isPlaying = music && music.isPlaying();
        playButton.text = isPlaying ? 'Pause' : 'Play';
        const current = music ? music.getCurrentTime() : 0;
        const duration = musicSound.getDuration();
        infoText.text = formatTime(current) +' / '+ formatTime(duration);
    }
}