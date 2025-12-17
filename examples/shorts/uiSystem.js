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
    const uiMenu = new UIObject(mainCanvasSize.scale(.5), vec2(700,450));
    canvasClearColor = hsl(0,0,.8);

    // example text
    uiMenu.addChild(new UIText(vec2(-100,-120), vec2(450, 80),
        'LittleJS UI\nSystem Demo'));

    // example image
    uiMenu.addChild(new UITile(vec2(230,-140), vec2(170), tile(3, 128)));

    // example checkbox
    const checkbox = new UICheckbox(vec2(-170,0), vec2(50));
    checkbox.navigationIndex = ++navigationIndex;
    checkbox.onChange = ()=> button1.disabled = checkbox.checked;
    uiMenu.addChild(checkbox);

    // example button
    const textInput = new UITextInput(vec2(50,0), vec2(300, 80), 'Text Input');
    textInput.textHeight = 60;
    textInput.maxLength = 16;
    textInput.navigationIndex = ++navigationIndex;
    uiMenu.addChild(textInput);
    textInput.onChange = ()=> canvasClearColor = randColor();

    // example scrollbar
    const scrollbar = new UIScrollbar(vec2(0,90), vec2(400, 50), 
        soundVolume, 'Volume');
    scrollbar.navigationIndex = ++navigationIndex;
    uiMenu.addChild(scrollbar);
    scrollbar.onChange = ()=> setSoundVolume(scrollbar.value);

    // exit button
    const button1 = new UIButton(vec2(0,170), vec2(200, 50), 'Exit Menu');
    button1.textHeight = 40;
    button1.navigationIndex = ++navigationIndex;
    button1.navigationAutoSelect = true;
    uiMenu.addChild(button1);
    button1.onClick = ()=> uiSystem.showConfirmDialog('Exit menu?',
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