function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([1,0,220]);
    uiSystem.defaultSoundClick = new Sound([1,0,440]);
    uiSystem.defaultCornerRadius = 8;

    // example button that returns to menu
    const buttonBack = new UIButton(mainCanvasSize.scale(.5), vec2(200), 'Back\nto\nMenu');
    buttonBack.textHeight = 60;
    buttonBack.onClick = ()=> uiMenu.visible = true;

    // setup example menu
    const uiMenu = new UIObject(mainCanvasSize.scale(.5), vec2(600,450));
    canvasClearColor = hsl(0,0,.8);

    // example text
    uiMenu.addChild(new UIText(vec2(-80,-120), vec2(500, 80), 'LittleJS UI\nSystem Demo'));

    // example image
    uiMenu.addChild(new UITile(vec2(200,-140), vec2(128), tile(3, 128)));

    // example button
    const button1 = new UIButton(vec2(80,0), vec2(140, 80), 'Test');
    button1.textHeight = 60;
    uiMenu.addChild(button1);
    button1.onClick = ()=> canvasClearColor = randColor();

    // example checkbox
    const checkbox = new UICheckbox(vec2(-80,0), vec2(50));
    checkbox.onChange = ()=> button1.disabled = checkbox.checked;
    uiMenu.addChild(checkbox);

    // example scrollbar
    const scrollbar = new UIScrollbar(vec2(0,90), vec2(300, 50), soundVolume, 'Volume');
    uiMenu.addChild(scrollbar);
    scrollbar.onChange = ()=> setSoundVolume(scrollbar.value);

    // exit button
    const button2 = new UIButton(vec2(0,170), vec2(300, 50), 'Exit Menu');
    button2.textHeight = 40;
    uiMenu.addChild(button2);
    button2.onClick = ()=> uiMenu.visible = false;
}