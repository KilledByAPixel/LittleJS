let sky, ring;
const sunWay = vec3(-.5,.4,-.75).normalize();

// the color of the world each way, d a unit vector: the sky with a
// glow toward the sun, the sun, clouds, mountains around the horizon
// and the ground below, each blended in over a soft edge, since a
// hard one shows the pixels of the map as steps
function skyColor(d)
{
    const angle = atan2(d.z, d.x);
    const sun = d.dot(sunWay);
    let c = hsl(.58, .7, .75 - d.y*.3 + max(0, sun)**8*.3);
    c = c.lerp(hsl(.12, 1, .95), clamp((sun - .997)*500));
    const cloud = sin(angle*5 + d.y*9)*sin(d.y*20) - .7;
    c = c.lerp(hsl(.6, .2, .9), clamp(cloud*10)*clamp((.5 - d.y)*10));
    const ridge = .05 + .04*sin(angle*3) + .02*sin(angle*8 + 1);
    c = c.lerp(hsl(.6, .2, .3 + d.y*2), clamp((ridge - d.y)*200));
    return c.lerp(hsl(.25, .3, .3 + d.y*.2), clamp(-d.y*200));
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.58,.7,.45), hsl(.58,.7,.75), hsl(.25,.3,.3));
    render3D.sunDirection = sunWay;
    new CameraControl3D(vec3(0,1.5,0), 12, .3, .003);

    // one cube map, drawn as the sky and reflected by shiny things
    sky = makeCubeMap(256, skyColor);
    render3D.skyBox = render3D.environment = sky;

    const base = new EngineObject3D(vec3(0,-.25,0),
        buildCylinder(12, .5, 48), undefined, hsl(.6,.1,.2));
    base.reflectivity = .2;

    // chrome: a black surface that is all reflection
    const chrome = new EngineObject3D(vec3(0,1.5,0),
        buildSphere(3, 48, 24, true), undefined, BLACK);
    chrome.reflectivity = 1;
    chrome.shininess = 1e4;

    // gold: its own color, reflecting more at the edges
    ring = new EngineObject3D(vec3(0,1.5,0),
        buildTorus(5, .5, 48, 16, true), undefined, hsl(.12,.9,.5));
    ring.reflectivity = .25;
    ring.shininess = 200;
    ring.specular = 1;

    // a row from sharp to rough: shininess blurs the reflection
    const shininess = [1e4, 1e3, 100, 10, 1];
    shininess.forEach((s, i)=>
    {
        const ball = new EngineObject3D(vec3(i*2 - 4, .6, 4),
            render3D.sphereMesh, undefined, hsl(.6,.1,.3));
        ball.scale3D = vec3(1.2);
        ball.reflectivity = .8;
        ball.shininess = s;
    });
}

function gameUpdate()
{
    ring.rotation3D = vec3(time*.5, time*.3, 0);
    if (keyWasPressed('KeyE'))
        render3D.environment = render3D.environment ? undefined : sky;
    if (keyWasPressed('KeyB'))
        render3D.skyBox = render3D.skyBox ? undefined : sky;
}

function gameRenderPost()
{
    const text = 'E: environment   B: sky box';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
Reflections: a chrome ball, a gold ring and a row of balls from polished
to rough, all reflecting a sky painted in code. E turns the environment
off and on, B the sky box. Drag to turn the camera and roll the wheel
to zoom.

## How it works
### The cube map
A `CubeMap` is six square images, one for each way along the axes, and
together they hold a color for every direction around a point.

`makeCubeMap(size, colorOf)` paints one with no image files. It calls
the function once for every pixel of every face, with the direction
that pixel looks along as a unit `Vector3`, and keeps the `Color` it
returns. 256 pixels a face is six times 65536 calls, which takes a
moment once at the start.

`skyColor` is that function. It starts with the sky, lighter toward
the horizon and glowing toward the sun, then lays each part over it
with `lerp`:
- the sun, where the direction is within a hair of `sunWay`, which
  `dot` says;
- bands of cloud from two `sin` waves;
- a ridge of mountains, its height from `atan2` of the direction, the
  angle around the horizon, through `sin` waves that end where they
  start;
- the ground, below level where `d.y` is negative.

Each is blended in over a narrow edge with `clamp` rather than switched
on, since a hard edge shows the map's pixels as steps.

### The sky box and the environment
- `render3D.skyBox` draws a cube map behind everything, in place of the
  sky dome `setSky` would draw.
- `render3D.environment` is what reflective surfaces reflect. With none,
  they reflect the three colors `setSky` was given.

The short sets both to the same map, so the reflections match what is
around them. `setSky` is still called, for the ambient light and as the
reflection with the environment off.

### The materials
- `reflectivity` is how much of the surface is reflection, more at a
  glancing angle. The chrome ball is `BLACK` with `reflectivity = 1`,
  all mirror.
- `shininess` is how sharp the reflection is, as sharp as the
  highlight it also sets: 10000 is a mirror, 1000 polished, 10 a wide
  blur. The row of balls goes from 10000 down to 1, ten times rougher
  each.
- The gold ring keeps its own color and reflects half, with a
  `specular` highlight from the sun on top.

## Try it
- Set `chrome.shininess` to `8` for brushed metal.
- Change the ring's `reflectivity` to `1` to see its color go.
- Change `hsl(.12, 1, .95)` for the sun to `hsl(0, 1, .5)`.
- Make the cube map `16` pixels a face and the sky goes soft, while the
  rough balls hardly change.

## See also
3D Materials has normal maps, highlights and glowing windows, and 3D
Water uses `reflectivity` on waves. 3D Lens Flare puts a flare on the
sun.
*/
