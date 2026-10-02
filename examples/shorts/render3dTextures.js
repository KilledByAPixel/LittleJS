// paint a brick pattern using an offscreen canvas
function makeBrickTexture()
{
    const size = 64, context = createCanvasContext(size);
    context.fillStyle = hsl(.05,.4,.3);
    context.fillRect(0, 0, size, size);
    context.fillStyle = hsl(.05,.5,.5);
    for (let row = 4; row--;)
    for (let col = 5; col--;)
        context.fillRect(col*32 + (row&1)*8 - 8, row*16, 30, 14);
    return new TextureInfo(context.canvas, true, true); // wrap, so uvs repeat
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.5), hsl(.6,.5,.8));
    render3D.shadows = true;
    new CameraControl3D(vec3(0,1,0), 14, .4, .002);

    // one texture, repeated across the floor and wrapped around shapes
    const bricks = makeBrickTexture();
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1).scaleUVs(8), bricks);
    const shapes =
    [ buildBox(2), buildSphere(2), buildCylinder(2, 2), buildTorus(3, 1) ];
    for (let i = shapes.length; i--;)
    {
        const pos = vec3(i*3.5 - 5.25, 1.5, 0);
        const shape = new EngineObject3D(pos, shapes[i].scaleUVs(2), bricks);
        shape.angleVelocity3D = vec3(0, .01);
    }

    // a tile from the sheet on a standing quad, the shadow takes its shape
    const signPos = vec3(0, 2.5, -5), signMesh = render3D.planeMeshDoubleSided;
    const sign = new EngineObject3D(signPos, signMesh, tile(3, 16));
    sign.scale3D = vec3(5);
    sign.rotation3D = vec3(PI/2, 0, 0);
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles mipmaps
        render3D.mipmaps = !render3D.mipmaps;
}

function gameRenderPost()
{
    const mipmaps = render3D.mipmaps ? 'on' : 'off';
    const text = `space: mipmaps (${mipmaps})`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 40, BLACK);
}

/* info
Textures on 3D meshes: one brick pattern, painted in code, repeated
across the floor and wrapped around a box, a ball, a cylinder and a
torus, and a tile from the sheet on a standing sign. Space turns
mipmaps off and on. Drag to turn the camera and roll the wheel to zoom.

## How it works
Every vertex of a mesh has a texture coordinate, its uv, which says
what point of the image belongs there. The builders give their shapes
uvs from 0 to 1, so by default the whole image is stretched over a
shape, or over each face of a box. Two things change that here: a
texture that wraps, and uvs scaled past 1.

### makeBrickTexture
`createCanvasContext(size)` makes a canvas that is not on the page, and
a 2D context to draw on it. The function fills it with a dark color and
then draws rows of lighter rectangles for bricks, every other row
shifted by 8 pixels.

`new TextureInfo(image, useWebGL, wrap)` turns the canvas into a
texture. The third argument, `wrap`, is what matters: with it a uv past
1 starts the image again, and without it the texture's edge would be
stretched.

### gameInit
`new EngineObject3D(pos3D, mesh, tileInfo, color)` takes the texture as
its third argument. That can be a whole `TextureInfo`, as with the
bricks, or a tile cut from a sheet with `tile(...)`.

- `scaleUVs(8)` multiplies every uv of the floor's mesh by 8, so the
  image repeats 8 times across its 20 units. It changes the mesh in
  place and returns it.
- The shapes are `buildBox(size)`, `buildSphere(size)`,
  `buildCylinder(size, height)` and `buildTorus(size, tubeSize)`, each
  with its uvs scaled by 2. They are built here and not taken from the
  shared `render3D.boxMesh` and `render3D.sphereMesh`: scaling a shared
  mesh's uvs would change every object that uses it.
- The sign is `render3D.planeMeshDoubleSided`, a flat square one unit
  wide that is seen from both sides. It lies flat as built, so
  `rotation3D = vec3(PI/2, 0, 0)` pitches it up to stand, and `scale3D`
  makes it 5 units wide. Its texture is `tile(3, 16)`. The tile's see
  through pixels are not drawn, and with `render3D.shadows` on the
  sign's shadow takes the same shape.

### Mipmaps
A texture seen far away or at a slant covers fewer pixels than it has,
and picking single pixels from it shimmers as the camera moves.
Mipmaps are smaller copies of the image made ahead of time, and the
renderer reads the one that fits. `render3D.mipmaps` is on by default.
`gameUpdate` flips it when Space is pressed, and `gameRenderPost` shows
its state with `drawTextScreen`.

## Try it
- Change the floor's `scaleUVs(8)` to `scaleUVs(2)` for big bricks.
- Change `new TextureInfo(context.canvas, true, true)` to end in
  `false`, and see what scaled uvs do to a texture that does not wrap.
- Change the brick color `hsl(.05,.5,.5)` to `hsl(.6,.5,.5)`.
- Change `tile(3, 16)` to `tile(3, 128)` for the big logo.

## See also
Texture and Texture Wrapped are the 2D side of this. 3D Materials adds
normal maps and glowing maps, 3D Billboards draws tiles that face the
camera, and 3D Mesh loads models that bring their own textures.
*/
