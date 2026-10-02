const wave = `
    uv.x += sin(uv.y * 20. + iTime * 3.) * .01;
    c = texture(iChannel0, uv);`;

function gameInit()
{
    new PostProcessPlugin(postProcessEffects(wave));
}

function gameRender()
{
    drawRect(vec2(), vec2(99), GRAY);
    drawTile(vec2(sin(time)*3, 0), vec2(12), tile(3,128));
}

/* info
Post processing with your own shader code: two lines of GLSL that bend
the picture in a wave, run over every pixel of the frame. In them `c` is
the pixel's color and `uv` where it is on the screen, from 0 to 1.
There is nothing to press.

## How it works
`gameRender` draws an ordinary scene: a gray rectangle big enough to
cover the view, and the logo tile sliding from side to side. The wave is
not in those draws. It is added afterwards, to the finished frame.

### The plugin
`new PostProcessPlugin(code)` sets up post processing: after everything
is drawn, the WebGL canvas is copied into a texture and a shader draws
it back, one pixel at a time. The shader decides what each pixel shows,
so it can recolor the frame or read it from somewhere else. Only one
plugin can be made, and it needs WebGL.

### postProcessEffects
The plugin wants a whole shader function. `postProcessEffects(...)`
writes that function around the pieces it is given, so a piece is only
the lines that do something. Before your piece runs it has set:

- `uv`, the pixel's place on the screen, both parts from 0 to 1.
- `c`, the frame's color at `uv`, read with `texture(iChannel0, uv)`.
  `iChannel0` is the frame as the game drew it.
- `p`, the same place in pixels, and `iTime`, the engine's `time`.

Whatever is in `c` when the piece ends is the pixel's color.

### The wave
```
uv.x += sin(uv.y * 20. + iTime * 3.) * .01;
c = texture(iChannel0, uv);
```
The first line moves `uv` sideways by a sine of its height, at most
`.01`, one hundredth of the screen's width. `uv.y * 20.` sets how many
waves fit up the screen, about three, and `iTime * 3.` makes them
travel. The second line reads the frame again at the moved place. It is
needed because `c` was already read at the old `uv`.

Numbers in GLSL are written with a point, `20.` and not `20`, when they
are used with decimals.

## Try it
- Change `* .01` to `* .05` for a much stronger wave.
- Change `uv.y * 20.` to `uv.y * 60.` for three times as many waves.
- Add a line to the piece after the `texture` line: `c.rgb *= uv.y;`
  fades the picture to black at the bottom, where `uv.y` is 0.
- Join a built in effect after yours:
  `postProcessEffects(wave, postProcessScanlines())`.

## See also
Post Effects shows every built in effect and switches between them
while running. WebGL Shader draws a whole picture with the plugin, and
Object Shaders puts a shader on one sprite.
*/
