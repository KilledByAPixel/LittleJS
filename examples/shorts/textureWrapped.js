function gameInit()
{
    // enable wrap mode on the default tile sheet
    textureInfos[0].setWrap(true);
}

function gameRender()
{
    // draw a wrapped texture
    drawTextureWrapped(vec2(-6, 2), vec2(12, 6), vec2(3, 2));

    // draw red tinted wrapped and rotating
    drawTextureWrapped(vec2(9, 2), vec2(6, 6), vec2(2), 0, RED, time);

    // animated wrap count
    const wraps = 2 - sin(time);
    drawTextureWrapped(vec2(0, -5), vec2(12, 4), vec2(wraps, 1/16));
}

/* info
The tile sheet repeated across three rectangles: a plain one, a red one
that turns, and a strip whose repeat count changes with time. There is
nothing to press.

## How it works
### gameInit
`textureInfos` is the list of textures the engine has loaded, and
`textureInfos[0]` is the first, the shorts' tile sheet. A texture
normally stops at its edge. `setWrap(true)` sets it to repeat instead,
which `drawTextureWrapped` needs: it asserts when the texture does not
wrap. It is a setting of the texture, not of a draw, so it is set once
here.

### gameRender
`drawTextureWrapped(pos, size, wrapCount, texture, color, angle)` fills
a rectangle centered on `pos`, `size` world units across, with the
texture repeated `wrapCount.x` times across and `wrapCount.y` times
down. It always repeats the whole texture: one tile of a sheet can not
be wrapped this way. `texture` is a `TextureInfo` or a number in
`textureInfos`, and 0 when left out.

- The first call repeats the sheet 3 times across and 2 down in a
  rectangle 12 by 6. Each copy is 4 units wide and 3 tall, so the
  square image is drawn wider than it is tall.
- The second writes the texture out as `0` because the color and the
  angle come after it. `RED` multiplies the pixels, and the angle is in
  radians, so `time` turns it one radian a second.
- The third shows that a count need not be whole. `2 - sin(time)` goes
  between 1 and 3. `1/16` down is the top sixteenth of the image, 18 of
  its 288 pixels, which is the top row of 16 pixel tiles with their 1
  pixel of padding.

## Try it
- Change `vec2(3, 2)` to `vec2(6, 4)` for twice as many copies, each
  half the size.
- Change `RED` to `hsl(.6,1,.5)` and `time` after it to `time/4`: a
  blue square that turns slowly.
- Change `1/16` to `1`: the strip shows the whole sheet from top to
  bottom, squashed flat.

## See also
Texture draws the sheet once, Parallax repeats a background across the
view, and 3D Textures wraps textures on meshes. Look up `TextureInfo`
for `setWrap`.
*/
