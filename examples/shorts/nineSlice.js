function gameRender()
{
    const nineSliceTile = tile(16);
    const threeSliceTile = tile(19);

    {
        // draw nine slice with thin border and color
        const pos = vec2(-7,4);
        const size = vec2(11+oscillate(.5,2), 6);
        const color = hsl(.1,.5,.9);
        const border = .5;
        drawNineSlice(pos, size, nineSliceTile, color, border);
        drawText('Nine Slice\nThin Border', pos, 1, BLACK);
    }
    {
        // draw nine slice in screen space with color, thick border and rotation
        const pos = vec2(700,150);
        const size = vec2(250);
        const color = hsl(.55,.5,.9);
        const border = 32;
        const angle = time/2;
        drawNineSliceScreen(pos, size, nineSliceTile, color, border, undefined,
            2, angle);
        drawTextScreen('Nine Slice\nScreen Space', pos, 30, BLACK);
    } 
    {
        // draw three slice with variable border and additive color
        const pos = vec2(-7,-4);
        const size = vec2(9, 7);
        const border = 2 + oscillate(.2)*2;
        const additive = hsl(time/30,.5,.5);
        drawThreeSlice(pos, size, threeSliceTile, WHITE, border, additive);
        drawText('Three Slice\nVariable\nBorder', pos, 1, BLACK);
    }
    {
        // draw three slice in screen space with changing size        
        const pos = vec2(700,420);
        const size = vec2(350-oscillate(.3,90),120+oscillate(.3,60));
        drawThreeSliceScreen(pos, size, threeSliceTile);
        drawTextScreen('Three Slice\nScreen Space', pos, 30, BLACK);
    }
}

/* info
Four panels drawn from a few small tiles, at any size, with borders
that keep their thickness. Two are in the world and two on the screen,
and each changes its size, border, color or angle as it goes. There is
nothing to press.

## How it works
Stretching one image over a box of another shape makes its border thick
one way and thin the other. A sliced panel draws the corners at a fixed
size, stretches the edges along their length only, and stretches the
middle to fill what is left.

### The tiles
The two kinds differ in the art they need:

- A **nine slice** reads a block of 3 by 3 tiles from the sheet: four
  corners, four edges and a center. `tile(16)` is the top left tile of
  the block, and the other eight are the tiles to its right and below.
- A **three slice** reads 3 tiles in a row: a corner, an edge and a
  center. It turns the corner and the edge to make all four of each, so
  it suits a frame that looks the same from every side. `tile(19)` is
  the first of the three.

The sheet is 16 tiles wide, so tile 16 is the first of its second row.

### World space
`drawNineSlice(pos, size, startTile, color, borderSize)` draws a panel
in the world: `pos` is its center, and `size` and `borderSize` are in
world units. `borderSize` is how thick the edges and corners are drawn,
half a unit here. It has nothing to do with how the tiles are cut.

`oscillate(frequency, amplitude)` is a wave that goes from 0 up to the
amplitude and back, `frequency` times a second. So the panel's width
goes from 11 to 13 and back every 2 seconds, and the border stays the
same.

`drawThreeSlice` takes the same arguments. Its border is given as 2 to
4 units, but is never drawn thicker than half the panel, 3.5 here. It
gets one more argument, an additive color: `color` multiplies the
tile's colors, and `additiveColor` is added on top. The hue comes from
`time/30`, so it goes around the color wheel every 30 seconds.

### Screen space
`drawNineSliceScreen` and `drawThreeSliceScreen` take a position and
sizes in pixels, from the top left of the canvas with y going down.
That is the one to use for a HUD or a menu, which should not move with
the camera. The border is 32 pixels unless given.

The nine slice passes `undefined` for the additive color and `2` for
`extraSpace`, the defaults, to reach the argument after them, the angle
in radians. `time/2` keeps it turning.

The labels are `drawText` in the world and `drawTextScreen` on the
screen, at the same positions as the panels, which are their centers.

## Try it
- Thicken the first panel's border: `const border = .5;` to
  `const border = 2;`.
- Thicken the screen one's: `const border = 32;` to `80`.
- Stop the turning: `const angle = time/2;` to `const angle = 0;`.
- Tint the three slice. Change `WHITE, border, additive` to
  `hsl(.3,.6,.7), border`.

## See also
UI Tile Slice puts these panels behind buttons and sliders with
`TileSlice`, which keeps a tile, a kind and a border together as one
style. Sprite Atlas shows how `tile()` picks a tile.
*/
