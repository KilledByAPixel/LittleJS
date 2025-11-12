
let musicVolume = 1, musicSound, musicInstance;

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
    const center = mainCanvasSize.scale(.5);
    musicPlayer = new UIObject(center, vec2(500, 300));
    const title = new UIText(vec2(0, -100), vec2(500, 40),
        'LittleJS Music Player');
    musicPlayer.addChild(title);

    // drop zone text
    const dropZoneText = new UIText(vec2(0, -60), vec2(450, 20),
        'Drag & Drop Audio Files Here!');
    dropZoneText.textColor = GRAY;
    musicPlayer.addChild(dropZoneText);

    // volume slider
    const volumeSlider = new UIScrollbar(vec2(0, -20), vec2(400, 30),
        musicVolume, 'Music Volume');
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

    // progress bar and scrollbar for seeking
    progressBar = new UIScrollbar(vec2(0, 120), vec2(400, 30), 0);
    progressBar.disabledColor = RED;
    progressBar.onChange = ()=> 
    {
        // control music seek position
        const wasPlaying = musicInstance?.isPlaying();
        if (!musicInstance)
            musicInstance = musicSound.playMusic(musicVolume, 1, 1);
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
            musicPlayer.color = WHITE
            
            // get the dropped file
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('audio'))
                return;
                
            // create new sound from dropped file
            const fileURL = URL.createObjectURL(file);
            musicSound = new Sound(fileURL, musicVolume);
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
        // update loading progress
        const loadingPercent = musicSound.loadedPercent * 100|0;
        progressBar.text = `Loading: ${loadingPercent}%`;
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