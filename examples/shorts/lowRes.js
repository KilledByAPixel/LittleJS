// how many pixels across the canvas is
const lowResSize = 128;

// disable canvas antialiasing to prevent blur
setCanvasPixelated(true);

// disable webgl antialiasing for low resolution
glSetAntialias(false);

function gameInit()
{
    // render to a tiny canvas that is scaled up
    canvasFixedSize = vec2(lowResSize);

    // fit 16 world units across the canvas
    cameraScale = lowResSize/16;
    canvasClearColor = hsl(.6, 1, .1);
}

function gameRender()
{
    // draw a sprite
    drawTile(vec2(0, sin(time*2)), vec2(6), tile(3,128));

    // draw orbiting circles
    for (let i = 6; i--;)
    {
        const a = i/6*2*PI + time;
        const pos = vec2(0, 5).rotate(a);
        drawCircle(pos, 2, hsl(i/6, 1, .5));
    }
}

function gameRenderPost()
{
    // draw text showing the resolution size
    drawText(lowResSize+'x'+lowResSize, vec2(0,6), 3);

    // draw text with engine and default fonts
    engineImageFont.drawText('Engine Font', vec2(0, -5), 1);
    drawText('Default Font', vec2(0, -7), 2);
}

/* info
A canvas of only 128 by 128 pixels, scaled up to fit the window with
every pixel kept sharp. A sprite bobs in the middle, six circles go
around it, and text is drawn with two kinds of font. There is nothing
to press.

## How it works
Three settings make the retro look. The first two are at the top of
the file, outside any function, so they are made before the engine
starts.

- `setCanvasPixelated(true)` has the browser scale the canvas up with
  nearest pixel scaling, the css `image-rendering: pixelated`, in place
  of smoothing it.
- `glSetAntialias(false)` turns off WebGL's anti-aliasing, which would
  soften the edges of shapes. It must be called before the engine
  starts, and it asserts if it is called later.
- `canvasFixedSize = vec2(lowResSize)` in `gameInit` makes the canvas
  that many pixels whatever the window's size. The engine then fits it
  to the window with css, so each canvas pixel covers many screen
  pixels.

### The camera
`cameraScale` is how many pixels one world unit covers, 32 as the
engine starts. Here it is `lowResSize/16`, which is 8, so the view is
16 world units across. Because the scale is worked out from
`lowResSize`, the scene keeps its layout when the resolution changes
and only the amount of detail differs.

`canvasClearColor` is the color the canvas is cleared to each frame.

### Drawing
`gameRender` draws the scene in world units as any example does.
`drawCircle(pos, size, color)` takes a diameter, and each circle's
place is `vec2(0, 5).rotate(a)`: a point 5 units up, turned clockwise
by an angle that grows with `time`.

`gameRenderPost` runs after the engine has drawn its objects, so the
text is on top.

- `drawText(text, pos, size)` uses a font of the browser's, `arial`
  unless `fontDefault` is changed.
- `engineImageFont.drawText(text, pos, size)` uses the engine's own
  font, an image of 8 by 8 pixel letters drawn as tiles. Its size is in
  world units too. A size of 1 is 8 pixels here, so each letter is
  drawn at exactly its own resolution.

## Try it
- Set `lowResSize` to `64`, or to `256`.
- Change `setCanvasPixelated(true)` to `false` to see the same canvas
  scaled up with smoothing.
- Draw the engine font twice as big: change its size from `1` to `2`.
- Change `i/6*2*PI + time` to `i/6*2*PI - time*3`: the circles go
  around the other way, three times as fast.

## See also
Image Font for fonts made from images, and Texture for how tiles are
drawn. The Platforming Game in the full examples is pixel art at full
resolution, which is the other way to do it.
*/
