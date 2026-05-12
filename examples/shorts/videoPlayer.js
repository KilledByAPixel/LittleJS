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