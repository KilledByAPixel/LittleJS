// globals objects
const sound_ui = new Sound([1,0]);
let uiMenu;

function gameInit()
{
    // load ui system plugin
    new UISystemPlugin;

    // setup example menu
    uiMenu = new UIObject(mainCanvasSize.scale(.5));
    const uiBackground = new UIObject(vec2(), vec2(400));
    uiMenu.addChild(uiBackground);

    // example text
    const textTitle = new UIText(vec2(0,-100), vec2(400, 60), 'LittleJS UI\nSystem Demo');
    uiMenu.addChild(textTitle);

    // example button
    const button1 = new UIButton(vec2(70,40), vec2(100), 'Test');
    button1.textHeight = 40;
    uiMenu.addChild(button1);
    button1.onPress = ()=> sound_ui.play();

    // example checkbox
    const checkbox = new UICheckbox(vec2(-70,40), vec2(50));
    uiMenu.addChild(checkbox);
    checkbox.onChange = ()=> sound_ui.play(0,1,checkbox.checked?4:1);

    // exit button
    const button2 = new UIButton(vec2(0,140), vec2(300, 50), 'Exit Menu');
    button2.textHeight = 40;
    uiMenu.addChild(button2);
    button2.onPress = ()=>
    {
        uiMenu.visible = false;
        sound_ui.play(0,1,2);
    }
}