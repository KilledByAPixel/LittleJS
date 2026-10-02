const color = (h, s, l)=> hsl(h, s, l).toString(false);

// a prefab is a level: objects about its own origin, the ground at 0
const prefab = {littlejs3D: 1, objects: [
    {id: 1, type: 'Box', pos: [0, 1, 0], scale: [2, 2, 2],
        properties: {color: color(.08, .3, .6)}},
    {id: 2, type: 'Cylinder', pos: [0, 2.4, 0], scale: [2.6, .8, 2.6],
        properties: {color: color(0, .5, .4)}},
    {id: 3, type: 'Sphere', pos: [0, 3.2, 0], scale: [.8, .8, .8],
        properties: {color: color(.15, .9, .6)}},
]};

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.shadows = true;
    render3D.sunDirection = vec3(-.4, 1, .6);

    // the ground is the game's own, not a part of the prefab
    const ground = new EngineObject3D(vec3(0, -.5, 0), render3D.boxMesh,
        undefined, hsl(.3,.3,.4));
    ground.scale3D = vec3(60, 1, 60);

    level3DLoad(prefab);
    new CameraControl3D(vec3(0, 2, 0), 14, .5, .003);
    render3D.camera.pos = vec3(0, 6, 12);
    render3D.camera.lookAt(vec3(0, 1.5, 0));
    levelEditor.open();
}

/* info
The 3D level editor as a prefab maker: the level here is the prefab, a
little tower. Build with Box, Sphere, Cylinder and Light, then Save
writes a file a game adds with `level3DLoadPrefab` and places as many
times as it likes. Escape leaves the editor to look around, where a drag
turns the camera, and Escape again goes back to editing.

In the editor: click selects, W, E and R move, rotate and scale with
handles, pick a type in the panel and click to place it, and the `?`
key lists every key.

## How it works
A prefab is a group of objects placed as one thing: a tower, a house, a
lamp post. In LittleJS a prefab is a small level, so the level editor
is also the tool that makes one, and this example is all the code that
takes.

### The prefab
`prefab` is a level as `level3DLoad` reads it: a list of `objects`, each
with an `id`, a `type`, a `pos` and a `scale`. Its objects are placed
about its own origin, with the ground at height 0, because that origin
is the point a game later gives when it places the prefab.

The three objects are built in types. Each is one unit across before
its `scale`, so the box is 2 units a side with its center 1 up, sitting
on the ground, with a wide flat cylinder and a small sphere on top. A
color in a level is a hex string, which the `color` helper writes from
`hsl`.

### gameInit
- The sky, shadows and sun are set on `render3D`, as in any 3D scene.
- The ground is an `EngineObject3D` the game makes itself. It is not in
  the level, so it is not saved into the prefab. It is there to give
  the tower something to stand on and cast a shadow on.
- `level3DLoad(prefab)` makes the objects, and hands the level to the
  editor, which edits that same object.
- `CameraControl3D` is the camera for looking around once the editor is
  left. The two `render3D.camera` lines after it aim the view the
  editor opens with.
- `levelEditor.open()` opens the editor and pauses the game.

### Using the file in a game
Save writes the level as JSON. A game loads it under a name, and the
name is then a type like `Box`: a level can hold objects of it, the
editor can place it, and code can make one with `level3DSpawn`.

```
await level3DLoadPrefab('Tower', 'tower.json');
level3DSpawn('Tower', vec3(10, 0, 0));
```

`level3DAddPrefab(name, prefab)` does the same from an object already
in the code, like `prefab` here.

## Try it
- Select the sphere and move it, or place a `Light` beside the tower,
  then press Escape to look around it.
- Widen the roof in the code: `scale: [2.6, .8, 2.6]` to
  `scale: [4, .8, 4]`.
- Change the box's color from `color(.08, .3, .6)` to
  `color(.6, .5, .5)`.
- Lower the sun for longer shadows: `vec3(-.4, 1, .6)` to
  `vec3(-.4, .3, .6)`.

## See also
3D Level Editor shows the editor on a level with a player, coins and a
block map. In the editor, Ctrl+G turns a selection into a prefab inside
a level. Look up `level3DAddPrefab`, `level3DLoadPrefab` and
`level3DSpawn`.
*/
