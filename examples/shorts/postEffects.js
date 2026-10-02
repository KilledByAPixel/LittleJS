const effects = [
    ['old TV', postProcessTV({curve: .1})],
    ['scanlines', postProcessScanlines(.4)],
    ['static noise', postProcessNoise(.15)],
    ['vignette', postProcessVignette(1, 1)],
    ['CRT curve', postProcessCurve(.15)],
    ['chromatic aberration', postProcessChromatic(.01)],
    ['glow', postProcessGlow(.5, 2, 8)],
    ['your own code', 'c.rgb = c.gbr;'],
    ['none', ''],
];
let current = 0;

function gameInit()
{
    new PostProcessPlugin(postProcessEffects(effects[0][1]));
}

function gameUpdate()
{
    if (!mouseWasPressed(0) && !keyWasPressed('Space'))
        return;
    current = (current + 1) % effects.length;
    postProcess.setShaderCode(postProcessEffects(effects[current][1]));
}

function gameRender()
{
    // a scene with color and bright spots for the effects to work on
    drawRect(vec2(), vec2(99), hsl(.6,.3,.25));
    for (let i = 0; i < 12; ++i)
    {
        const a = i/12*PI*2 + time/2;
        drawCircle(vec2(cos(a), sin(a)).scale(7), 2, hsl(i/12,.8,.6));
    }
    drawTile(vec2(0, sin(time)), vec2(6), tile(3,128));
}

function gameRenderPost()
{
    // screen text is on the 2D canvas, the effects leave the words alone
    const name = effects[current][0], y = mainCanvasSize.y - 50;
    drawTextScreen(name + '  ·  click for the next',
        vec2(mainCanvasSize.x/2, y), 30, WHITE, 4);
}

/* info
The built in post effects, one after another: click or press space for
the next. Each is a piece of shader code with its settings in, and
`postProcessEffects` joins pieces into one shader.

## How it works
### The effects
`effects` is a list of pairs: a name to show, and a piece of shader
code. Each `postProcess...` function returns its piece as a string, with
the numbers it was given written into the code:

- `postProcessTV({curve: .1})` is the look of an old TV in one piece:
  static noise, scan lines, a soft glow and a vignette, and a bulged
  screen because `curve` is set. Its other settings are `noise`,
  `scanlines`, `scanlineSpacing`, `glow` and `vignette`, and one set to
  0 leaves that part out.
- `postProcessScanlines(strength, spacing)` darkens lines across the
  screen. The spacing is in pixels, 6 when left out.
- `postProcessNoise(strength, size)` adds static that changes every
  frame. The size of a speck is in pixels, 2 when left out.
- `postProcessVignette(strength, falloff)` darkens toward the corners. A
  strength of 1 takes the corners to black. A low falloff darkens most
  of the screen and a high one only the corners.
- `postProcessCurve(strength)` bends the picture like bulged glass,
  black past the corners.
- `postProcessChromatic(strength)` pulls red and blue apart toward the
  edges, each moved by that part of the screen at the edge.
- `postProcessGlow(threshold, strength, size)` blurs the bright parts
  back over the picture. The threshold is the brightness where the glow
  starts, and the size is how far it spreads, in pixels.

The last two entries are plain strings. `'c.rgb = c.gbr;'` is a piece
written by hand: `c` is the pixel's color, and this gives red the green
value, green the blue and blue the red. The empty string does nothing,
so the frame passes through unchanged.

### Switching
`gameInit` makes the one `PostProcessPlugin`, with the first effect.
`postProcessEffects(piece)` writes the whole shader around a piece. The
plugin is also kept in the global `postProcess`.

`gameUpdate` returns early unless the left mouse button or space was
pressed this frame. Then it steps `current`, with `%` taking it back to
0 after the last, and calls `postProcess.setShaderCode(...)`. That
replaces the shader from the next frame on, with no second plugin.

### The scene
`gameRender` draws something for the effects to work on: a dark
background, a ring of twelve circles in every hue that turns with
`time`, and the logo tile. The circles are brighter than the glow's
threshold of `.5` and the background is darker.

`gameRenderPost` draws the effect's name with `drawTextScreen`, whose
position and size are in pixels of the canvas, not world units. Here
that is the middle of the canvas, 50 pixels up from its bottom, at
size 30 with a 4 pixel outline. Text is drawn on the 2D canvas, and
the plugin shades the WebGL canvas, so the words stay sharp.

## Try it
- Spread the scan lines: `postProcessScanlines(.4)` to
  `postProcessScanlines(.4, 20)`.
- Take the static out of the TV: `{curve: .1}` to
  `{curve: .1, noise: 0}`.
- Make everything glow, and farther: `postProcessGlow(.5, 2, 8)` to
  `postProcessGlow(0, 1, 16)`.
- Change your own code to `'c.rgb = 1. - c.rgb;'` to invert the colors.

## See also
Post Processing explains how a piece of your own is written, and WebGL
Shader draws a whole picture with the plugin. 3D Glow puts bloom on a
3D scene, and Breakout Game has a post effect over a whole game.
*/
