# Making your own level editor with LittleJS

LittleJS has two level editors built in, one for 2D tile maps and one for 3D levels. They are meant to be a
starting point: a game adds its own object types, properties, keys, tools and panel buttons, and ends up with an
editor made for that one game. This page says what a game can hook into and how.

It is written to be followed by a person or by an AI coding assistant. Every code block marked "tested" is run
by `test/editorCustom.test.mjs` straight from this file, so it works as written.

## The rules

1. **The editors are in debug builds only.** `dist/littlejs.js` and `dist/littlejs.esm.js` have them;
   `dist/littlejs.release.js` and `dist/littlejs.esm.min.js` do not. Ship the release build and the editor is gone.
2. **Three levels of access, by build.** See the table below. The `levelEditor` object and the type functions
   work everywhere. The editors' own functions (`editor3DChange`, `editorPaint`, the key tables) are globals of
   the script-tag debug build only.
3. **Guard anything that touches the editors' own functions**, so the release build does not fail:
   `if (debug && typeof editor3DKeys != 'undefined') { ... }`.
4. **The level data is the source of truth.** The editor changes the level object (3D) or the Tiled map object
   (2D) the game loaded, and brings the game's objects in line. Never change the game's objects and expect the
   level to follow.
5. **Every edit goes through the editor's edit function, then ends the stroke.** That is what makes it one undo
   step, autosaved and saved. In 3D: `editor3DChange(...)` then `editor3DStrokeEnd()`. In 2D: `editorPaint(...)`
   or `editorChangeObjects(...)` then `editorStrokeEnd()`.
6. **A type is named by a string**, never by its class, because minified builds rename classes.
7. **A key action that did nothing returns `false`**, which leaves the key to the browser.

| What | Script debug build | ES module debug build | Release builds |
| --- | --- | --- | --- |
| `levelEditor` and its hooks | yes | yes | a stub that does nothing |
| `level3DAddType`, `level3DAddMesh`, `level3DAddPrefab`, `level3DLoad`, `level3DSpawn` | yes | yes | yes |
| `objectLayersAddType`, `objectLayersLoad`, `tileLayersLoad` | yes | yes | yes |
| The editors' own functions, key tables and panel (`editor3D...`, `editor...`) | yes, as globals | not exported | not there |

So: a game on the ES module build can do everything in "Level 1" below. Keys, tools and panel buttons of your
own ("Level 2") need the script-tag build, `<script src="dist/littlejs.js"></script>`.

## Level 1: hooks every build has

### Open it, and say what Play and Restart do

```javascript
levelEditor.open();                    // start in the editor; close() plays on with the changes
levelEditor.isOpen;                    // true while editing
levelEditor.onRestart = ()=> buildLevel();     // adds a Restart button: destroy the objects, load the level again
levelEditor.onPlayFrom = (pos)=> player.pos = pos; // adds "Play from mouse": put the player where the mouse is
levelEditor.use3D = true;              // force the 3D editor (or false, the 2D one); undefined picks by the level
levelEditor.onTile = (layer, pos, tile)=> {};  // 2D: called for each painted tile, tile undefined when erased
levelEditor.paletteTiles = [0, 1, 10]; // 2D: the tiles the palette shows, undefined for the whole sheet
```

Without code, `0` on the debug overlay (`Esc`) opens the editor, and `Esc` then switches between editing and
playing.

### Your own object types, and their properties as panel inputs

A type is a name, something to make, and default properties. The editor lists the type to place, and shows an
input for each default whose value is a number, a true or false, a string, a `Color` or a vector; what the
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
- To take a built-in type out of the 3D editor's Place list: `level3DTypes.delete('Sphere')` (script build).
- Changing a 3D object's property in the editor makes the object again, since its constructor takes them.

### Prefabs (3D)

A prefab is a small level placed many times. `level3DAddPrefab('House', data)` makes it a type; in the editor
Ctrl+G makes one from the selection and Enter opens one to edit it alone. A game's own types can be parts of a
prefab. See "Prefabs" in [REFERENCE.md](REFERENCE.md).

### The files

- 3D: plain JSON, `{littlejs3D: 1, scene, voxels, terrain, prefabs, objects: [{id, type, pos, rotation, scale,
  properties}]}`. Load with `level3DLoad(await fetchJSON('level.json'))`.
- 2D: Tiled JSON. Load with `tileLayersLoad(map)` and `objectLayersLoad(map)`. Tiled itself can open the file.
- A game that loads the same level object again, as a restart does, gets the edits.

## Level 2: keys, tools and panel buttons of your own (script-tag debug build)

### 3D: the functions to build on

| Name | What it is |
| --- | --- |
| `editor3DLevel` | The level object being edited |
| `editor3DObjects()` | Its objects, the list in the level |
| `editor3DSelection` | A `Set` of the selected objects' ids; `editor3DSelected()` gives the objects |
| `editor3DInstances` | A `Map` from an object's id to what the game made for it |
| `editor3DChange((list)=> {...})` | Edit a copy of the object list; returns false when nothing changed |
| `editor3DStrokeEnd()` | End the edit: one undo step, and the autosave |
| `editor3DStrokeCancel()` | Take the edit being made back, with no undo step |
| `editor3DSetTransform(object, pos, rotation, scale)` | Write a place, a rotation in degrees and a scale as the file keeps them; leave one out to keep it |
| `editor3DSetProperty(object, name, value, defaultValue)` | Write a property as the file keeps it |
| `editor3DPos(object)`, `editor3DRotation(object)`, `editor3DScale(object)` | Read them, as vectors |
| `editor3DPlace(type, pos)` | Add an object of a type, selected; returns its id |
| `editor3DChangePart(name, (part)=> newPart)` | Edit the level's `scene`, `voxels`, `terrain` or `prefabs` block |
| `editor3DMousePoint()` | Where the mouse is on the level or the ground, a `Vector3`, or undefined |
| `editor3DUndo(redo)` | Undo, or redo with true |
| `editor3DKeys`, `editor3DCtrlKeys` | The keys, by position (`KeyK`), each a function called with whether Shift is held |
| `editor3DHelpLines` | The lines the `?` help shows, add yours |
| `editor3DLevelJSON()` | The level as the text Save writes |
| `editor3DPanel` | The panel's element, made when the editor first opens |

### 3D: a key of your own, tested

<!-- test:key3d -->
```javascript
if (debug && typeof editor3DKeys != 'undefined')
{
    // K lifts every selected object one unit, as one undo
    editor3DKeys.KeyK = ()=>
    {
        const changed = editor3DChange((list)=>
        {
            for (const object of list)
                if (editor3DSelection.has(object.id))
                    editor3DSetTransform(object, editor3DPos(object).add(vec3(0, 1, 0)));
        });
        editor3DStrokeEnd();
        return changed; // false when nothing was selected, the key is the browser's
    };
    editor3DHelpLines.push('K: lift the selection one unit');
}
```

### 3D: a panel button of your own

The panel is made the first time the editor opens, so add to it then. `gameUpdatePost` runs while the editor
has the game paused.

<!-- test:panel3d -->
```javascript
let scatterButton;
function addEditorButton()
{
    if (!debug || typeof editor3DPanel == 'undefined' || !editor3DPanel || scatterButton) return;
    scatterButton = document.createElement('button');
    scatterButton.textContent = 'Scatter 5 spawners';
    scatterButton.onclick = ()=>
    {
        editor3DStrokeEnd();
        for (let i = 0; i < 5; ++i)
            editor3DPlace('Spawner', vec3(rand(-8, 8), .5, rand(-8, 8)));
        editor3DStrokeEnd(); // the five are one undo
    };
    editor3DPanel.appendChild(scatterButton);
}
// call addEditorButton() from gameUpdatePost
```

### 2D: the functions to build on

| Name | What it is |
| --- | --- |
| `editorLayer` | The selected tile layer's record, `{record, source, live}`: the Tiled layer and its `TileLayer` |
| `editorObjectLayer` | The selected object layer's record, undefined on a tile layer |
| `editorHover` | The cell under the mouse on the selected tile layer, a `Vector2`, or undefined |
| `editorPaint(layer, cell, gid)` | Set one cell; `editorTileToGid(tile)` gives the gid of a tile, 0 erases |
| `editorChangeObjects(layer, (list)=> {...})` | Edit a copy of an object layer's objects |
| `editorStrokeEnd()` | End the edit: one undo step, and the autosave |
| `editorStrokeCancel()` | Take the edit being made back |
| `editorBulkEdit(()=> {...})` | Wrap many `editorPaint` calls so each layer redraws once |
| `editorObjectSelection` | A `Set` of the selected objects' ids |
| `editorUndo(redo)` | Undo, or redo with true |
| `editorKeys`, `editorCtrlKeys` | The keys, by the letter printed on them (`t`), each called with whether Shift is held |
| `editorHelpLines` | The lines the `?` help shows, add yours |
| `editorPanel` | The panel's element, made when the editor first opens |

### 2D: a key of your own, tested

<!-- test:key2d -->
```javascript
if (debug && typeof editorKeys != 'undefined')
{
    // T paints tile 5 under the mouse on the selected tile layer, as one undo
    editorKeys.t = ()=>
    {
        if (!editorLayer || !editorHover) return false; // nothing done, the key is the browser's
        editorPaint(editorLayer, editorHover, editorTileToGid(5));
        editorStrokeEnd();
    };
    editorHelpLines.push('T: paint tile 5 under the mouse');
}
```

A panel button in 2D is the same as the 3D one, appended to `editorPanel`.

## A checklist for a custom editor

1. Register the game's types with their defaults, before the level loads.
2. Set `levelEditor.onRestart` and `levelEditor.onPlayFrom`, so Restart and Play from mouse work.
3. Remove the built-in types the game does not use.
4. Add keys and buttons for what the game's designers do most, each through the edit function and a stroke end.
5. Add a line to the help for each key.
6. Guard all of it with `debug`, and ship the release build.

## Where the working examples are

- `examples/shorts/render3dLevelEditor.js`: a 3D level with its own Coin and PlayerStart types and both hooks.
- `examples/shorts/render3dPrefab.js`: the 3D editor used as a prefab maker.
- `examples/shorts/levelEditor.js` and `examples/platformer/`: the 2D editor with a game's own types, palette
  and hooks.

## What is not there yet

- The editors' own functions are not exported from the ES module build, so Level 2 needs the script-tag build.
- There is no call to register a whole new mouse tool; a key or a button that acts on the selection or on the
  cell or point under the mouse is what can be added today.
- The names in the Level 2 tables are the editors' internals. They are documented and tested here, but they may
  change between versions; the Level 1 hooks are the stable ones.
