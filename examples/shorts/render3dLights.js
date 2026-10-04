let lampMesh; // one mesh all the lamps share

class Lamp extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), lampMesh);
        this.color = color;
        this.orbitAngle = angle;
        this.emissive = 1; // drawn in its own color so it looks bright
        const light = new Light3D(vec3(), 6, color, 2);
        light.glow = 2.5; // a hazy glow around the lamp
        this.addChild(light); // follows the lamp
    }
    update()
    {
        // move around in a circle while bobbing up and down
        const a = this.orbitAngle += .01;
        this.pos3D = vec3(5, 2 + sin(a*3)).rotateY(a);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.03), hsl(.6,.4,.08));
    render3D.sunColor = hsl(.6,.2,.15); // dim sunlight
    render3D.ambientColor = hsl(.6,.2,.1);
    render3D.smoothShading = true;
    new CameraControl3D(vec3(0,1,0), 15, .5, .002);

    // make floor and pillars
    new EngineObject3D(vec3(), buildGrid(vec2(24), 12, hsl(0,0,.6)));
    const pillar = buildCylinder(1, 3).setColor(hsl(0,0,.7));
    for (let i = 8; i--;)
        new EngineObject3D(vec3(7, 1.5).rotateY(i/8*2*PI), pillar);
    new EngineObject3D(vec3(0,1,0), buildBox(2).setColor(hsl(0,0,.8)));

    // make three lamps with colored point lights
    lampMesh = buildSphere(.4, 8, 4);
    for (let i = 3; i--;)
        new Lamp(i*2, hsl(i/3,1,.6));

    // make a directional light shining in from its position
    new DirectionalLight3D(vec3(1,1,.5), hsl(.6,1,.3));
}

/* info
Three colored lamps circle a dark hall of pillars, each lighting what is
near it, with a dim blue light from the side filling in the rest. Drag
to turn the camera and roll the wheel to zoom.

## How it works
A 3D scene always has the sun and the ambient light. `Light3D` objects
add to them. A light is an `EngineObject3D`, so it can be moved,
attached to another object, or destroyed like anything else.

### Lamp
A light draws no lamp, so `Lamp` is the thing you see and the light is
its child.

- The lamp's mesh is `lampMesh`, built once in `gameInit` with
  `buildSphere(.4, 8, 4)`: .4 across, 8 sides around and 4 rings from
  top to bottom. The three lamps share it, as the pillars share theirs.
- `emissive = 1` draws it in its own color with no shading, so it looks
  lit from inside.
- `new Light3D(pos3D, radius, color, intensity)` is a point light. It
  shines every way and fades to nothing at its radius, 6 units. The
  intensity multiplies the color, and 2 is brighter than the color
  itself, which helps a light with a small radius since it fades fast.
- `light.glow = 2.5` draws a soft haze 2.5 units across over the light.
- `addChild(light)` attaches it. A child's `pos3D` is an offset from its
  parent, and `vec3()` keeps the light at the lamp's center.

`update` runs every frame. It adds .01 to the lamp's own `orbitAngle`
and sets the position to `vec3(5, 2 + sin(a*3))` turned around the y
axis by that angle: a circle 5 units out, rising and falling by one unit
three times each time around.

### gameInit
The scene is made dark so the lamps show. `setSky` gets two nearly black
blues, `sunColor` is the sun's light turned down to a dim blue gray, and
`ambientColor` is the soft light from above, replacing the one `setSky`
took from the sky.

`render3D.smoothShading = true` comes before the builders, since it is
the default for their `smooth` argument. The pillars are one mesh from
`buildCylinder(1, 3)`, 1 across and 3 tall, used by eight objects on a
circle 7 units out, with a box in the middle. `setColor` colors a mesh
itself, where an object's `color` tints one use of it.

The loop makes three lamps. The first argument is where on the circle
each starts, in radians, and `hsl(i/3,1,.6)` spaces their hues a third
of the color wheel apart.

`new DirectionalLight3D(pos3D, color, intensity)` shines from far away
with no falloff, like a second sun. Only the direction from the origin
to its position counts: it shines from there toward the origin, so
`vec3(1,1,.5)` lights the scene from above on the +x side.

Up to 8 lights are used at a time, the ones nearest the camera. None of
these lights casts a shadow. Only the sun does, or one spotlight set as
`render3D.shadowLight`, and shadows are not turned on here.

## Try it
- Make the lights reach farther: the radius `6` to `12`.
- Set `light.glow` to `0` to see the lamps without their haze.
- Six lamps: `let i = 3` to `let i = 6`, with `new Lamp(i, ...)` and
  `hsl(i/6,1,.6)`.
- Turn the sun up: `hsl(.6,.2,.15)` to `hsl(.6,.2,1)`, and compare how
  much the lamps add.

## See also
3D Basics has one light with shadows from the sun, and 3D First Person
has a spotlight that casts them. 3D Glow adds bloom to bright things,
and Light System is the 2D kind of light.
*/
