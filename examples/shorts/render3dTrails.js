class Comet extends EngineObject3D
{
    constructor(color, phase)
    {
        super(vec3(), buildSphere(1, 8, 4));
        this.color = color;
        this.phase = phase;
        this.softShadow = 1.5;

        // add trail as a child so it follows
        const trail = new Trail3D(vec3(), 1.5, .5, undefined,
            color, color.withAlpha(0), true);
        this.addChild(trail);
    }
    update()
    {
        // a figure eight around the flag
        const t = time*1.5 + this.phase;
        this.pos3D = vec3(sin(t)*6, 3 + sin(t*2)*1.5, sin(t*2)*3);
    }
}

class Flag extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, buildGrid(vec2(4,2.5), vec2(16,10), hsl(0,.7,.6)));
        this.rotation3D.x = PI/2; // stand the grid up
        this.mesh.dynamicDraw = true; // its points move every frame
    }
    update()
    {
        // ripple the cloth in place
        for (const p of this.mesh.points)
            p.y = sin(p.x*2 - time*6)*.3*(p.x + 2);
        this.mesh.computeNormals(true);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.1), hsl(.8,.4,.2), hsl(.6,.3,.1));
    render3D.ambientColor = hsl(.6,.1,.5);
    new CameraControl3D(vec3(0,3,0), 16, .3, .002);

    // floor, flagpole, flag and the comets looping around it
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.6,.1,.4)));
    const pole = buildCylinder(.16, 6, 8).setColor(hsl(.1,.3,.4));
    new EngineObject3D(vec3(-2,3,0), pole);
    new Flag(vec3(0,4.5,0));
    for (let i = 3; i--;)
        new Comet(hsl(i/3,1,.6), i*2*PI/3);
}

/* info
Three comets fly a figure eight around a flagpole, each with a glowing
trail, and the flag ripples. Drag to turn the camera and roll the wheel
to zoom.

## How it works
Both classes extend `EngineObject3D`, the way a 2D game extends
`EngineObject`. The engine calls each object's `update` every frame.

### Comet
The constructor hands `super` a position and a mesh:
`buildSphere(size, sides, rings)`, one unit across with few sides.
`softShadow = 1.5` draws a soft round shadow of that diameter on the
ground under the object, at height 0 unless
`render3D.softShadowHeight` says otherwise. It is much cheaper than the
real shadows, which this scene leaves off.

`new Trail3D(pos3D, lifeTime, width, tileInfo, color, colorEnd,
additive)` is a ribbon through where an object has been. It records
its world position each frame it moves. A sample lives `lifeTime`
seconds, here 1.5, and over that time the ribbon thins from `width` to
nothing and its color goes from `color` to `colorEnd`.
`color.withAlpha(0)` is the same color fully see through, so the tail
fades out. `additive` adds the ribbon's color to what is behind it,
which makes it glow.

A trail does not move by itself. `addChild` attaches it to the comet
with its `pos3D` as an offset from the parent, `vec3()` here, so it is
always at the comet's center.

`update` puts the comet on its path from `time`. x swings once while y
and z swing twice, which draws a figure eight. `phase` starts each
comet a third of the way around from the last.

### Flag
The flag is `buildGrid(size, segments, color)`, 4 by 2.5 units with 16
by 10 cells. A grid is built lying flat, so `rotation3D.x = PI/2`
pitches it up to stand. `dynamicDraw = true` tells the renderer the
mesh's values change often and its shape does not.

`update` moves the points of the mesh itself. A point's `y` is the
grid's own up, which after the pitch points out of the cloth's face, so
setting it makes a ripple. `sin(p.x*2 - time*6)` is a wave that travels along x,
and `(p.x + 2)` scales it from 0 at the pole, where x is -2, to the
most at the free end. `computeNormals(true)` then works out smooth
normals for the new shape so the light follows the ripples, and marks
the mesh to be sent to the GPU again.

### gameInit
The pole is `buildCylinder(size, height, sides)`, `.16` across and 6
tall, and `setColor` sets the color of every vertex. Its center is at y
3, so it stands on the floor. The loop makes the comets with hues a
third apart.

## Try it
- Change the trail's life from `1.5` to `4` for long trails.
- Change its last argument from `true` to `false` to blend the trail
  and not add it.
- Make the flag wave harder: change `*.3*` to `*.6*`.
- Change `time*6` to `time*2` for a slow wave.
- Change `time*1.5` to `time*3` and the comets fly twice as fast.

## See also
3D Particles has sparks, each drawn as a short streak along its own
path. 3D Water changes a mesh in place every frame too, and
3D Drawing draws a ribbon with `render3D.drawRibbon`, which is what a
`Trail3D` uses.
*/
