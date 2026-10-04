// an example obj model, a simple house with a roof
const houseOBJ = `
v -1 0 -1
v  1 0 -1
v  1 0  1
v -1 0  1
v -1 1.2 -1
v  1 1.2 -1
v  1 1.2  1
v -1 1.2  1
v  0 2.2 -.8
v  0 2.2  .8
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
f 1 2 3 4
f 5 8 10 9
f 7 6 9 10
f 5 9 6
f 7 10 8
`;

const modelSize = 5;
let model, asset, modelName = 'house'; // asset: the Mesh or GLTFModel shown

function gameInit()
{
    new Render3DPlugin;
    // a gray sky and ground, so the lighting adds no hue of its own
    // and the model's colors show as they are
    render3D.setSky(hsl(0, 0, .6), hsl(0, 0, .85), hsl(0, 0, .4));
    render3D.shadows = true;
    // the shadow map covers just the model, so it is sharp at this distance
    render3D.shadowMapSize = 2048;
    render3D.shadowRange = modelSize * 2;
    render3D.shadowCenter = vec3(0, modelSize/2, 0);
    new CameraControl3D(vec3(0,1,0), 10, .4);

    // checkerboard floor and the model
    const checker = (x, z)=> hsl(0, 0, (x+z)/2&1 ? .6 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 10, checker));
    setModel(parseOBJ(houseOBJ));

    // drop an .obj, a .glb, or a .gltf with its files or its folder
    const stop = (e)=> e.preventDefault();
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', async (e)=>
    {
        stop(e);
        const items = droppedFiles(e.dataTransfer); // read before awaiting
        let name = 'the drop';
        try
        {
            const files = await items, [path, file] = [...files].find(
                ([path])=> /\.(obj|glb|gltf)$/i.test(path)) || [];
            if (!file) return;
            name = file.name;
            if (/\.obj$/i.test(path))
                setModel(parseOBJ(await file.text()));
            else // a .gltf finds its files from its own folder in the drop
                setModel(await parseGLTF(await file.arrayBuffer(),
                    path.slice(0, path.lastIndexOf('/') + 1), files));
            modelName = name;
        }
        catch (error) { modelName = name + ' failed: ' + error.message; }
    });
}

// every file of a drop by its path in the dropped folder, the files a .gltf
// names are found from its own folder
async function droppedFiles(dataTransfer)
{
    const files = new Map, add = (path, file)=> files.set(path, file);
    const loose = [...dataTransfer.files]; // gone after the first await
    const read = async (entry, path)=>
    {
        if (entry.isFile)
            return add(path + entry.name,
                await new Promise((ok, fail)=> entry.file(ok, fail)));
        // a folder's files, read a batch at a time until none are left
        const reader = entry.createReader(), inside = path && path + '/';
        for (let batch; (batch = await new Promise((ok, fail)=>
            reader.readEntries(ok, fail))).length;)
            for (const child of batch)
                await read(child, child.isFile ? inside :
                    inside + child.name);
    };
    const entries = [...dataTransfer.items]
        .map((item)=> item.webkitGetAsEntry?.()).filter((entry)=> entry);
    // a folder dropped alone is the top of the paths, one dropped with
    // other files is a folder in them, its name kept
    for (const entry of entries)
        await read(entry, entry.isFile || entries.length < 2 ? '' : entry.name);
    if (!files.size) // a browser that gives no entries gives the files
        for (const file of loose)
            add(file.name, file);
    return files;
}

// show a Mesh or a GLTFModel: centered, scaled to size, standing on the floor
function setModel(loaded)
{
    // the model shown before goes, and what it was loaded into with it
    model?.destroy(true);
    asset?.dispose();
    asset = loaded;
    loaded.center().fit(modelSize);
    const pos = vec3(0, -loaded.getBounds().min.y, 0);
    if (loaded instanceof GLTFModel)
    {
        model = loaded.createObject(pos); // a child per part, windows and all
        loaded.animations.length && model.play(); // its first animation
    }
    else
        model = new EngineObject3D(pos, loaded, undefined, hsl(.1,.6,.7));
    model.angleVelocity3D = vec3(0, .005);
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles shading
    {
        render3D.smoothShading = !render3D.smoothShading;
        for (const o of [model, ...model.children])
            o.mesh?.computeNormals(render3D.smoothShading);
    }
}

function gameRenderPost()
{
    const text = 'drop an .obj, .glb or .gltf file / space: toggle shading / '
        + modelName;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}

/* info
A model viewer. It starts with a small house written as OBJ text in the
code, and shows any `.obj` or `.glb` file dropped on the page, or a
`.gltf` dropped with its `.bin` and image files, or in its folder.
Space switches between flat and smooth shading. Drag to turn the camera
and roll the wheel to zoom.

## How it works
### The OBJ text
OBJ is a model format made of lines of text. A `v` line is a vertex, its
x, y and z. An `f` line is a face, listing the vertices at its corners
by number, counting from 1. The house has 10 vertices: four on the
ground, four at the top of the walls and two along the ridge of the
roof. Its faces are four walls, a floor, two roof slopes and two
triangles for the gable ends.

`parseOBJ(text)` reads that into a `Mesh`. Faces can have any number of
corners, and they are listed counter clockwise seen from outside.

### gameInit
- `setSky` is given three greys, for the sky, the horizon and straight
  down, so the light adds no hue to the model.
- `render3D.shadows = true` has the sun cast shadows. The shadow map is
  an image drawn from the sun, `shadowMapSize` pixels a side, that
  covers `shadowRange` world units around `shadowCenter`. More pixels
  over less of the world make a sharper shadow, so the range is set to
  twice the model's size and the center to the middle of the model.
  Without a center, the shadow area follows the camera.
- The floor is a `buildGrid` whose color is a function, as in 3D
  Basics.

The rest is plain browser code: a `dragover` listener that lets a drop
happen, and a `drop` listener that reads the files. `droppedFiles`
gathers every file of the drop into a `Map`, the files inside a dropped
folder too, each by its path in that folder. The first model among them
is shown, and the model it replaces is disposed of. An `.obj` is read as
text for `parseOBJ`. Anything else is read as bytes for
`parseGLTF(data, folder, files)`, which returns a promise of a
`GLTFModel`, so it is awaited. A `.glb` holds everything, while a
`.gltf` names its `.bin` and image files: they are found in `files`
from its own `folder`, or by their names when only one file has it. An
error, such as a file it needs that was not dropped, ends up in the
text at the top.

### setModel
A file's model can be any size, anywhere. `center()` moves it so the
middle of its box is on the origin, and `fit(modelSize)` scales it so
its longest side is 5 units. Both exist on a `Mesh` and on a
`GLTFModel`. `getBounds()` gives the box, and lifting the model by
`-min.y` stands its lowest point on the floor.

- A `Mesh` goes into one `EngineObject3D`, with a color.
- A `GLTFModel` has parts, each with its own color and texture.
  `createObject(pos3D)` makes an object with a child for each part, and
  `play()` starts the model's first animation when it has one, a rigged
  character's walk included.

`model?.destroy(true)` removes the model shown before. Destroying an
object destroys its children too.

### gameUpdate
`render3D.smoothShading` is the default the mesh builders and
`parseOBJ` use. Changing it does nothing to a mesh that is already made, so
the loop calls `computeNormals(smooth)` on the model's mesh and on each
child's. Flat normals give every face a hard edge, smooth ones round
the light across the faces.

## Try it
- Change `modelSize = 5` to `2`. The shadow area shrinks with it.
- Raise the roof: change both `2.2` in the OBJ text to `3.5`.
- Change `shadowMapSize = 2048` to `128` to see a coarse shadow map.
- Change `vec3(0, .005)` to `vec3(0, .05)` to spin the model faster.

## See also
3D Shapes and 3D Mesh Operations make meshes in code. 3D Textures and
3D Materials cover what a glTF model's materials load into. Look up
`loadOBJ` and `loadGLTF` to fetch a model from a file beside your game.
*/
