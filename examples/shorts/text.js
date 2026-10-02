function gameRender()
{
    // size is the height of a line in world units, color is the fill
    drawText('LittleJS text', vec2(0, 6), 2, hsl(.1,1,.6));

    // an outline: a line width in world units and its color
    drawText('outlined', vec2(0, 3.5), 1.5, WHITE, .15, hsl(.6,1,.3));

    // alignment says where the position is on the line
    drawLine(vec2(0, 2.5), vec2(0, -1.5), .05, hsl(0,0,.4));
    drawText('left of the line', vec2(0, 1.5), .8, WHITE, 0, BLACK, 'right');
    drawText('centered on it', vec2(0, .5), .8, WHITE, 0, BLACK, 'center');
    drawText('right of the line', vec2(0, -.5), .8, WHITE, 0, BLACK, 'left');

    // the font is any the browser has, and the style goes in front of it
    drawText('serif', vec2(-8, -2.5), 1, WHITE, 0, BLACK, 'center', 'serif');
    drawText('monospace', vec2(0, -2.5), 1, WHITE, 0, BLACK, 'center',
        'monospace');
    drawText('bold italic', vec2(8, -2.5), 1, WHITE, 0, BLACK, 'center',
        fontDefault, 'bold italic');

    // a new line starts a new row, and maxWidth squeezes a line to fit
    drawText('two\nrows', vec2(-8, -5.5), 1);
    drawText('squeezed into four units', vec2(0, -5.5), 1, WHITE, 0, BLACK,
        'center', fontDefault, '', 4);

    // turned by an angle in radians, clockwise
    drawText('turned', vec2(8, -5.5), 1, hsl(.8,1,.7), 0, BLACK, 'center',
        fontDefault, '', undefined, sin(time)*.5);
}

function gameRenderPost()
{
    // screen text is placed and sized in pixels, from the top left corner
    drawTextScreen('drawTextScreen: 20 pixels, at the top left', vec2(10, 15),
        20, hsl(0,0,.7), 0, BLACK, 'left');
}

/* info
What `drawText` can do: size, color, an outline, alignment, fonts and
styles, several rows, a squeezed line, a turned line, and text placed in
pixels on the screen. There is nothing to press.

## How it works
Text is drawn on the 2D canvas, over what WebGL drew, so it stays sharp
whatever the game does to the picture. `drawText(text, pos, size,
color, lineWidth, lineColor, textAlign, font, fontStyle, maxWidth,
angle)` has a long list of arguments, and each line here sets one more
of them.

- `size` is the height of a line in world units, and `pos` is the
  middle of the text, in the world like any other draw.
- `lineWidth` and `lineColor` are an outline drawn behind the fill, the
  width in world units too. 0 draws no outline.
- `textAlign` says where `pos` is on the line: `'right'` puts the end
  of the text there, `'left'` its start.
- `font` is any font the browser has, by its CSS name, and `fontDefault`
  is the engine's setting for it, `'arial'` unless changed with
  `setFontDefault`. `fontStyle` goes in front of it, so `'bold italic'`
  is both.
- A `\n` in the text starts a new row, and the rows are centered on
  `pos` as a block.
- `maxWidth` is a width in world units a line is squeezed into when it
  is wider, as the canvas's own text drawing does. It never wraps.
- `angle` turns the text around `pos`, clockwise, in radians.

### drawTextScreen
`drawTextScreen` takes the same arguments with the position, the size
and the widths in pixels of the canvas, from its top left corner. It is
called in `gameRenderPost`, so it is drawn after everything else, which
is where a score or a menu goes. `drawText` converts its world values
and calls it.

## Try it
- Change the title's size from `2` to `4`.
- Thicken the outline: `.15` to `.4`.
- Change the `'serif'` font to `'cursive'`.
- Change the `4` at the end of the squeezed line to `12`, and it is no
  longer squeezed.
- Change `sin(time)*.5` to `time` and the text spins.

## See also
Image Font draws text from an image, pixel art style, and Low
Resolution Output shows both kinds small. Hello World is the simplest
text. Look up `drawText` for every argument.
*/
