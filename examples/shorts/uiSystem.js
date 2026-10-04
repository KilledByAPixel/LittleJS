function gameInit()
{
    // each tile in tiles.png has a 1 pixel border, which stops bleeding
    setTileDefaultPadding(1);

    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 8;
    uiSystem.defaultShadowColor = BLACK;

    // setup example menu
    let navigationIndex = 0;
    const uiMenu = new UIObject(vec2(), vec2(700,450));
    canvasClearColor = hsl(0,0,.8);

    // example text
    uiMenu.addChild(new UIText(vec2(-100,-120), vec2(450, 160),
        'LittleJS UI\nSystem Demo'));

    // example image
    uiMenu.addChild(new UITile(vec2(230,-140), vec2(170), tile(3, 128)));

    // example checkbox
    const checkbox = new UICheckbox(vec2(-170,0), vec2(50));
    checkbox.navigationIndex = ++navigationIndex;
    checkbox.onChange = ()=> button1.disabled = checkbox.checked;
    uiMenu.addChild(checkbox);

    // example text input
    const textInput = new UITextInput(vec2(50,0), vec2(300, 80), 'Text Input');
    textInput.textHeight = 60;
    textInput.maxLength = 16;
    textInput.navigationIndex = ++navigationIndex;
    uiMenu.addChild(textInput);
    textInput.onChange = ()=> canvasClearColor = randColor();

    // example slider
    const slider = new UISlider(vec2(0,90), vec2(400, 50), 
        soundVolume, 'Volume');
    slider.navigationIndex = ++navigationIndex;
    uiMenu.addChild(slider);
    slider.onChange = ()=> setSoundVolume(slider.value);

    // exit button
    const button1 = new UIButton(vec2(0,170), vec2(200, 50), 'Exit Menu');
    button1.textHeight = 40;
    button1.navigationIndex = ++navigationIndex;
    button1.navigationAutoSelect = true;
    uiMenu.addChild(button1);
    button1.onClick = ()=> uiSystem.showConfirmDialog('Exit menu?',
        ()=> { uiMenu.visible=false; buttonBack.visible=true; });

    // example button that returns to menu
    const buttonBack = new UIButton(vec2(), vec2(200),
        'Back\nto\nMenu');
    buttonBack.visible = false;
    buttonBack.textHeight = 60;
    buttonBack.navigationIndex = ++navigationIndex;
    buttonBack.navigationAutoSelect = true;
    buttonBack.onClick = ()=>
        { uiMenu.visible=true; buttonBack.visible=false; }
}

/* info
A menu made with the UI system plugin: text, an image, a checkbox, a
text field, a slider and a button, drawn by the engine on the canvas.

Use the mouse, or the up and down arrow keys to move the selection and
Space or Enter to press it. The checkbox turns the Exit button off, the
slider sets the sound volume, and the text field changes the background
color when you finish typing with Enter. Exit Menu asks first, then
leaves one button that brings the menu back.

## How it works
Everything is set up once in `gameInit`. The plugin then updates and
draws the objects itself, so there is no `gameUpdate` or `gameRender`.

### The plugin and its defaults
`new UISystemPlugin` starts the system and makes the global `uiSystem`.
Its `default...` values are the style every UI object takes when it is
made, so they are set first: a sound for a press and one for a click, 8
pixel rounded corners, and a black shadow. The shadow color is clear by
default, which is no shadow.

`new Sound([.5,0,220])` is a ZzFX sound: volume .5, no randomness, and
a frequency of 220 Hz. The click is the same at 440.

### The menu and its children
UI positions and sizes are in pixels, with y going down.

`new UIObject(pos, size)` is the base class, and draws as a rectangle.
`uiMenu` is the panel, 700 by 450. An object with no parent is placed
from the middle of the canvas, so `vec2()` centers it.

`uiMenu.addChild(object)` puts an object in the panel. A child's
position is from its parent's middle, so `vec2(-100,-120)` is left of
center and above it. Hiding a parent hides its children too.

- `UIText(pos, size, text)` fits its text into its box. The `\n` makes
  two lines.
- `UITile(pos, size, tileInfo)` draws a tile. Each tile of the sheet
  has a 1 pixel border, and `setTileDefaultPadding(1)`, first in
  `gameInit`, makes `tile` count it.
- `UICheckbox(pos, size)` has a `checked` field.
- `UITextInput(pos, size, text)` is a field to type in. `textHeight`
  sets the text's height in place of fitting it, and `maxLength` is the
  most characters it takes.
- `UISlider(pos, size, value, text)` has a `value` from 0 to 1. It
  starts at `soundVolume`, the engine's setting.
- `UIButton(pos, size, text)` is a button.

### Callbacks
Each object has functions to replace. `onClick` is called when it is
clicked, and `onChange` when its state changes: when the checkbox is
toggled, as the slider moves, and when typing in the field ends.

The checkbox sets `button1.disabled`. A disabled object is drawn in its
disabled color and can not be pressed or selected.

### The dialog and the back button
`uiSystem.showConfirmDialog(text, yesCallback)` shows a Yes and No box
over everything, and nothing behind it can be used until it is
answered. Yes runs the callback, which hides the menu by its `visible`
field and shows `buttonBack`. That button was made hidden and is not a
child of the menu, so it is still there when the menu is not.

### Keyboard and gamepad
An object with a `navigationIndex` can be selected with the arrow keys
or a gamepad, in the order of the numbers. `++navigationIndex` numbers
them as they are made. `navigationAutoSelect` marks the one that is
selected first. With the slider selected, left and right change it.

## Try it
- Round the corners more: `defaultCornerRadius = 8` to `30`.
- Add a default after the shadow line, before any object is made:
  `uiSystem.defaultButtonColor = hsl(.6,.7,.7);`
- Add `slider.fillMode = true;` after the slider is made. It fills
  like a progress bar.
- Allow a short name only: `textInput.maxLength = 16;` to `4`.

## See also
UI Layout places objects in rows and grids with no positions to work
out, and UI Tile Slice draws them with tile art. UI System Plugin Demo
in the full examples is a whole menu, and HTML Menus does the same with
HTML elements.
*/
