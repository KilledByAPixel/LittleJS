class Orb extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(1.5));
        this.color = color;
        this.orbitAngle = angle;
        this.emissive = 1; // full brightness
        this.addChild(new Light3D(vec3(), 15, color));
    }
    update()
    {
        const a = this.orbitAngle += .01;
        this.pos3D = vec3(6, 2 + sin(a*3)).rotateY(a);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.7,.5,.1), hsl(.6,.4,.2));
    render3D.sunColor = hsl(.6,.3,.2);
    render3D.ambientColor = hsl(.6,.3,.15);
    render3D.smoothShading = true;
    new CameraControl3D(vec3(0,2,0), 20, .25, .002);
    postProcessBloom(.5, 2, 8); // setup bloom

    // make floor and pillars
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, hsl(0,0,.5)));
    const pillar = buildCylinder(1.5, 5).setColor(hsl(0,0,.8));
    for (let i = 6; i--;)
        new EngineObject3D(vec3(11, 2.5).rotateY(i/6*2*PI), pillar);
    for (let i = 4; i--;)
        new Orb(i*PI/2, hsl(i/4,1,.6));
}

/* info
Four glowing orbs circle a dim hall of pillars, each one a lamp that
lights what is near it, and bloom from the post processing plugin makes
the bright parts of the picture glow. Drag to turn the camera and roll
the wheel to zoom. Left alone, the camera turns slowly by itself.

## How it works
Two things make a glow here. `emissive` makes an object bright whatever
the light on it, and bloom takes the bright pixels of the finished frame
and spreads them over their neighbors.

### Orb
An `Orb` is an `EngineObject3D` with a sphere mesh, `buildSphere(1.5)`,
1.5 units across.

- `emissive = 1` draws the orb in its own color with no shading, so it
  is bright even on the side away from the sun.
- `new Light3D(pos3D, radius, color)` is a point light that fades to
  nothing at its radius, 15 units here. `addChild` attaches it, and a
  child's `pos3D` is an offset from its parent, so `vec3()` keeps the
  light at the orb's center. The orb only looks like a lamp. The light
  is what lights the floor and the pillars.
- `update` runs every frame. It adds .01 radians to the orb's angle and
  places it at `vec3(6, 2 + sin(a*3)).rotateY(a)`: a point 6 units out
  on the x axis, bobbing between 1 and 3 units high, turned around the
  y axis by the angle. `vec3(x, y)` leaves z at 0.

### gameInit
- `setSky` is given two dark blues, and `sunColor` and `ambientColor`
  are turned down, so the scene is close to night and the orbs' lights
  show.
- `render3D.smoothShading = true` is the default for every builder's
  smooth argument. It is set before the meshes are built, so the
  spheres and pillars are shaded as round and not as flat faces.
- `new CameraControl3D(target, distance, pitch, idleSpin)` looks at a
  point 2 units up from 20 units away. The last number, .002, is how
  far it turns each frame while the mouse is not dragging.
- `postProcessBloom(threshold, strength, size)` sets up the bloom. The
  threshold is the brightness where the glow starts, from 0 for
  everything to 1 for only pure white. The strength is how much glow is
  added, and the size is how far it spreads in pixels. It is called
  after `new Render3DPlugin`.
- The floor is one grey `buildGrid`. One pillar mesh is built with
  `buildCylinder(1.5, 5)`, a diameter and a height, colored with
  `setColor`, and shared by six objects placed on a circle 11 units out.
  A cylinder is centered on its position, so y is 2.5 to stand a 5 unit
  pillar on the floor.
- The four orbs start a quarter turn apart, with hues a quarter of the
  color wheel apart.

## Try it
- Put `//` in front of the `postProcessBloom` line to see the scene
  with no bloom. Or raise its threshold from `.5` to `.9`, so less of
  the picture glows.
- Set `this.emissive` to `3`. Above 1 an object is brighter than its
  color, which gives the bloom more to spread.
- Make the lights reach farther and shine brighter:
  `new Light3D(vec3(), 30, color, 2)`.

## See also
3D Lights has more about `Light3D`, and Post Effects shows the other
built in screen effects in 2D. 3D Plugin in the full examples uses bloom
in a larger scene. Look up `postProcessBloom`, `Light3D` and `emissive`.
*/
