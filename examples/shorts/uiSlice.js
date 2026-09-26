// a UI styled with tile art: every widget draws a TileSlice in place of
// its rectangle, tinted by the color for its state
function gameInit()
{
    new UISystemPlugin;
    uiSystem.defaultColor = WHITE; // show the art as it is
    uiSystem.defaultButtonColor = hsl(.55,.4,.85);
    uiSystem.defaultHoverColor = hsl(.15,.8,.8);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);

    // the default style: a nine-slice from the 3x3 block of tiles at tile 16,
    // its border 16 pixels, a whole multiple of the tile size stays crisp
    uiSystem.defaultSlice = new TileSlice(tile(16), 9, 16);

    // slider handles: 1 slice draws the whole tile stretched
    uiSystem.defaultHandleSlice = new TileSlice(tile(2), 1);
    canvasClearColor = hsl(.6,.2,.3);

    const menu = new UIObject(vec2(), vec2(600, 440));
    menu.addChild(new UIText(vec2(0,-170), vec2(400, 50), 'Tile Slice UI'));

    // a button with the default nine-slice
    const nine = new UIButton(vec2(-140,-90), vec2(220, 70), 'Nine');
    nine.onClick = ()=> canvasClearColor = randColor();
    menu.addChild(nine);

    // a button with its own style, a three-slice from tiles 19 to 21
    const three = new UIButton(vec2(140,-90), vec2(220, 70), 'Three');
    three.slice = new TileSlice(tile(19), 3, 16);
    menu.addChild(three);

    // no slice draws the plain rectangle, as without a style
    const plain = new UIButton(vec2(-140,0), vec2(220, 70), 'Plain');
    plain.slice = undefined;
    menu.addChild(plain);

    // a checkbox that turns the other buttons off
    const checkbox = new UICheckbox(vec2(80,0), vec2(60), false, 'Off');
    checkbox.onChange = ()=> nine.disabled = three.disabled =
        plain.disabled = checkbox.checked;
    menu.addChild(checkbox);

    // a slider, its bar in the default style, its handle the stretched tile
    const slider = new UISlider(vec2(0,100), vec2(460, 50), soundVolume,
        'Volume');
    slider.onChange = ()=> setSoundVolume(slider.value);
    menu.addChild(slider);
}
