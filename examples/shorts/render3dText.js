let title;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.4,.2), hsl(.9,.3,.4), hsl(.6,.2,.1));
    render3D.shadows = true;
    render3D.ambientColor = hsl(.6,.1,.4);
    new CameraControl3D(vec3(0,2,0), 16, .35, .002);

    // floor
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.6,.1,.3)));

    // create 3d text from extruded engine font
    title = new EngineObject3D(vec3(0,5,0), buildText3D('LITTLEJS', 2, 1));
    title.color = hsl(.1,1,.6);
    title.specular = 1;
    const captionMesh = buildText3D('3D TEXT\nFROM A BITMAP FONT', 1, .5);
    const caption = new EngineObject3D(vec3(0,2,0), captionMesh);
    caption.color = hsl(.6,1,.7);

    // tiles from the sheet extruded the same way
    for (let i = 4; i--;)
    {
        const pos = vec3(i*3 - 4.5, 1, 5);
        const mesh = buildExtrude(tile(i,16), vec2(2), 1 - i*.3);
        const sprite = new EngineObject3D(pos, mesh);
        sprite.angleVelocity3D = vec3(0, .02);
    }
}

function gameUpdate()
{
    // sway the title so the sides catch the light
    title.rotation3D.y = sin(time)*.5;
}

/* info
Text and sprites as solid 3D shapes: a title that sways, a caption of
two lines under it, and four tiles from the sheet turned into spinning
blocks. Drag to turn the camera and roll the wheel to zoom.

## How it works
Both kinds of shape come from pixels. Every solid pixel of an image
becomes a small block as deep as you ask, so a flat picture gets a
front, a back and sides.

### Text
`buildText3D(text, size, depth)` makes one mesh of the whole text from
the engine's built in font, which is a small image of letters. `size`
is the height of a character in world units and `depth` its thickness.
The text is centered on the mesh's origin and faces +z, toward where
the camera starts.

- The title is 2 units tall and 1 deep. The font's letters are white,
  so the object's `color` tints the text. `specular = 1` gives it a
  highlight.
- The caption has a `\n` in it, which starts a new line under the
  first.

The mesh is built once. To change what the text says, build a new mesh.

### Sprites
`buildExtrude(pixels, size, depth)` does the same with a tile.
`tile(i,16)` is tile `i` of the sheet, `vec2(2)` is the width and
height of the whole tile in world units, and the depth goes down by `.3`
for each one, from 1 to `.1`. A pixel counts as solid when it is more
than half opaque, and each one keeps its own color, so these objects
need no texture and no `color`.

`angleVelocity3D` is added to an object's rotation every frame.
`vec3(0, .02)` is a yaw of `.02` radians a frame, so the blocks turn
around the y axis.

### gameUpdate
`rotation3D.y` is the title's yaw. `sin(time)*.5` swings it half a
radian each way, and the sides of the letters catch the light as they
come into view.

## Try it
- Change `'LITTLEJS'` to your own text.
- Change the title's depth, the `1` after its size `2`, to `4`.
- Change `1 - i*.3` to `.1` to make every sprite a thin card.
- Change `tile(i,16)` to `tile(i+4,16)` for four other tiles.
- Set `render3D.shadows` to `false` to see what the shadows add.

## See also
3D Basics uses `buildText3D` in a first scene, and Image Font draws
the same font in 2D. 3D Billboards shows tiles as flat sprites, and
3D Shapes the other mesh builders.
*/
