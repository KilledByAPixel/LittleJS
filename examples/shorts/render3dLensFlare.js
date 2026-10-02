let flare;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.6,.45), hsl(.08,.7,.75));
    render3D.sunDirection = vec3(-.6, .35, -1); // low, to look toward
    render3D.sunColor = hsl(.1,.6,.95);
    render3D.shadows = true;
    render3D.shadowCenter = vec3();
    render3D.shadowRange = 40;
    new CameraControl3D(vec3(0, 2, 0), 16, .1, .003);

    // a ground and a ring of pillars for the sun to go behind
    new EngineObject3D(vec3(), buildGrid(vec2(60), 1, hsl(.3,.3,.35)));
    for (let i = 12; i--;)
    {
        const angle = i/12 * 2*PI, height = 3 + i%3*2;
        const pos = vec3(sin(angle)*9, height/2, cos(angle)*9);
        const pillar = new EngineObject3D(pos, render3D.boxMesh);
        pillar.color = hsl(.08,.2,.6);
        pillar.scale3D = vec3(1.2, height, 1.2);
    }

    // one line turns the flare on, it follows render3D.sunDirection
    flare = new LensFlare3D;

    // a lamp with a flare of its own, in the lamp's color
    const lamp = new Light3D(vec3(0, 3, 0), 16, hsl(.55,.9,.6));
    lamp.glow = 1.5;
    lamp.flare = true;
}

function gameUpdate()
{
    for (const [k, size] of [[1, .6], [2, 1], [3, 1.6]])
        keyWasPressed('Digit' + k) && (flare.flareSize = size);
    if (keyWasPressed('KeyC'))
        flare.count = flare.count < 12 ? flare.count + 4 : 3;
    if (keyWasPressed('KeyS'))
        flare.saturation = flare.saturation ? 0 : 1;
    keyWasPressed('KeyN') && ++flare.seed;
    if (keyWasPressed('KeyH'))
        flare.shapes = flare.shapes ? undefined : ['hex', 'hex', 'streak'];
}

function gameRenderPost()
{
    const sun = (flare.visible * 100 | 0) + '%';
    const colors = flare.saturation ? 'colors' : 'one color';
    const shapes = flare.shapes ? 'hexagons' : 'discs';
    const text = `size ${flare.flareSize} (1-3) / ${flare.count} ghosts (C)` +
        ` / ${colors} (S) / ${shapes} (H) / N: new / sun ${sun}`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 26);
}

/* info
The sun's lens flare: a glow at the sun and a row of discs and rings
across the screen, which fades when a pillar hides the sun. Drag to look
around; 1 to 3 set its size, C its count, S its colors, H its shapes and
N picks another arrangement. The lamp in the middle has a flare too.

## How it works
`new LensFlare3D` is the whole effect. It is an object, so once made the
engine updates and draws it, and `flare.destroy()` would take it away.
It finds the sun from `render3D.sunDirection`, which points toward the
sun, and draws its parts along the line from the sun through the middle
of the screen: a glow at the sun, then the smaller shapes, called
ghosts. They are added onto the picture after the 3D scene is drawn, and
it needs WebGL.

### The scene
- `setSky(top, horizon)` makes a blue sky that goes to orange at the
  horizon.
- `sunDirection = vec3(-.6, .35, -1)` is a low sun, so the camera can
  look toward it. Any length works, only the direction counts.
- `sunColor` tints the sunlight, and the flare takes that tint too.
- `shadows = true` has the sun cast shadows. `shadowCenter` fixes the
  shadowed area on the origin, where it would otherwise follow the
  camera, and `shadowRange` is its width in world units.
- `new CameraControl3D(target, distance, pitch, idleSpin)` looks at a
  point 2 units up from 16 away, only .1 radians above the horizon, and
  turns by .003 radians a frame when it is not being dragged. That slow
  turn carries the sun behind the tallest pillars, one after another.

The ground is `buildGrid` with one cell, 60 units wide. The twelve
pillars are `render3D.boxMesh`, a box one unit across, stretched with
`scale3D` to 3, 5 or 7 units tall and stood on a circle 9 units out.

### Hiding the sun
Each frame the flare sends a ray from the camera toward the sun and
checks it against the objects in the scene, each one as the box around
its mesh. `flare.visible` moves toward 1 while the sun is in view and
toward 0 while something is in the way, over `flare.fadeTime`, .15
seconds. That is why the flare fades in and out and does not blink.
The text at the top shows `visible` as a percentage.

### The keys
`gameUpdate` changes the flare's fields, and the next frame shows it.

- `flareSize` scales every part. Keys 1 to 3 set it to .6, 1 and 1.6.
- `count` is the number of ghosts. C adds 4 until it is 12 or more, then
  goes back to 3.
- `saturation` is how colorful the ghosts are: 1 gives each its own hue,
  and 0 makes them all the flare's color.
- `seed` picks the arrangement. The ghosts' places, sizes and shapes are
  random numbers from the seed, so N gives a different flare each time.
- `shapes` is the list the ghosts are picked from: `glow`, `disc`,
  `ring`, `hex`, `streak` and `star`. H makes two in three a hexagon
  and the rest streaks, or sets it back to discs, rings and glows.

### The lamp
A `Light3D` gets a flare with `lamp.flare = true`. It sits at the lamp,
takes the lamp's color, and hides when a pillar is in front of the lamp.
`lamp.flare` is then a `LensFlare3D` like the sun's, with the same
fields, and it goes when the lamp is destroyed.

## Try it
- Make the flare with arguments, `(size, count, intensity, saturation)`:
  `new LensFlare3D(1.5, 10, .7, 0)`.
- Lower the sun: `vec3(-.6, .35, -1)` to `vec3(-.6, .1, -1)`.
- A red sun: `render3D.sunColor = hsl(0,.8,.7);`
- Make every pillar tall: `height = 3 + i%3*2` to `height = 8`.
- No glow at the sun, only ghosts: `flare.glowSize = 0;`
- Bigger ghosts: `flare.ghostSize = 2;`
- A star on the lamp, after `lamp.flare = true;`:
  `lamp.flare.shapes = ['star'];`

## See also
3D Lights for lamps with a glow of their own, and 3D Glow for bloom over
the whole picture. `flare.occlusion = false` stops things hiding it,
and `flare.elements` takes a list of parts of your own, each a shape or
a tile of your own with `tileInfo`.
*/
