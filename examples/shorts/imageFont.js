function gameRender()
{
    // draw text with built in engine font image
    const font = engineImageFont;
    font.drawText('Engine Font', vec2(0,3), 2);

    // show every character in the font
    let s = '';
    for (let i=32; i<128; ++i)
    {
        if (i%32 == 0)
            s += '\n';
        s += String.fromCharCode(i);
    }

    font.drawText(s, vec2());
}

/* info
Text drawn with the engine's built-in image font: a title, and under it
every character the font has. There is nothing to press.

## How it works
An `ImageFont` draws text with tiles from an image, one tile for each
character, where `drawText` on its own uses a font of the browser's.
The image holds 96 characters in ASCII order, the codes 32, a space, to
127. `engineImageFont` is a font the engine makes when it starts, with
characters of 8 by 8 pixels, so it is there with no image to load.

`font.drawText(text, pos, size)` draws in world space. `size` is the
size of one character in world units, 1 when left out. Every character
has the same width, so the title's 11 characters at size 2 are 22 units
wide. Each line is centered on `pos`, and the lines of a text with line
breaks are centered around it too.

The loop builds one string of all the characters.
`String.fromCharCode(i)` is the character with code `i`, and a `'\n'`
goes in whenever `i` is a multiple of 32, which gives rows of 32
characters. The first one goes in at 32, so the text starts with an
empty line. A character with a code outside 32 to 127 is drawn as the
font's last one.

A font of your own is `new ImageFont(tileInfo)`, where the tile is the
font's first character in an image laid out the same way.

## Try it
- Change `'Engine Font'` to a text of your own.
- Change the title's size from `2` to `vec2(1,3)`: a size can be a
  vector, and the characters are then narrow and tall.
- Color the characters: change the last call to
  `font.drawText(s, vec2(), 1, true, hsl(.1,1,.5));`. The argument
  before the color says whether to center the text, and it must be
  `true` or `false`.

## See also
Hello World draws text with `drawText`, and the Breakout Game example
draws its score with this font. Look up `ImageFont` for
`drawTextScreen`, which takes a position and a size in pixels.
*/
