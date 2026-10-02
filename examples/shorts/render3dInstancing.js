class Cube extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, render3D.boxMesh);
        this.scale3D = vec3(.5);
        this.color = hsl(rand(),.7,.6);
        this.angleVelocity3D = randVector3(.02);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.4,.1), hsl(.7,.3,.3));
    render3D.setFog(30, 80);
    new CameraControl3D(vec3(), 40, .3, .002);

    // make a cloud of cubes sharing the same mesh, batched again each frame
    const cubeCount = 5000;
    for (let i = cubeCount; i--;)
        new Cube(randVector3(rand(4, 30)));

    // a shell of many more cubes kept on the GPU, they cost nothing until moved
    const shell = new InstancedMesh3D(render3D.boxMesh, 20000);
    for (let i = 0; i < shell.count; ++i)
    {
        const pos = randVector3(rand(35, 60)), rotation = randVector3(PI);
        shell.setTransformAt(i, pos, rotation, vec3(.4));
        shell.setColorAt(i, hsl(rand(), .4, .5));
    }
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles instancing
        render3D.instancing = !render3D.instancing;
}

function gameRenderPost()
{
    const state = render3D.instancing ? 'on' : 'off';
    const text = `space: instancing (${state}) / draws: ${drawCount}`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
    const note = '5000 cubes batched each frame, 20000 more kept on the GPU';
    drawTextScreen(note, vec2(mainCanvasSize.x/2, 75), 20);
}

/* info
A cloud of 5000 spinning cubes inside a shell of 20000 more, each of the
two sets drawn in one draw call. Space turns instancing off and on, and
the text shows how many draw calls the frame took. Drag to turn the
camera and roll the wheel to zoom.

## How it works
A draw call is one request to the graphics card, and each has a cost,
so thousands of them slow a frame down. Instancing sends one mesh once,
with a list of where each copy goes, and draws all the copies in one
call. The example shows the two ways the 3D plugin does this.

### Cube: batched by the engine
A `Cube` is a plain `EngineObject3D`. It uses `render3D.boxMesh`, the
shared box one unit across, made half that size with `scale3D`, and has
its own `color` and `angleVelocity3D`.

`randVector3(length)` returns a vector of that length in a random
direction, so `randVector3(.02)` is a spin of about .02 radians a frame
around a random mix of axes, and `randVector3(rand(4, 30))` is a place between
4 and 30 units from the middle.

Nothing in the class asks for instancing. With `render3D.instancing`
on, which is the default, the plugin gathers every opaque object that
uses the same mesh and draws them as one instanced call. It builds that
list again every frame, which is why the cubes are free to move and
spin.

### The shell: InstancedMesh3D
`new InstancedMesh3D(mesh, count)` is one object that holds many copies
and keeps their transforms on the graphics card.

- `setTransformAt(i, pos, rotation, scale)` places copy `i`. The
  rotation is in radians, and the positions are in world space.
- `setColorAt(i, color)` colors it.

After that the shell is uploaded once and costs almost nothing each
frame, until a copy is changed. That suits big sets that stay where
they are, like trees or rocks. The copies are not objects: they have no
`update` and can not be picked or collided with.

### The rest
`render3D.setFog(fogStart, fogEnd)` fades the scene into the fog color
between 30 and 80 units from the camera. `setSky` set that color to the
horizon's.

`gameUpdate` flips `render3D.instancing` when Space is pressed. With it
off, every cube on screen is a draw call of its own, while the shell
stays one call. `drawCount` is the engine's count of draw calls this
frame, and `gameRenderPost` shows it with `drawTextScreen`, which draws
text in screen space, over the 3D scene.

## Try it
- Press Space and compare the draw count, and the frame rate if your
  machine shows a difference.
- Pack the cubes into a small ball: `rand(4, 30)` to `rand(4, 10)`.
- Spin them ten times faster with `randVector3(.2)`.
- Stretch the shell's cubes into sticks: change `vec3(.4)` in
  `setTransformAt` to `vec3(.2, 4, .2)`.
- Turn the fog off with `render3D.setFog(0, 0)`. A `fogEnd` of 0
  disables it.

## See also
3D Racing Game draws its trees in one batch the same way as the cubes,
and 3D Plugin in the full examples draws a forest with instancing. Look
up `InstancedMesh3D`, which also has `setTransforms` for moving many
copies every frame, and `render3D.instancing`.
*/
