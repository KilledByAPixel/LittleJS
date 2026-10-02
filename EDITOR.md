# Making your own level editor with LittleJS

LittleJS has two level editors built in, one for 2D tile maps and one for 3D levels. They are meant to be a
starting point: a game adds its own object types, properties, keys, buttons and tools, and ends up with an
editor made for that one game. Everything goes through one object, `levelEditor`, and the same calls work in
both editors.

This page is written to be followed by a person or by an AI coding assistant. Every code block marked "tested"
is run by `test/editorCustom.test.mjs` straight from this file, so it works as written.

## The rules

1. **Everything is on `levelEditor`**, or on a class of your own that extends `LevelEditor`. It is exported
   from every build, script tag and ES module alike.
2. **No guards are needed.** In release builds `LevelEditor` is a stub: it takes what you add and never calls
   it. The editor's code is only in the debug builds (`dist/littlejs.js`, `dist/littlejs.esm.js`).
3. **The level data is the source of truth.** The editor changes the level object (3D) or the Tiled map (2D) the
   game loaded, and brings the game's objects in line. Change the level through `edit3D` or `edit2D`, never the
   game's objects.
4. **An edit is a stroke.** Make changes with `edit3D.change(...)`, `edit3D.place(...)`, `edit2D.paint(...)` or
   `edit2D.changeObjects(...)`, then call `strokeEnd()`: that is one undo step, autosaved. A tool's press, drag
   and release are ended for you.
5. **A type is named by a string**, never by its class, because minified builds rename classes.
6. **Use `levelEditor.edit3D` and `levelEditor.edit2D` only inside what the editor calls**: a key's action, a
   button's click, a tool's callbacks, `onUpdate`, `onDraw`. In a release build they are undefined, and none of
   those are ever called.
7. **`levelEditor.is3D`** says which editor is in use, for a game that has both kinds of level.

## The hooks

```javascript
levelEditor.open();                    // start in the editor; close() plays on with the changes
levelEditor.isOpen;                    // true while editing
levelEditor.onRestart = ()=> buildLevel();         // adds a Restart button: load the level again
levelEditor.onPlayFrom = (pos)=> player.pos = pos; // adds "Play from mouse": put the player at the mouse
levelEditor.onOpen = ()=> {};          // the editor opened
levelEditor.onClose = ()=> {};         // it closed, the game plays on
levelEditor.onUpdate = ()=> {};        // each frame while it is open
levelEditor.onDraw = ()=> {};          // while it draws the level, for overlays of your own
levelEditor.onPanel = (box)=> {};      // once, when the panel is made: a box in it for your own controls
levelEditor.onSave = (text, name)=> false;     // Save: return true when you kept the file yourself
levelEditor.use3D = true;              // force the 3D editor (false, the 2D one); undefined picks by the level
levelEditor.onTile = (layer, pos, tile)=> {};  // 2D: a tile was painted, tile undefined when erased
levelEditor.paletteTiles = [0, 1, 10]; // 2D: the tiles the palette shows, undefined for the whole sheet
```

Without code, `0` on the debug overlay (`Esc`) opens the editor, and `Esc` then switches between editing and
playing.

## Your own object types, and their properties as panel inputs

A type is a name, something to make, and default properties. The editor lists the type to place, and shows an
input for each default whose value is a number, a true or false, a string, a `Color` or a vector. What the
level designer sets is saved in the level and set on the object when the level loads.

3D, tested:

<!-- test:type3d -->
```javascript
class Spawner extends EngineObject3D
{
    // a level type's class is made with (pos3D, properties)
    constructor(pos, properties)
    {
        super(pos, render3D.boxMesh, undefined, properties.color);
    }
}
level3DAddType('Spawner', Spawner, {rate: 2, enemy: 'bat', color: hsl(0, 1, .5), active: true});
level3DAddType('PlayerStart', (pos)=> playerStart = pos); // a function, for what is not an object
```

2D, tested:

<!-- test:type2d -->
```javascript
class Coin extends EngineObject
{
    constructor(pos) { super(pos, vec2(1)); }
}
objectLayersAddType('Coin', Coin, {value: 1});
```

- In 3D a class needs its own constructor that takes the position: one that passes every argument on to
  `EngineObject3D` would pass the properties as its mesh.
- `level3DAddMesh('Tree', mesh, tileInfo)` is a 3D type with no class: a static prop with `color` and `solid`.
- Changing a 3D object's property in the editor makes the object again, since its constructor takes them.
- 3D prefabs, small levels placed many times, are types too: see "Prefabs" in [REFERENCE.md](REFERENCE.md). The
  panel's Load prefab button adds one from a file to the level being edited.

## A key of your own

`addKey(key, action, helpLine)`. The key is a letter or digit (`'k'`), a key's name (`'Delete'`, `'F2'`), or
either with `'ctrl+'` in front. The action is called with whether Shift is held. Return `false` when it did
nothing. A key the editor already uses is replaced by yours, with a warning in the console.

3D, tested:

<!-- test:key3d -->
```javascript
// K lifts every selected object one unit, as one undo
levelEditor.addKey('k', ()=>
{
    const edit = levelEditor.edit3D;
    const changed = edit.change((list)=>
    {
        for (const object of list)
            if (edit.selection.has(object.id))
                edit.setTransform(object, edit.pos(object).add(vec3(0, 1, 0)));
    });
    edit.strokeEnd();
    return changed; // false when nothing was selected
}, 'K: lift the selection one unit');
```

2D, tested:

<!-- test:key2d -->
```javascript
// T paints tile 5 under the mouse on the selected tile layer, as one undo
levelEditor.addKey('t', ()=>
{
    const edit = levelEditor.edit2D;
    if (!edit.hover) return false; // the mouse is over no cell
    edit.paint(edit.hover, 5);
    edit.strokeEnd();
}, 'T: paint tile 5 under the mouse');
```

## A panel button of your own

`addButton(label, onClick, title)`. Tested:

<!-- test:button3d -->
```javascript
levelEditor.addButton('Scatter 5 spawners', ()=>
{
    const edit = levelEditor.edit3D;
    for (let i = 0; i < 5; ++i)
        edit.place('Spawner', vec3(rand(-8, 8), .5, rand(-8, 8)));
    edit.strokeEnd(); // the five are one undo
}, 'Put five spawners at random places');
```

For anything more than a button, `onPanel` gives you a box in the panel to fill with your own HTML.

## A tool of your own

`addTool(name, tool)` adds a tool beside the editor's own: a button in the panel by its name, and a key if you
give one. While it is on, the left button in the level is your tool's. Each callback is given
`{pos, cell, ray, shift, ctrl}`:

- `pos`: where the mouse is in the level. In 3D a `Vector3` on the level or the ground, in 2D a `Vector2`.
- `cell`: 2D, the tile cell under the mouse on the selected tile layer, or undefined.
- `ray`: 3D, the mouse's ray.

What the callbacks change is one undo: the editor ends the stroke at the release, and takes it back when the
right button or Escape ends the press. Do not call `strokeEnd` in a tool.

3D, a tool that lays a row of posts along a drag, tested:

<!-- test:tool3d -->
```javascript
let lastPost;
levelEditor.addTool('Posts',
{
    key: 'p',
    hint: 'Posts: drag along the ground to lay a row',
    onPress(at)
    {
        if (!at.pos) return false; // not on the level
        levelEditor.edit3D.place('Cylinder', lastPost = at.pos.add(vec3(0, .5, 0)));
    },
    onDrag(at)
    {
        // another post each 2 units along the drag
        if (at.pos && at.pos.distance(lastPost) >= 2)
            levelEditor.edit3D.place('Cylinder', lastPost = at.pos.add(vec3(0, .5, 0)));
    },
});
```

2D, a tool that paints a tile wherever it is dragged, Shift erasing, tested:

<!-- test:tool2d -->
```javascript
levelEditor.addTool('Water',
{
    key: 'w',
    hint: 'Water: drag to fill cells · Shift erases',
    onPress(at) { at.cell && levelEditor.edit2D.paint(at.cell, at.shift ? -1 : 7); },
    onDrag(at)  { at.cell && levelEditor.edit2D.paint(at.cell, at.shift ? -1 : 7); },
    onDraw(at)  { at.cell && drawRect(at.cell.add(vec2(.5)), vec2(1), hsl(.55, 1, .5, .4)); },
});
```

A tool is put down by its key or button again, or by picking one of the editor's own tools, layers or types.
`levelEditor.tool` is the name of the one that is on.

## An editor class of your own

Everything above can be a class instead, with the hooks as methods. Tested:

<!-- test:class -->
```javascript
class MyEditor extends LevelEditor
{
    constructor()
    {
        super();
        this.showZones = true;
        this.addKey('z', ()=> { this.showZones = !this.showZones; }, 'Z: show the spawn zones');
        this.addButton('Clear spawners', ()=> this.clearSpawners());
    }

    // the hooks are methods
    onRestart() { restarts++; }
    onDraw() { this.showZones && drawnZones++; }

    clearSpawners()
    {
        const edit = this.edit3D;
        edit.change((list)=>
        {
            for (let i = list.length; i--;)
                list[i].type === 'Spawner' && list.splice(i, 1);
        });
        edit.strokeEnd();
    }
}
setLevelEditor(new MyEditor);
```

- Call `setLevelEditor` before the editor opens, and use `levelEditor` itself afterwards, not a copy of it
  taken earlier.
- A method of your class is a hook the same as one you set: defining `onRestart` shows the Restart button.

## The edit functions

### `levelEditor.edit3D`

| Member | What it is |
| --- | --- |
| `level` | The level object being edited |
| `objects` | Its objects, the list in the level: read it, edit through `change` |
| `selection` | A `Set` of the selected objects' ids, yours to add to and delete from |
| `selected()` | The selected objects |
| `made(id)` | What the game made for an object |
| `change((list)=> {...})` | Edit a copy of the object list; false when nothing changed |
| `changePart(name, (part)=> newPart)` | Edit the level's `scene`, `voxels`, `terrain` or `prefabs` block |
| `strokeEnd()` | End the edit: one undo step, and the autosave |
| `strokeCancel()` | Take the edit being made back |
| `place(type, pos3D)` | Add an object of a type, selected; its id |
| `setTransform(object, pos3D, rotation, scale3D)` | Write a place, a rotation in degrees and a scale; leave one out to keep it |
| `setProperty(object, name, value)` | Write a property, left out of the file when it is the type's default |
| `pos(object)`, `rotation(object)`, `scale(object)` | Read them as vectors, the rotation in degrees |
| `mousePoint()` | Where the mouse is on the level or the ground |
| `undo(redo)` | Undo, or redo with true |
| `toJSON()` | The level as the text Save writes |

### `levelEditor.edit2D`

| Member | What it is |
| --- | --- |
| `map` | The Tiled map of the selected layer |
| `layer` | The selected tile layer, a `TileLayer`, undefined on an object layer |
| `objects` | A copy of the selected object layer's objects, as Tiled has them |
| `hover` | The cell under the mouse on the selected tile layer |
| `selection` | A `Set` of the selected objects' ids |
| `paint(cell, tile, direction, mirror)` | Set a cell of the selected tile layer to a tile index, -1 erases; false off the layer |
| `changeObjects((list)=> {...})` | Edit a copy of the selected object layer's objects |
| `strokeEnd()` | End the edit: one undo step, and the autosave |
| `strokeCancel()` | Take the edit being made back |
| `bulk(()=> {...})` | Many `paint` calls with one redraw a layer |
| `undo(redo)` | Undo, or redo with true |
| `toJSON()` | The map as the text Save writes |

## The files

- 3D: plain JSON, `{littlejs3D: 1, scene, voxels, terrain, prefabs, objects: [{id, type, pos, rotation, scale,
  properties}]}`. Load with `level3DLoad(await fetchJSON('level.json'))`.
- 2D: Tiled JSON. Load with `tileLayersLoad(map)` and `objectLayersLoad(map)`. Tiled itself can open the file.
- A game that loads the same level object again, as a restart does, gets the edits.
- To keep levels somewhere of your own, a server or your own format, use `onSave`:

```javascript
levelEditor.onSave = (text, fileName)=>
{
    fetch('/levels/' + fileName, {method: 'PUT', body: text});
    return true; // kept, the editor writes no file
};
```

## A checklist for a custom editor

1. Register the game's types with their defaults, before the level loads.
2. Set `onRestart` and `onPlayFrom`, so Restart and Play from mouse work.
3. Add keys and buttons for what the game's designers do most, each ending its stroke.
4. Add a tool for what is done with the mouse in the level: paths, zones, links between objects.
5. Draw what the level does not show by itself in `onDraw`: zones, ranges, links.
6. Ship the release build: the editor and everything you added to it are gone.

## Where the working examples are

- `examples/shorts/render3dLevelEditor.js`: a 3D level with its own Coin and PlayerStart types and both hooks.
- `examples/shorts/render3dPrefab.js`: the 3D editor used as a prefab maker.
- `examples/shorts/levelEditor.js` and `examples/platformer/`: the 2D editor with a game's own types, palette
  and hooks.

## What it does not do

- **It does not replace the editor's own tools.** Your keys, buttons and tools are added beside them; how the
  built-in Move tool snaps, or how painting works, is not something a game changes. For that, copy
  `src/engineEditor.js` or `plugins/render3dEditor.js` and edit it.
- **A tool has no handles of its own.** It has the press, the drag and the release, and it can draw.
- **The editors' inner functions**, the ones named `editor...` and `editor3D...`, are not part of this. They can
  be reached in a script-tag debug build, but they change between versions.
