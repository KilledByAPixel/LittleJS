let layer;

class Painter extends EngineObject
{
    constructor()
    {
        super(vec2(), vec2(1), undefined, 0, hsl(rand(), .8, .6));
        this.velocity = randVec2(.15);
    }

    update()
    {
        // bounce off the edges of the picture
        const half = layer.size.scale(.5).subtract(this.size.scale(.5));
        if (abs(this.pos.x) > half.x)
            this.velocity.x *= -1;
        if (abs(this.pos.y) > half.y)
            this.velocity.y *= -1;

        // leave a trail of paint where it has been
        layer.drawRect(this.pos, vec2(.3), this.color);
    }
}

function gameInit()
{
    canvasClearColor = hsl(.6, .2, .15);

    // a picture in the world to paint on, 32 by 32 pixels a unit
    layer = new CanvasLayer(vec2(), vec2(32, 18), 0, -1, vec2(1024, 576));
    layer.drawRect(vec2(), layer.size, hsl(.6, .2, .25), layer.angle);

    for (let i = 3; i--;)
        new Painter;
}

function gameUpdate()
{
    // a click splats paint where it lands
    if (mouseWasPressed(0))
    {
        const color = hsl(rand(), .8, .6);
        for (let i = 30; i--;)
        {
            const pos = mousePos.add(randInCircle(1.5));
            layer.drawRect(pos, vec2(rand(.1, .5)), color, rand(PI));
        }
    }
}

function gameRenderPost()
{
    const pos = vec2(mainCanvasSize.x/2, 40);
    drawTextScreen('Click to splat paint', pos, 36);
}

/* info
Three painters bounce around a picture, leaving trails of paint, and a
click splats paint where it lands. All of it is drawn into one
`CanvasLayer`, so the paint stays where it went.

## How it works
A `CanvasLayer` is a picture placed in the world: one texture, drawn
as one image. Here it is 32 by 18 units, with a canvas of 1024 by 576
pixels, so a world unit is 32 pixels of it.

`layer.drawRect(pos, size, color, angle)` draws into the picture in
world space, where it will show in the world, so a painter paints at
its own `pos` and a splat at `mousePos`. With WebGL the drawing goes
straight into the layer's texture on the GPU: no tile grid, and
nothing copied from the canvas. `drawTile` draws a tile the same way.

### Painter
Each painter is an `EngineObject` with a `velocity` from `randVec2`.
Its `update` turns it back at the picture's edges and draws a small
rect of its color where it is, every frame, which leaves a trail.

### Splats
A click draws 30 rects of one color at random places around the mouse
from `randInCircle`, each a random size and turned by a random angle.

### Losing the picture
What is drawn into a layer on the GPU lives only in its texture. If
the browser loses the WebGL context, as a phone may when it is short of
memory, the picture is gone; the layer's `onContextRestored()` is
called when the context comes back, the place to draw it again.

## Try it
- Turn the picture: in `gameInit`, change the layer's `0` angle to
  `.3`. The paint still goes where the painters are, though they
  still bounce in the upright box and leave its corners.
- A sharper picture: change `vec2(1024, 576)` to `vec2(2048, 1152)`.
- Bigger splats: change `randInCircle(1.5)` to `randInCircle(4)`.
- More painters: change `i = 3` to `i = 20`.

## See also
Tile Layer draws a level of tiles into a layer the same way, and
Parallax uses layers for backgrounds.
*/
