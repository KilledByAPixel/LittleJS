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

/* info
A UI styled with tile art: a widget draws a `TileSlice` in place of
its rectangle, tinted by the color for its state.

Hover and click the three buttons: Nine also changes the background
color. The checkbox turns the buttons off, and the slider sets the
sound volume.

## How it works
The UI system draws each object as a rectangle with an outline. Give an
object a `slice` and it draws that in place of the rectangle, at the
object's size, so one small piece of art frames a widget of any shape.

### TileSlice
`new TileSlice(tileInfo, slices, borderSize)` is a style to draw boxes
with. `slices` says how the art is used:

- `9` is a nine slice: the 3 by 3 block of tiles that starts at the
  tile given, with corners that keep their size, edges that stretch one
  way and a center that fills the rest.
- `3` is a three slice: three tiles in a row, a corner, an edge and a
  center, turned to make all four sides.
- `1` is the one tile stretched over the box.

`borderSize` is how thick the corners and edges are drawn. The UI works
in pixels, so 16 is 16 pixels, the size of the tiles: the border is
drawn at the art's own size and stays sharp.

### The defaults
`new UISystemPlugin` makes `uiSystem`, and every object copies its
`default...` values when it is made. So the style is set before any
object:

- `defaultSlice` is the slice each object starts with, the nine slice
  at `tile(16)`.
- `defaultHandleSlice` is for the handle of a slider, `tile(2)`
  stretched.
- `defaultButtonColor` and `defaultHoverColor` are the colors a button,
  checkbox or slider has at rest and under the mouse. The slice is
  tinted with the color for the object's state: the art's colors are
  multiplied by it, so `WHITE` leaves the art as drawn. That is what
  `defaultColor` is for the panel.

An object with a slice does not draw its outline, rounded corners or
shadow, since the art has the frame.

### The widgets
`menu` is a `UIObject` 600 by 440 in the middle of the canvas, and the
rest are its children, placed from its middle in pixels with y going
down.

- `nine` keeps the default slice. Its `onClick` sets the background to
  a random color.
- `three` gets a slice of its own, the three slice at `tile(19)`.
- `plain` has its `slice` set to `undefined`, and draws the system's
  rectangle and outline.
- `UICheckbox(pos, size, checked, text)` draws its text to its right.
  Its `onChange` sets `disabled` on the three buttons, which then tint
  with the disabled color, a dark gray.
- `UISlider(pos, size, value, text)` draws its bar with the default
  slice and its handle with the handle slice. It starts at
  `soundVolume`, and `setSoundVolume` applies the new value.

## Try it
- Double the border: `new TileSlice(tile(16), 9, 16)` to
  `new TileSlice(tile(16), 9, 32)`.
- Use another tile for the handle, `tile(2), 1` to `tile(7), 1`.
- Change the hover tint, `hsl(.15,.8,.8)` to `hsl(0,.8,.7)`.
- Make a button of a picture: `plain.slice = undefined;` to
  `plain.slice = new TileSlice(tile(3,128), 1);`

## See also
Nine Slice draws the same panels without the UI system, in the world
and on the screen. UI System and UI Layout show the widgets and how to
place them. `TileSlice` has a `draw(pos, size)` of its own, for a panel
outside the UI.
*/
