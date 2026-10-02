class Spinner extends EngineObject3D
{
    constructor(pos, color)
    {
        super(pos);
        this.color = color;
        this.scale3D = vec3(1.5);
        this.angleVelocity3D = vec3(.01, .02);
    }
}

let spinners = [];

function buildShapes()
{
    // builders use render3D.smoothShading by default
    const box = buildBox(vec3(1));
    const oct = buildLathe([[0,-1], [1,0], [0,1]], 4);
    const cylinder = buildCylinder(1, 2);
    const vase = buildLathe([[0,-1], [.4,-.2], [.7,.2], [.4,.6], [0,1]], 8);
    const sphere = buildSphere();
    const hull = buildLoft([[1,.4,.2,-.1], [0,2,.5,-.4], [-1,1,.3,-.3]]);
    const torus = buildTorus(1.4, .5);
    const cone = buildCone(1.4, 1.6);
    const cap = buildCapsule(.8, 2);

    // make a spinner for each shape
    const meshes = [box, oct, cylinder, vase, sphere, hull, torus, cone, cap];
    spinners.forEach((s, i)=> s.setMesh(meshes[i]));
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky();
    render3D.shadows = true;
    new CameraControl3D(vec3(0,1,0), 15, .4, .003);

    // checkerboard floor
    const checker = (x, z)=> hsl(.3, .2, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, checker));

    // ring of shapes
    for (let i = 9; i--;)
    {
        const a = i/9*2*PI;
        const pos = vec3(6, 3).rotateY(a);
        const spinner = new Spinner(pos, hsl(i/9,.7,.6));
        spinners.push(spinner);
    }
    buildShapes();
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles shading
    {
        render3D.smoothShading = !render3D.smoothShading;
        buildShapes();
    }
    for (const s of spinners) // S toggles specular
        s.specular = keyIsDown('KeyS') ? 1 : 0;
}

function gameRenderPost()
{
    const shading = render3D.smoothShading ? 'smooth' : 'flat';
    const text = `space: shading (${shading}) / hold S: specular`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}

/* info
Nine shapes from the mesh builders, turning in a ring above a
checkerboard floor, lit by the sun with shadows. Space switches between
flat and smooth shading, and holding S gives every shape a highlight.
Drag to turn the camera and roll the wheel to zoom.

## How it works
A builder is a function that returns a `Mesh`, centered on the origin.
Sizes are full sizes: a diameter, never a radius.

### The builders
`buildShapes` makes one mesh with each of these:

- `buildBox(size)` takes a `vec3` or a number for a cube.
- `buildLathe(profile, sides)` spins an outline around the y axis. The
  profile is a list of `[radius, y]` points from bottom to top. Three
  points and 4 sides make the eight sided diamond, and five points and 8
  sides make the vase.
- `buildCylinder(size, height)` and `buildCone(size, height)` stand on
  the y axis, and `buildSphere()` is one unit across when given nothing.
- `buildLoft(stations)` makes a hull from slices along z, each one
  `[z, width, top, bottom]`, listed from the largest z to the smallest.
- `buildTorus(size, tubeSize)` is a ring 1.4 across, measured to its
  outside edge, with a tube .5 thick.
- `buildCapsule(size, height)` is a cylinder with a half sphere on each
  end. The height includes the ends, so it can not be less than the size.

The round builders are all `buildLathe` underneath, and take a `smooth`
argument that defaults to `render3D.smoothShading`. Flat shading lights
each face on its own, and smooth shading blends the light across the
faces. `buildBox` and `buildLoft` have flat faces either way.

### Spinner
Each shape is a `Spinner`, an `EngineObject3D` made with no mesh. It has
a color, `scale3D = vec3(1.5)` to draw one and a half times the mesh's
size, and `angleVelocity3D`, which is added to its rotation every frame.
`vec3(.01, .02)` is pitch and yaw, and the third number, roll, is 0 when
left out.

`gameInit` puts nine of them on a circle: `vec3(6, 3).rotateY(a)` is a
point 6 units out and 3 up, turned around the y axis by `a`. Then
`buildShapes` gives each its mesh with `setMesh`.

### Changing the shading
The shading is part of the mesh, so changing `render3D.smoothShading`
does nothing to meshes already built. Space flips the setting and calls
`buildShapes` again. `setMesh` swaps in the new mesh and frees the old
one's GPU buffer when no other object draws it.

`specular` is how strong an object's highlight is, from 0 to 1, and it is
set every frame from `keyIsDown('KeyS')`.

`drawTextScreen` in `gameRenderPost` draws the help text in pixels, 40
down from the top of the canvas and 30 pixels tall.

## Try it
- Change the diamond's sides from `4` to `16` for two cones base to base.
- Give the vase `32` sides in place of `8`.
- Make the torus thin: `buildTorus(1.4, .2)`.
- Round the box with a bevel: `buildBox(vec3(1), .2, 4)`.
- Spin faster around one axis: `vec3(0, .05)`.

## See also
3D Basics explains the sky, the shadows, the camera and the floor used
here. 3D Mesh Operations cuts, joins and bevels the same builders, and
3D Text has `buildText3D` and `buildExtrude`.
*/
