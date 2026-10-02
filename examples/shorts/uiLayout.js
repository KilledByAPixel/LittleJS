function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 8;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(0,0,.3);

    // outer vertical layout: title on top, grid below
    const menu = new UILayout(vec2(), 1, 20, 30);
    menu.addChild(new UIText(vec2(), vec2(400, 60), 'Level Select'));

    // inner 3x2 grid of level select buttons
    const grid = new UILayout(vec2(), 3, 20, 0, true);
    for (let i = 1; i <= 6; ++i)
    {
        const button = new UIButton(vec2(), vec2(220, 120), 'Level\n' + i);
        button.color = hsl((i-1)/6, .7, .6);
        button.textHeight = 42;
        button.navigationIndex = i;
        button.onClick = ()=> canvasClearColor = hsl((i-1)/6, .5, .2);
        grid.addChild(button);
    }
    menu.addChild(grid);
}

/* info
A level select menu that places itself: a title over a grid of six
buttons, with no position worked out by hand. Click a button to set the
background to its color, or step through them with the up and down
arrow keys and press Space or Enter.

## How it works
A `UILayout` is a UI object that arranges its children. Each child is
given the position `vec2()`, and the layout moves it to its place. The
layout also sizes itself to fit what is in it.

### The plugin
`new UISystemPlugin` starts the UI system and makes `uiSystem`. The
four lines after it set the style that objects made later take: a
sound for a press and for a click, rounded corners and a shadow.

### The layouts
`new UILayout(pos, columns, gap, padding, transparent)`:

- `columns` is how many children go in a row before the next row
  starts. 1 is a vertical list, the number of children is one row, and
  anything between is a grid.
- `gap` is the space between children and `padding` the space between
  them and the layout's edge, both in pixels.
- `transparent` true draws no background, outline or shadow, for a
  layout that is only there to place things.

`menu` is one column with a gap of 20 and a padding of 30, and it draws
the panel. Its position `vec2()` is the middle of the canvas, since it
has no parent. Its two children are the title, a `UIText` 400 by 60,
and `grid`.

`grid` is a second layout inside the first: 3 columns, no padding and
transparent. The six buttons fill it row by row, three in the first row
and three in the second.

A column is as wide as its widest child and a row as tall as its
tallest, and each child is centered in its cell. `addChild` works the
layout out again each time, and a layout inside another tells its
parent when its size changes, so the order things are added in does not
matter.

### The buttons
`new UIButton(pos, size, text)` makes each button, 220 by 120 pixels.
`i` goes from 1 to 6, so `(i-1)/6` gives the buttons six hues evenly
around the color wheel. `onClick` sets `canvasClearColor`, the
background, to a darker color of the same hue. `textHeight` sets the
height of each line of the label, and `navigationIndex` is the button's
place in the order the keys go through.

## Try it
- Make the grid two columns wide: `3, 20, 0, true` to `2, 20, 0, true`.
  It becomes three rows of two, in a panel as tall as the canvas.
- Make four buttons: `i <= 6` to `i <= 4`. The last row has one, under
  the first column.
- Make the buttons square: `vec2(220, 120)` to `vec2(160, 160)`. The
  grid and the panel around it take the new size.
- Spread the title and the grid apart: `1, 20, 30` to `1, 60, 30`.

## See also
UI System shows the other widgets, placed by hand. UI Tile Slice draws
them with tile art. A layout has `relayout()`, to call after changing a
child's size or showing or hiding one.
*/
