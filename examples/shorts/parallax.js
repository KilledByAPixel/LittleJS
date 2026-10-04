function gameInit()
{
    canvasClearColor = hsl(.6,.4,.8);
    cameraScale = 24;

    // the far layers are lighter and higher, follow the camera more,
    // and draw first
    const hue = rand();
    for (let i = 3; i--;)
    {
        const far = i/2;
        const top = hsl(hue, .4, .35 + far*.3);
        const bottom = hsl(hue, .5, .15 + far*.2);
        new ParallaxLayer(vec2(0, far*4 - 4), vec2(40, 20), .3 + far*.5,
            -1 - i, parallaxMountains(top, bottom));
    }
}

function gameUpdate()
{
    const look = mousePosScreen.subtract(mainCanvasSize.scale(.5));
    cameraPos = vec2(time*4 + look.x*.02, -look.y*.005);
}

function gameRenderPost()
{
    // the world itself, ground and posts 5 units apart, in front of it all
    drawRect(vec2(cameraPos.x, -28), vec2(1e3, 40), hsl(.3,.4,.25));
    const w = getCameraSize().x/2 + 1;
    const first = floor((cameraPos.x - w)/5)*5;
    for (let x = first; x < cameraPos.x + w; x += 5)
        drawRect(vec2(x, -7), vec2(.4, 2), hsl(.08,.5,.3));
}

/* info
Three ranges of mountains from the parallax plugin. Each follows the
camera by its own amount and repeats across the view, so the far ones
pass slowly. The camera drifts along and the mouse looks around.

## How it works
Parallax is what makes far things seem to pass more slowly than near
ones. A `ParallaxLayer` fakes it: it is an image that moves along with
the camera by a part of the camera's movement. The more it follows, the
slower it crosses the screen and the farther away it looks.

### The layers
`new ParallaxLayer(pos, size, parallax, renderOrder, drawFunction)`
makes a layer, and from then on the engine draws it.

- `pos` is where the middle of the image is in the world when the
  camera is there too.
- `size` is the world size of one copy of the image, 40 by 20 units.
  The layer repeats it left and right for as far as the view goes, so
  the background never runs out.
- `parallax` is how much of the camera's movement the layer follows: 0
  stays with the world, like any object, and 1 stays with the screen.
- `renderOrder` is the drawing order. Lower numbers are drawn first,
  and so end up behind.
- `drawFunction` draws the image, once, when the layer is made.

The loop counts `i` from 2 down to 0, and `far` is 1, .5 and 0. The
farthest layer is the highest, follows the camera most, at .8 against
.3 for the nearest, has the lowest render order, at -3, and the
lightest colors, as if seen through haze. All three share one random
hue.

`parallaxMountains(topColor, bottomColor)` returns a draw function: a
ridge of mountains shaded from the first color at the peaks to the
second at the bottom of the image. The ridge ends at the height it
starts at, so the copies join without a seam. Each call makes a
different ridge.

### The camera
`gameUpdate` sets `cameraPos` every frame. Its x grows by 4 units a
second with `time`, which is what scrolls the scene. `look` is the
mouse's distance from the middle of the canvas in pixels, from
`mousePosScreen` and `mainCanvasSize`, and a little of it is added so
the mouse shifts the view. Screen y goes down and world y goes up,
which is why the y part has a minus.

`cameraScale = 24` shows more of the world than the default 32 pixels
to a unit, and `canvasClearColor` is the sky.

### The world
`gameRenderPost` runs after the objects are drawn, so the ground and
the posts are in front of the layers. They are drawn at fixed world
positions, a post every 5 units, and move at the camera's full speed.
`getCameraSize()` is the view's size in world units, and `w` is half
its width and a unit more. `first` is the post position `w` left of
the camera, rounded down to a multiple of 5, and the loop draws posts
from there until `w` right of it, enough to cover the view wherever the
camera is and however wide the canvas.

## Try it
- Change the parallax, `.3 + far*.5,` to `0,`. Every range now passes
  at the speed of the posts, and the depth is gone.
- Go faster: `time*4` to `time*20`.
- Pick the color: `const hue = rand();` to `const hue = .08;`.
- Give the mountains a seed, `parallaxMountains(top, bottom)` to
  `parallaxMountains(top, bottom, i)`. The same seed draws the same
  mountains, so they no longer change at each restart.

## See also
Starfield and Space Game make parallax by hand. Platforming Game in the
full examples uses these layers behind a level. A layer can draw
anything: give it your own `(context, size)=> ...` function, which
draws on a 2D canvas context.
*/
