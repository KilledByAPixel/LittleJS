const modes = ['tilt shift', 'depth of field', 'off'];
let mode = 0, focus = .5, blur = 8;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.58,.5,.7), hsl(.58,.3,.9), hsl(.3,.3,.4));
    render3D.shadows = true;
    new CameraControl3D(vec3(), 34, .7); // high above, looking down

    // grass, then a little town of houses and trees in a loose grid
    new EngineObject3D(vec3(), buildGrid(vec2(64), 1, hsl(.3,.4,.45)));
    const trunk = buildCylinder(.4, 1.6, 8), leaves = buildSphere(1.8, 10, 6);
    const random = new RandomGenerator(7);
    for (let x = -24; x <= 24; x += 4)
    for (let z = -24; z <= 24; z += 4)
    {
        const pos = vec3(x + random.float(-1, 1), 0, z + random.float(-1, 1));
        if (random.bool(.6))
        {
            // a house, a box of a random height and color
            const height = random.float(1, 3);
            const color = hsl(random.float(), .5, .65);
            const house = new EngineObject3D(pos.add(vec3(0, height/2, 0)),
                render3D.boxMesh, undefined, color);
            house.scale3D = vec3(2, height, 2);
        }
        else
        {
            // a tree, a trunk and a ball of leaves
            new EngineObject3D(pos.add(vec3(0, .8, 0)), trunk, undefined,
                hsl(.08,.5,.35));
            new EngineObject3D(pos.add(vec3(0, 2.2, 0)), leaves, undefined,
                hsl(.33,.5,.4));
        }
    }

    // the effects read focus and blur from these values every frame,
    // so the mouse can move the focus without a new shader each time
    new PostProcessPlugin;
    postProcess.values = {focus, blur};
    setMode(0);
}

// switch effect, which makes the shader again, once for each switch
function setMode(newMode)
{
    mode = newMode;
    // the depth texture takes a pass of its own, so it is on only when
    // depth of field reads it
    render3D.depthTexture = mode == 1;
    focus = mode == 1 ? 34 : .5; // a distance, or a height on the screen
    postProcess.setShaderCode(postProcessEffects(
        mode == 0 ? postProcessTiltShift('focus', .2, 'blur') :
        mode == 1 ? postProcessDepthOfField('focus', 6, 'blur') : ''));
}

function gameUpdate()
{
    if (keyWasPressed('Space'))
        setMode((mode + 1) % modes.length);
    if (keyIsDown('ArrowUp'))
        blur = min(blur + .2, 16);
    if (keyIsDown('ArrowDown'))
        blur = max(blur - .2, 0);

    // where to focus: the band follows the height of the mouse, the lens
    // focuses on what is under it, its distance along the camera's view
    let target = focus;
    if (mode == 0)
        target = 1 - mousePosScreen.y / mainCanvasSize.y;
    else if (mode == 1)
    {
        const ray = render3D.screenToRay(mousePosScreen);
        const hit = render3D.pick(ray), camera = render3D.camera;
        if (hit)
            target = ray.getPosition(hit.distance).subtract(camera.pos)
                .dot(camera.getForward());
    }
    focus = lerp(focus, target, .15); // eased, as a lens racks its focus
    postProcess.values.focus = focus;
    postProcess.values.blur = blur;
}

function gameRenderPost()
{
    // screen text is on the 2D canvas, which the effects leave alone
    const how = mode == 0 ? 'the band follows the mouse' :
        mode == 1 ? 'focus on what is under the mouse' : '';
    const center = mainCanvasSize.x/2, bottom = mainCanvasSize.y;
    drawTextScreen(modes[mode] + (how && ' / ' + how), vec2(center, 40),
        30, WHITE, 4);
    drawTextScreen('space: next / up, down: blur ' + blur.toFixed(0) +
        ' / drag: turn', vec2(center, bottom - 40), 24, WHITE, 4);
}

/* info
Two post effects that blur part of the picture. Tilt shift keeps a band
across the screen sharp and blurs above and below it, which makes a
scene look like a small model. Depth of field keeps what is at one
distance sharp and blurs what is nearer and farther, as a camera lens
does. Press space to switch between them and off, move the mouse to
move the focus, and press up and down to change how much they blur.

## How it works
### The town
A grid of houses and trees with a little randomness in where each one
stands. A house is `render3D.boxMesh` scaled to its size; the trees
share one trunk mesh from `buildCylinder` and one ball of leaves from
`buildSphere`, so there are only two tree meshes however many trees
there are. `RandomGenerator(7)` gives the same town every time.

### The effects
`postProcessTiltShift(focus, size, blur)` and
`postProcessDepthOfField(focus, range, blur)` each return a piece of
shader code, which `postProcessEffects` makes into a shader for
`postProcess.setShaderCode`. Tilt shift reads only the screen, so it
works for 2D games too. Depth of field reads the 3D depth, so it needs
`render3D.depthTexture`, which `setMode` turns on only for it. It also
keeps the edges of what is in focus crisp: a blurred background does not
smear over a sharp object in front of it.

### Values that change every frame
A setting written as a number is fixed in the shader's code, and
changing it means making the shader again. Here focus and blur are
given as names instead, `'focus'` and `'blur'`, and
`postProcess.values` holds their numbers. The plugin hands every value
to the shader each frame, so `gameUpdate` changes them freely.

### The focus
For tilt shift the focus is a height on the screen, 0 at the bottom and
1 at the top, taken from `mousePosScreen`. For depth of field it is a
distance: `render3D.screenToRay` makes the ray under the mouse,
`render3D.pick` finds the first thing along it, and the distance to that
point along the camera's view, `camera.getForward()`, is the distance
depth of field measures. `lerp` eases the focus toward it, so it moves
smoothly as a real lens does.

## Try it
- Change `.2` in `postProcessTiltShift('focus', .2, 'blur')` to `.05`
  for a thin sharp band, a stronger model look.
- Change the `6` in `postProcessDepthOfField` to `20` to keep a deeper
  part of the town sharp.
- Add `postProcessVignette(.6)` after the effect in `setMode` to darken
  the corners, as a toy camera does.

## See also
Post Effects shows the other built in effects. 3D Ambient Occlusion and
3D Glow are more post processing on a 3D scene.
*/
