let coinMesh; // one mesh all the coins share

class Coin extends EngineObject3D
{
    constructor(pos, after)
    {
        super(vec3(pos.x, pos.y), coinMesh);
        this.color = hsl(.15,1,.5);
        this.rotation3D.x = PI/2; // face the camera
        this.angleVelocity3D = vec3(0, .04);
        this.specular = 1;
        this.renderAfter2D = after; // before or after 2D scene
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.camera.align2D = true; // follow the 2D camera
    render3D.ambientColor = hsl(0,0,.5);
    setCanvasClearColor(hsl(.6,.3,.3));

    // coins in front of and behind the 2D bars
    coinMesh = buildTorus(1.5, .5);
    for (let i = 6; i--;)
        new Coin(vec2(i*4 - 10, 0), i%2 == 1);
}

function gameRender()
{
    // the 2D scene, drawn between the two 3D layers
    for (let x = -12; x <= 12; x += 2)
        drawRect(vec2(x, 0), vec2(1, 12), hsl(0,0,.4));
    drawTile(vec2(sin(time)*8, -4), vec2(3), tile(2,16));
}

/* info
3D and 2D in one picture. Six spinning coins are 3D objects, and the
gray bars and the sliding tile are plain 2D drawing. Every other coin
is drawn in front of the bars and the rest behind them.

## How it works
The 3D plugin draws its scene before `gameRender`, so what a game draws
in 2D lands on top of it. An object can ask for the other side: with
`renderAfter2D = true` it is drawn in a second 3D pass, after the 2D
scene, and so over it. That gives three layers, back to front: 3D, 2D,
3D.

### gameInit
- `render3D.camera.align2D = true` lines the 3D camera up with the 2D
  one every frame. A 3D point at z 0 then shows at the same place on
  screen as the 2D point with the same x and y, so the two kinds of
  drawing share one set of coordinates.
- `render3D.ambientColor` is the light that reaches every side. No sky
  is set here, so the background is the canvas itself, cleared to the
  color given to `setCanvasClearColor`.
- `coinMesh` is `buildTorus(size, tubeSize)`, a ring 1.5 across with
  a tube `.5` thick. It is built once and every coin draws it, so the
  coins of each layer are drawn together, as one instanced draw.
- The loop makes six coins 4 units apart. `i%2 == 1` is true for every
  other one, and that is passed on as `after`.

### Coin
The constructor gets a 2D position and makes a 3D one from it:
`vec3(x, y)` leaves z at 0, where the 2D scene is. The mesh is the
shared `coinMesh`.
A torus is built lying flat, so `rotation3D.x = PI/2` pitches it up to
face the camera. `angleVelocity3D` is added to the rotation every
frame, and `vec3(0, .04)` is a yaw, a turn around the y axis.
`specular = 1` gives the ring a highlight.

The last line is the one this example is about: `renderAfter2D` set to
`true` or `false` picks the layer. Left `undefined`, an object follows
`render3D.renderAfter2D`, which is `false` to start with.

### gameRender
The bars are `drawRect(pos, size, color)`, one every 2 units and 12
tall. `drawTile` draws tile 2 of the sheet, 3 units across, sliding
from side to side with `sin(time)*8`.

## Try it
- Change `i%2 == 1` to `true` and every coin is in front of the bars.
- Move the tile up to the coins: change `-4)` to `0)`. It passes in
  front of some coins and behind the others.
- Change `vec3(0, .04)` to `vec3(.04, 0)` to tumble the coins the
  other way.
- Set `align2D` to `false`. The 3D camera then stays where it starts,
  and the coins no longer line up with the bars.

## See also
3D Sync 2D goes further: 2D physics drawn with 3D objects. 3D
Billboards has sprites inside a 3D scene, and 3D Basics is a scene that
is 3D only.
*/
