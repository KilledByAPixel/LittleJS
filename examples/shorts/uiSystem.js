function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 8;
    uiSystem.defaultShadowColor = BLACK;

    // setup example menu
    let navigationIndex = 0;
    const uiMenu = new UIObject(mainCanvasSize.scale(.5), vec2(600,450));
    canvasClearColor = hsl(0,0,.8);

    // example text
    uiMenu.addChild(new UIText(vec2(-80,-120), vec2(400, 80),
        'LittleJS UI\nSystem Demo'));

    // example image
    uiMenu.addChild(new UITile(vec2(200,-140), vec2(128), tile(3, 128)));

    // example checkbox
    const checkbox = new UICheckbox(vec2(-80,0), vec2(50));
    checkbox.navigationIndex = ++navigationIndex;
    checkbox.onChange = ()=> button1.disabled = checkbox.checked;
    uiMenu.addChild(checkbox);

    // example button
    const button1 = new UIButton(vec2(80,0), vec2(140, 80), 'Test');
    button1.textHeight = 60;
    button1.navigationIndex = ++navigationIndex;
    uiMenu.addChild(button1);
    button1.onClick = ()=> canvasClearColor = randColor();

    const button5 = new UIButton(vec2(220,0), vec2(80), '?');
    button5.textHeight = 60;
    button5.navigationIndex = ++navigationIndex;
    uiMenu.addChild(button5);
    button5.onClick = ()=>
{
    // Check if Web Share API is available
    if (!navigator.share)
    {
        console.log('Share API not supported');
        return;
    }
    
    navigator.share({
        title: 'LittleJS',
        text: 'Check out this awesome game engine!',
        url: 'https://github.com/KilledByAPixel/LittleJS'
    })
    .then(()=> console.log('Shared successfully'))
    .catch((error)=> 
    {
        // Don't log error if user cancelled
        if (error.name !== 'AbortError')
            console.error('Share failed:', error);
    });
}

    // example scrollbar
    const scrollbar = new UIScrollbar(vec2(0,90), vec2(300, 50), 
        soundVolume, 'Volume');
    scrollbar.navigationIndex = ++navigationIndex;
    uiMenu.addChild(scrollbar);
    scrollbar.onChange = ()=> setSoundVolume(scrollbar.value);

    // exit button
    const button2 = new UIButton(vec2(0,170), vec2(300, 50), 'Exit Menu');
    button2.textHeight = 40;
    button2.navigationIndex = ++navigationIndex;
    button2.navigationAutoSelect = true;
    uiMenu.addChild(button2);
    button2.onClick = ()=> uiSystem.showConfirmDialog('Exit menu?',
        ()=> { uiMenu.visible=false; buttonBack.visible=true; });

    // example button that returns to menu
    const buttonBack = new UIButton(mainCanvasSize.scale(.5), vec2(200),
        'Back\nto\nMenu');
    buttonBack.visible = false;
    buttonBack.textHeight = 60;
    buttonBack.navigationIndex = ++navigationIndex;
    buttonBack.navigationAutoSelect = true;
    buttonBack.onClick = ()=> 
        { uiMenu.visible=true; buttonBack.visible=false; }
}