// globals objects
const sound_ui = new Sound([1,0]);
let uiMenu;

function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([1,0,220]);
    uiSystem.defaultSoundClick = new Sound([1,0,440]);
    uiSystem.defaultCornerRadius = 8;

    // setup example menu
    const uiMenu = new UIObject(mainCanvasSize.scale(.5), vec2(450));
    canvasClearColor = hsl(0,0,.8);

    // example text
    const textTitle = new UIText(vec2(0,-120), vec2(400, 60), 'LittleJS UI\nSystem Demo');
    uiMenu.addChild(textTitle);

    // example button
    const button1 = new UIButton(vec2(70,0), vec2(140, 80), 'Test');
    button1.textHeight = 60;
    uiMenu.addChild(button1);
    button1.onClick = ()=> uiBackground.color = randColor();

    // example checkbox
    const checkbox = new UICheckbox(vec2(-70,0), vec2(50));
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