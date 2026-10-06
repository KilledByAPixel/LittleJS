let sky, scene, chrome, ring, mode = 0;
const modes = ['the scene', 'the sky', 'nothing'];
const sunWay = vec3(-.4,.45,.8).normalize();

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

    // a cube map painted in code, drawn as the sky
    sky = makeCubeMap(256, skyColor);
    render3D.skyBox = sky;

    // and one with no faces, drawn from the scene for the chrome ball
    scene = new CubeMap(128);

    const base = new EngineObject3D(vec3(0,-.25,0),
        buildCylinder(12, .5, 48), undefined, hsl(.6,.1,.2));
    base.reflectivity = .2;

    // chrome: a black surface that is all reflection
    chrome = new EngineObject3D(vec3(0,1.5,0),
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
        mode = (mode + 1) % 3;
    // everything reflects the sky, and the chrome ball the scene
    render3D.environment = mode < 2 ? sky : undefined;
    chrome.environment = mode == 0 ? scene : undefined;

    // the scene seen from the chrome ball's middle, every frame since
    // the ring moves; the ball is not seen from inside, so it hides
    // nothing
    if (mode == 0)
        scene.capture(chrome.pos3D);
    if (keyWasPressed('KeyB'))
        render3D.skyBox = render3D.skyBox ? undefined : sky;
}

function gameRenderPost()
{
    const text = 'E: reflect ' + modes[mode] + '   B: sky box';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
Reflections: a chrome ball, a gold ring and a row of balls from polished
to rough, reflecting a sky painted in code, and the chrome ball the
scene around it. E goes between reflecting the scene, the sky alone and
nothing, B turns the sky box off and on. Drag to turn the camera and roll the
wheel to zoom.

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
around them. `setSky` is still called, for the ambient light and as
the reflection with nothing set.

### Reflecting the scene
`new CubeMap(128)` with no faces makes a cube map to draw the scene
into. `scene.capture(chrome.pos3D)` asks the next frame to draw it: six
views of everything, one each way from the middle of the chrome ball,
with the sky box behind them. The ball itself hides nothing, since a
mesh is not drawn from inside.

A captured map is right for the point it was seen from, so it is the
chrome ball's own: `chrome.environment = scene` reflects it in place of
`render3D.environment`, which the ring and the balls in the row go on
reflecting.

Capturing is six more draws of the whole scene, so a still scene does
it once. Here the ring turns, so `gameUpdate` captures every frame
while E is on the scene.

### The materials
- `reflectivity` is how much of the surface is reflection, more at a
  glancing angle. The chrome ball is `BLACK` with `reflectivity = 1`,
  all mirror.
- `shininess` is how sharp the reflection is, and it tightens the
  highlight too: 10000 is a mirror, 1000 polished, 10 a wide blur. The
  row of balls goes from 10000 down to 1, ten times rougher each.
  `roughness`, 0 a mirror to 1 matte as glTF measures it, is another
  way to set it.
- The gold ring keeps its own color and reflects a quarter, with a
  `specular` highlight from the sun on top.

## Try it
- Set `chrome.shininess` to `8` for brushed metal.
- Change the ring's `reflectivity` to `1` to see its color go.
- Change `hsl(.12, 1, .95)` for the sun to `hsl(0, 1, .5)`, then turn
  the camera to face it.
- Make the sky `16` pixels a face and it goes soft, while the rough
  balls hardly change.
- Capture once: change `if (mode == 0)` to `if (!scene.capturePos)`,
  which is set by the first capture, and the ring's reflection stops
  turning.

## See also
3D Materials has normal maps, highlights and glowing windows, and 3D
Water uses `reflectivity` on waves. 3D Lens Flare puts a flare on the
sun.
*/
