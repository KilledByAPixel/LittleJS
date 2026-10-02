// for each pixel, pairs of depths on opposite sides a short way off;
// when both are nearer, it sits in a crease, a flat face has one nearer
// and one farther and stays lit; each pixel turns its pattern a little,
// so what the samples miss shows as fine grain, not as bands
const occlusion = `
void mainImage(out vec4 c, vec2 p)
{
    vec2 uv = p / iResolution.xy;
    vec3 color = texture(iChannel0, uv).rgb;
    float d = sceneDepth(uv), ao = 0.;
    vec2 reach = vec2(.35 * iResolution.y / d) / iResolution.xy;
    float turn = fract(52.98 * fract(dot(p, vec2(.0671, .00584)))) * 6.3;
    for (int i = 0; i < 16; i++)
    {
        float a = float(i) * 2.4 + turn, s = sqrt((float(i) + .5) / 16.);
        vec2 o = vec2(cos(a), sin(a)) * s * reach;
        float near = min(d - sceneDepth(uv + o), d - sceneDepth(uv - o));
        ao += clamp(near * 4., 0., 1.) * smoothstep(1., .3, near);
    }
    float shade = uv.x > .5 ? 1. - ao / 16. : 1.;
    c = vec4(color * shade + step(abs(uv.x - .5), .001), 1);
}`;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.35,.35), hsl(.6,.3,.7), undefined, .4);
    render3D.sunDirection = vec3(-.6,1,.4);
    render3D.depthTexture = true; // draw the depth for the post process
    new CameraControl3D(vec3(0,1,-1), 13, .5, .002);

    const stone = hsl(.08,.15,.65);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.1,.1,.55)));
    const box = (pos, size)=>
    {
        const o = new EngineObject3D(pos, render3D.boxMesh, undefined, stone);
        o.scale3D = size;
    };

    // a wall with stairs up it, boxes stacked in a corner, and an arch
    box(vec3(0,1.5,-4), vec3(12,3,1));
    for (let i = 0; i < 5; ++i)
        box(vec3(-5 + i*.8, .25 + i*.25, -3), vec3(.8, .5 + i*.5, 1));
    box(vec3(4,.5,-3), vec3(1)), box(vec3(5,.5,-3), vec3(1));
    box(vec3(4.5,1.5,-3), vec3(1)), box(vec3(5.5,.5,-2), vec3(1));
    for (const x of [-1, 1])
        box(vec3(x,1,0), vec3(.5,2,.5));
    box(vec3(0,2.2,0), vec3(2.5,.4,.6));

    // a ring lying on the floor
    new EngineObject3D(vec3(3.5,.25,1.5), buildTorus(2,.5,24,12), undefined,
        stone);

    new PostProcessPlugin(occlusion);
}

function gameRenderPost()
{
    const y = mainCanvasSize.y - 40, x = mainCanvasSize.x/4;
    drawTextScreen('plain', vec2(x, y), 30, WHITE, 4);
    drawTextScreen('ambient occlusion', vec2(x*3, y), 30, WHITE, 4);
}

/* info
Ambient occlusion from the depth texture: a post process darkens the
creases and corners, where nearby things block the light from around.
The left half is plain, the right half has it. Drag to turn the camera
and roll the wheel to zoom.

## How it works
Ambient light comes from every direction, so a point in a corner gets
less of it than a point in the open. A post process can not see the
scene, only the finished picture and how far away each pixel is. That
is enough: for a pixel, look at two pixels a short way off on opposite
sides. On a flat face seen at a slant one of them is nearer and the
other farther. In a crease both are nearer. So the smaller of the two
differences says how deep in a crease the pixel sits.

### gameInit
- `render3D.depthTexture = true` has the renderer draw the camera's
  depth into a texture each frame, for a post process to read. It is
  off by default.
- The fourth argument of `setSky` is how much of the sky's colors
  lights the scene as ambient light.
- The scene is boxes: `box` makes an
  `EngineObject3D(pos3D, mesh, tileInfo, color)` from the shared
  `render3D.boxMesh`, with `undefined` for no texture, and sets its
  `scale3D` to the size.
- `buildTorus(size, tubeSize, sides, tubeSides)` is the ring. Its tube
  is `.5` across and its center is at y `.25`, so it lies on the floor.
- `new PostProcessPlugin(occlusion)` runs the shader over the screen.
  It is made after `Render3DPlugin` because plugins draw in the order
  they are made, and this one shades what is on the canvas when its
  turn comes.

### The shader
`mainImage(out vec4 c, vec2 p)` is called for every pixel, with `p` its
position in pixels, and writes the color `c`. `uv` is the position as
0 to 1 across the screen. `iChannel0` is the picture, and
`sceneDepth(uv)` is how far in front of the camera that point is, in
world units.

- `reach` is how far off the samples are. Dividing by `d` makes it
  smaller in the distance, so it spans the same amount of the world
  near and far.
- The loop takes 16 pairs on a spiral. The angle `a` goes up by `2.4`
  radians a step and the distance `s` is a square root, which spreads
  the samples evenly over a disc.
- `turn` is an angle that differs from one pixel to the next. Every
  pixel turns its spiral by it, so what 16 samples miss shows as fine
  grain and not as bands.
- `near` is the smaller of the two differences, above 0 only when both
  samples are nearer than the pixel. `clamp(near * 4., 0., 1.)` counts
  it in full at a quarter of a unit. The `smoothstep` fades it out
  again from `.3` to `1.`: something that much nearer is another object
  in front, not a crease.
- `shade` is 1 on the left half and `1. - ao / 16.` on the right. The
  `step` at the end adds a white line down the middle.

`gameRenderPost` draws the two labels with `drawTextScreen`, whose
position and size are in screen pixels.

## Try it
- Change `uv.x > .5 ?` to `uv.x > 0. ?` to shade the whole picture.
- Replace `texture(iChannel0, uv).rgb` with `vec3(1)` to see the shade
  alone, on white.
- Change `.35 *` in `reach` to `1. *` and the dark reaches farther from
  each crease.
- Take `+ turn` off the angle to see the bands it hides.

## See also
Post Processing explains `mainImage` shaders, and 3D Glow is another
post process over a 3D scene. Look up `render3D.depthTexture` and
`PostProcessPlugin`.
*/
