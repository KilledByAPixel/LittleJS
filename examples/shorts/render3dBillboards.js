class Sprite extends EngineObject3D
{
    constructor(pos, tileInfo, color)
    {
        // create a billboard object with no mesh
        super(pos, undefined, tileInfo, color);
        this.size3D = vec3(2);
        this.softShadow = 2;
        this.phase = rand(2*PI);
        this.pixelated = true; // hard edged pixels
    }
    update()
    {
        // bob up and down
        const t = time + this.phase;
        this.pos3D.y = 2 + sin(t*2) * .5;
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.65,.5,.15), hsl(.8,.4,.3), hsl(.65,.4,.1));
    render3D.setFog(15, 40);
    render3D.ambientColor = hsl(.6,.2,.5);
    new CameraControl3D(vec3(), 15, .5, .003);

    // floor and cube for comparison
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.8,.2,.3)));
    new EngineObject3D(vec3(0,2,0), buildBox(2).setColor(hsl(0,0,.7)));

    // ring of sprites from the tile sheet
    for (let i = 12; i--;)
    {
        const pos = vec3(7, 2).rotateY(i/12*2*PI);
        const color = hsl(i/12,.8,.7);
        new Sprite(pos, tile(i%4, 16), color);
    }
}

/* info
Twelve sprites from the tile sheet in a ring, bobbing up and down. Each
is a flat square that always faces the camera, a billboard, with a soft
round shadow on the floor under it. Drag to turn the camera and roll the
wheel to zoom, and watch the sprites turn with it while the cube in the
middle does not.

## How it works
An `EngineObject3D` with a tile and no mesh is a sprite. The constructor
is `(pos3D, mesh, tileInfo, color)`, so `Sprite` passes `undefined` for
the mesh. The object then draws its tile as a billboard, unlit, so it
keeps its own colors whatever the light is.

### Sprite
- `size3D = vec3(2)` makes the sprite 2 world units wide and tall. For a
  sprite, x and y of `size3D` are its width and height.
- `softShadow = 2` draws a soft dark disc 2 units across under the
  object, at the height in `render3D.softShadowHeight`, which is 0 by
  default, the floor here. It is much cheaper than a real shadow, and
  `render3D.shadows` is not turned on in this example.
- `pixelated = true` keeps the tile's pixels hard edged at any distance.
  Without it a far away sprite is drawn from smaller, blurred copies of
  the texture.
- `phase` is a random start angle, so the sprites do not all move
  together.

`update` runs every frame and sets the height to 2 plus a sine wave that
goes half a unit up and down. `time` is in seconds, and `t*2` makes one
bob take about three seconds.

### gameInit
- `setSky(top, horizon, bottom)` takes a third color here, for the part
  of the sky below the horizon.
- `setFog(start, end)` fades things into the fog color between 15 and 40
  units from the camera. `setSky` set that color to the horizon's.
- The fourth argument of `CameraControl3D` is `idleSpin`, how far the
  camera turns each frame while the mouse is not dragging it.
- The floor is `buildGrid` with one cell and one color, and
  `buildBox(2).setColor(...)` is a cube with the color set on the mesh
  itself.

The loop makes the ring: `vec3(7, 2).rotateY(angle)` is a point 7 units
from the middle, turned around the y axis. `tile(i%4, 16)` is one of the
first four tiles of the sheet, 16 pixels each, and the color tints it.

## Try it
- Change `tile(i%4, 16)` to `tile(i, 16)` for twelve different tiles.
- Change `size3D` to `vec3(1, 3, 1)` for tall thin sprites. Only x and y
  count.
- Set `softShadow` to `0` to see how much the shadows place the sprites.
- Add `this.upright = true;` to the constructor. The sprites then stand
  straight up and only turn around to face the camera, where before they
  tilted back when seen from above.

## See also
3D Particles draws its particles as billboards too. 3D Text makes solid
models from tiles with `buildExtrude`, and 3D Layers puts 3D objects in
front of and behind 2D drawing. Look up `render3D.drawBillboard` to draw
one with no object.
*/
