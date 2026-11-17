# Making your own level editor with LittleJS

LittleJS has two level editors built in: one for 2D tile maps and one for 3D levels. You can use them as they
are, or make them your game's own by adding its object types, keys, buttons and tools. Everything goes through
one object, `levelEditor`, and the same calls work in both editors.

**Contents**

- [Quick start](#quick-start): open the editor, and hook up a level in a few lines
- Making it your own: [object types](#your-own-object-types), [hooks](#the-hooks), [keys](#a-key-of-your-own),
  [buttons](#a-panel-button-of-your-own), [tools](#a-tool-of-your-own), [an editor class](#an-editor-class-of-your-own)
- [Things to know](#things-to-know): the rules every customization follows
- Reference: [the edit functions](#the-edit-functions), [the files](#the-files),
  [a checklist](#a-checklist-for-a-custom-editor), [the examples](#where-the-working-examples-are),
  [what it does not do](#what-it-does-not-do)

**For AI coding assistants:** this page is meant to be followed as written. Every code block marked "tested" is
run by `test/editorCustom.test.mjs` straight from this file. The full API is in
[the edit functions](#the-edit-functions) tables and [the hooks](#the-hooks) block, and
[the checklist](#a-checklist-for-a-custom-editor) is the order to build a custom editor in.

## Quick start

**Using the editor, with no code.** Any game running the debug build has it.

1. Press `Esc` for the debug overlay, then `0` to open the editor. It opens the 3D editor when the game loaded a
   3D level, and the 2D one otherwise.
2. Press `?` to see every control. Ctrl+Z undoes.
3. Press `Esc` to switch between editing and playing, and `0` or the panel's Exit button to leave.
4. Press the panel's Save button to write the level to a file. Edits are also autosaved in the browser, so a
   reload brings back what was not saved yet. Edit a level in one tab at a time: two tabs of the same page keep one
   autosave per level, and the last edit made in either one writes over the other's.

**Hooking up your game.** The editor edits the level data your game loaded, so load the level from data and
rebuild it in one function. A 2D game:

```javascript
function loadLevel()
{
    engineObjectsDestroy();
    // level is the Tiled map, from fetchJSON('level.json'); its layer 0 has collision
    tileLayersLoad(level, tile(0, 16), 0, 0);
    objectLayersLoad(level); // makes an object for each one in the map, by its type
}

function gameInit()
{
    objectLayersAddType('Coin', Coin, {value: 1}); // types are added before the level loads
    loadLevel();
    levelEditor.onRestart = loadLevel;             // the editor's Restart button rebuilds the level
}
```

A 3D game does the same with `level3DAddType` and `level3DLoad(level)`. The rest of this page is about making
the editor fit your game.

## Making it your own

### Your own object types

A type is a name, something to make, and default properties. The editor lists the type in its panel, ready to
place. Each default whose value is a number, a true or false, a string, a `Color` or a vector gets an input in
the panel. What the level designer sets is saved in the level, and set on the object when the level loads.

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

A constructor may put its body away from the place it is given, `super(pos.add(vec3(0, height / 2, 0)), ...)` to stand
on its feet: the editor keeps that offset, scaled and turned with the object, as it moves and lands it, as a reload does. An
offset the constructor works out from where it is, sticking itself to the ground, is kept as it was when made.

2D, tested:

<!-- test:type2d -->
```javascript
class Coin extends EngineObject
{
    constructor(pos) { super(pos, vec2(1)); }
}
objectLayersAddType('Coin', Coin, {value: 1});
```

- **In 2D, a type is made with `new make(pos)`, and its Tiled properties are set on it after the constructor**,
  so a constructor reads none of them. A property that changes how the object looks or works, its size from a
  `value`, is a setter: the loader sets it once the object is made, and the editor sets it again on each edit,
  so the object follows the edit, where one read in its first `update` would keep the first value. In 3D the
  properties are handed to the constructor, `new make(pos3D, properties)`, and an edit makes the object again.
  An arrow function type, for what is not an object like a player start, is called with them in both,
  `make(pos, properties)`; a `function` is made with `new`, as a class is, in 2D with no properties. What an arrow gives back is not kept in the loader's list when it is a position or a
  `Color`.

```javascript
class Gem extends EngineObject
{
    constructor(pos) { super(pos, vec2(1)); this.value = 1; }
    set value(value) { this.worth = value; this.size = vec2(.5 + value * .25); } // set again on each edit
    get value() { return this.worth; }
}
objectLayersAddType('Gem', Gem, {value: 1});
```
- **In 3D, a class needs its own constructor that takes the position.** One that passes every argument on to
  `EngineObject3D` would pass the properties as its mesh.
- **A 3D prop with no class:** `level3DAddMesh('Tree', mesh, tileInfo)` makes a static prop. Its properties are:
  - `color`;
  - `solid`, which collides as its box;
  - `meshCollision`, which collides by its triangles, so a ramp or a rock placed in the editor is walked on as it
    is shaped. `level3DAddMesh('Ramp', mesh, tileInfo, WHITE, true)` makes that the type's default.
- **Changing a 3D object's property in the editor makes the object again**, since its constructor takes them.
- **3D prefabs**, small levels placed many times, are types too: see "Prefabs" in [REFERENCE.md](REFERENCE.md).
  The panel's Load prefab button adds one from a file to the level being edited. A level the game loads while a
  prefab is open in Edit prefab ends it, as the game's level changed under it: unload the old level by its list
  before loading the next, as a level change does; a level loaded on top of one left in place does not bring the
  first back.

### The hooks

Set the ones you need; each one you leave out does nothing.

```javascript
levelEditor.open();                    // start in the editor; close() plays on with the changes
levelEditor.isOpen;                    // true while editing
levelEditor.onRestart = ()=> buildLevel();         // adds a Restart button: load the level again; it may be async:
                                                   // till it settles Restart waits, in the 2D editor a resize,
                                                   // its undo and redo and Apply or Reset of another size too,
                                                   // the 2D editor takes no object edit or its undo, no Apply
                                                   // of object edits or Reset putting objects back, and no Clear,
                                                   // Cut, drag or stamp with All Layers holding objects, tile
                                                   // edits going in, the 3D editor no edit, undo or Reset, and
                                                   // Escape and
                                                   // Play play on, with no onPlayFrom, so a fade can finish;
                                                   // with no debug key the 3D editor stays closed till it
                                                   // settles, then opens again
levelEditor.onPlayFrom = (pos)=> player.pos = pos; // adds "Play from mouse": put the player at the mouse
levelEditor.onOpen = ()=> {};          // the editor opened
levelEditor.onClose = ()=> {};         // it closed, the game plays on
levelEditor.onUpdate = ()=> {};        // each frame while it is open
levelEditor.onDraw = ()=> {};          // while it draws the level, for overlays of your own
levelEditor.onPanel = (box)=> {};      // once, when the panel is made: a box in it for your own controls
levelEditor.onSave = (text, name)=> false;     // Save: return true when you kept the file yourself
levelEditor.use3D = true;              // force the 3D editor (false, the 2D one); undefined picks by the level
levelEditor.onTile = (layer, pos, tile)=> {};  // 2D: a tile was painted, tile undefined when erased
levelEditor.paletteTiles = [0, 1, 10]; // 2D: the tiles the palette shows, undefined for the whole sheet; set it for
                                       // a tile set packed by loadSprite, whose sheet holds other sprites below it
```

### A key of your own

`addKey(key, action, helpLine)` adds a key. The help line shows in the editor's `?` help.

The key can be written any of these ways:

| Form | Examples |
| --- | --- |
| A letter or digit | `'k'` |
| A key's name, in any case | `'Delete'`, `'F2'`, `'Enter'`, `'Space'` |
| A key code with its capital, which both editors read | `'ShiftLeft'`, `'Numpad1'`, `'KeyE'` |
| Any of them with Ctrl | `'ctrl+k'` |

The 2D editor reads a letter by what the key prints. The 3D editor reads its fly keys (WASD, Q and E), its tool keys (Q, W, E, R, B, T, X, G, L, F and the rest of its table) and a game's keys by position, so they sit under the hand on any layout, and its Ctrl shortcuts (Z, Y, C, X, V, D, G) and `?` by what the key prints, so undo is Ctrl+Z on AZERTY and QWERTZ too; on a Cyrillic or Greek layout, whose keys print no Latin letters, they go by position; a game's own Ctrl key on the press goes first, and the editor's is not run.

- **The action is called with whether Shift is held.** Return `false` when it did nothing: in the 2D editor the
  key then goes on to the browser; the 3D editor keeps a key of the game's from the browser either way.
- **Ctrl is the one modifier.** For Shift, read the argument the action is given.
- **A key the editor already uses is replaced by yours**, with a warning in the console when the editor opens.
  The two editors use different keys, so check the `?` help of the one your game uses.
- **`Escape` and `0` (`'Digit0'` too) are the editor's own**, to play and to exit, and can not be taken.

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

### A panel button of your own

`addButton(label, onClick, title)` adds a button to the panel. 3D, tested:

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

### A tool of your own

Use a tool for what is done with the mouse in the level: paths, zones, rows of things, links between objects.

`addTool(name, tool)` adds a tool beside the editor's own: a button in the panel by its name, and a key if you
give one. While it is on, the left mouse button in the level is your tool's. Each callback is given
`{pos, cell, lastCell, ray, shift, ctrl}`:

- `pos`: where the mouse is in the level. In 3D a `Vector3` on the level or the ground, in 2D a `Vector2`.
- `cell`: 2D, the tile cell under the mouse on the selected tile layer, or undefined.
- `lastCell`: 2D, in a drag, the cell at the callback before, so a quick drag can fill the cells between.
- `ray`: 3D, the mouse's ray.

**Do not call `strokeEnd` in a tool.** What its callbacks change is one undo: the editor ends the stroke at the
release, and takes it back, with no `onRelease`, when the right button, Escape or a two finger pinch ends the
press. An `onPress` that returns `false` ends the press there: what it changed is its own undo, and that press gets
no `onDrag` or `onRelease`, nor does the editor's brush take the rest of it.

3D, a tool that lays a row of posts along a drag, tested:

<!-- test:tool3d -->
```javascript
let lastPost;
levelEditor.addTool('Posts',
{
    key: 'o',
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

2D, a tool that paints a tile wherever it is dragged, the cells between filled, Shift erasing, tested:

<!-- test:tool2d -->
```javascript
levelEditor.addTool('Water',
{
    key: 'w',
    hint: 'Water: drag to fill cells · Shift erases',
    onPress(at) { at.cell && levelEditor.edit2D.paint(at.cell, at.shift ? -1 : 7); },
    onDrag(at)
    {
        // the mouse may skip cells in a frame, so the line from the last one is painted
        if (!at.cell) return;
        const from = at.lastCell ?? at.cell, steps = max(abs(at.cell.x - from.x), abs(at.cell.y - from.y));
        for (let i = 1; i <= max(steps, 1); ++i)
            levelEditor.edit2D.paint(from.lerp(at.cell, i / max(steps, 1)).round(), at.shift ? -1 : 7);
    },
    onDraw(at)
    {
        // a cell is counted from its layer's corner, which is at the layer's pos in the world; there is no
        // cell and no tile layer while an object layer is picked
        if (!at.cell) return;
        const corner = levelEditor.edit2D.layer.pos;
        drawRect(corner.add(at.cell).add(vec2(.5)), vec2(1), hsl(.55, 1, .5, .4));
    },
});
```

- **Turning it off:** a tool is put down by its key or button again, or by picking one of the editor's own
  tools, layers or types. `levelEditor.tool` is the name of the one that is on.
- **Drawing:** `onDraw`, a tool's and the editor's, draws in the level as the editor does. In the 2D editor use
  the 2D draws (`drawRect`, `drawLine`). In the 3D editor it runs inside the 3D pass, so use `render3D.drawBox`,
  `render3D.drawLine` and the rest.

### An editor class of your own

Everything above can be a class instead, with the hooks as methods. That keeps a bigger editor in one place.
Tested:

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

- **Call `setLevelEditor` before the editor opens.** Afterwards use `levelEditor` itself, not a copy of it taken
  earlier.
- **Do not name your own fields `keys`, `buttons`, `tools` or `tool`.** The class keeps what you added in them.
- **A method of your class is a hook,** the same as one you set: defining `onRestart` shows the Restart button.

## Things to know

The rules every customization follows. The headline of each is enough to start with.

1. **Everything is on `levelEditor`**, or on a class of your own that extends `LevelEditor`. It is exported
   from every build, script tag and ES module alike.
2. **No guards are needed for release builds.** There `LevelEditor` is a stub: it takes what you add and never
   calls it. The editor's code is only in the debug builds (`dist/littlejs.js`, `dist/littlejs.esm.js`).
3. **The level data is the source of truth.** The editor changes the level object (3D) or the Tiled map (2D) the
   game loaded, and brings the game's objects in line. Change the level through `edit3D` or `edit2D`, never
   through the game's objects.
4. **An edit is a stroke.** Make changes with `edit3D.change(...)`, `edit3D.place(...)`, `edit2D.paint(...)` or
   `edit2D.changeObjects(...)`, then call `strokeEnd()`. That makes one undo step, and autosaves it. A tool's
   press, drag and release are ended for you.
5. **A type is named by a string**, never by its class, because minified builds rename classes.
6. **Use `levelEditor.edit3D` and `levelEditor.edit2D` only inside what the editor calls**: a key's action, a
   button's click, a tool's callbacks, `onUpdate`, `onDraw`. In a release build none of those are ever called.
   There `edit2D` is present and changes nothing, and `edit3D` is undefined, as it is in a game without the 3D
   plugins.
7. **`levelEditor.is3D` says which editor is in use**, for a game that has both kinds of level.
8. **The editor has the mouse and keys while it is open.** The game is held still. Its UI keeps drawing and
   updating, `onUpdate` and videos included, but takes no input: what was held or being edited lets go, and
   `uiSystem.isMouseOverUI()` answers false. The 3D editor also hides input from the game itself.

## The edit functions

### `levelEditor.edit3D`

| Member | What it is |
| --- | --- |
| `level` | The level object being edited |
| `objects` | Its objects, the list in the level: read it, edit through `change` |
| `selection` | A `Set` of the selected objects' ids, yours to add to and delete from |
| `selected()` | The selected objects |
| `made(id)` | What the game made for an object |
| `change((list)=> {...})` | Edit a copy of the object list; false when nothing changed, or when the level can not be edited while its autosave waits for Apply or Drop or an async `onRestart` runs; called inside another `change` it asserts and changes nothing, as the outer one would write over it |
| `changePart(name, (part)=> newPart)` | Edit the level's `scene`, `voxels`, `terrain` or `prefabs` block; false as `change` gives it, and for any part inside Edit prefab, where a prefab is objects alone |
| `strokeEnd()` | End the edit: one undo step, and the autosave |
| `strokeCancel()` | Take the edit being made back; not inside `change`, where it asserts, as do `undo`, `change` and `place`: only `setTransform` and `setProperty` run inside it |
| `place(type, pos3D)` | Add an object of a type, selected; its id, or undefined when there is no such type, a prefab would hold itself, or the level can not be edited while its autosave waits or an async `onRestart` runs; not inside `change`, where it asserts, push to the list instead |
| `setTransform(object, pos3D, rotation, scale3D)` | Inside `change`, on an object of its list, a new one pushed into it first: write a place, a rotation in degrees and a scale; leave one out to keep it; one that is not a finite Vector3 asserts and writes nothing |
| `setProperty(object, name, value)` | Inside `change`, on an object of its list: write a property, left out of the file when it is the type's default. It is written only when the load reads it back as given, and otherwise asserts and writes nothing: of the default's kind; every number in it finite, at any depth; a Color or vector only where the default has one, given as one or as the file writes it, a hex string or a list, at any depth; no function and no object of a class of the game's at any depth, as the file brings it back a plain object; over an object default every member of the default, but a class field with no value or a function, and every field of a class with an accessor, which may be given through the accessor, and no member of another kind than the default's, as the load would put the default's back; a list over a list default item by item the same, each against the default's item there or its last. Give a class's accessor or the field it writes, not both, since the last given wins. It asserts outside `change` or on an object not of its list |
| `pos(object)`, `rotation(object)`, `scale(object)` | Read them as vectors, the rotation in degrees |
| `mousePoint()` | Where the mouse is on the level or the ground, undefined while it is over the panel |
| `undo(redo)` | Undo, or redo with true; false when there was nothing to undo or it waits for a restart |
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
| `changeObjects((list)=> {...})` | Edit a copy of the selected object layer's objects; false when nothing changed, or while its autosaved edits wait for Apply or Drop or an async `onRestart` runs; called inside another `changeObjects` it asserts and changes nothing, as the outer one would write over it |
| `setProperty(object, name, value)` | Inside `changeObjects`, on an object of its list: write a property as Tiled keeps it, left out of the map when it is the type's default; a value not of the default's kind, a Vector2 over no default, a class property or a number that is not finite is not written, and asserts, as does a call outside `changeObjects` or on an object not of its list |
| `strokeEnd()` | End the edit: one undo step, and the autosave |
| `strokeCancel()` | Take the edit being made back; not inside `changeObjects`, where it asserts, as do `undo` and `changeObjects` |
| `bulk(()=> {...})` | Many `paint` calls with one redraw a layer |
| `undo(redo)` | Undo, or redo with true; false when there was nothing to undo or it waits for a restart |
| `toJSON()` | The map as the text Save writes |

## The files

- **3D:** plain JSON, `{littlejs3D: 1, scene, voxels, terrain, prefabs, objects: [{id, type, pos, rotation, scale,
  properties}]}`. Load it with `level3DLoad(await fetchJSON('level.json'))`. What the 3D editor places or makes
  again joins the array `level3DLoad` gave back, and leaves it when taken out, so keep that array itself, not a
  filtered copy, to unload the level by it, and look an object up again rather than keep its index.
- **2D:** Tiled JSON. Load it with `tileLayersLoad(map)` and `objectLayersLoad(map)`. Tiled itself can open the
  file.
- **Loading again keeps the edits:** a game that loads the same level object again, as a restart does, gets them.
- **3D block maps:** a 3D level's block map shows the tiles of the sheet given to `level3DVoxelSetup`, or of the
  game's first image. A game that has loaded no image gets plain colored blocks.
- **Your own storage:** to keep levels somewhere of your own, a server or your own format, use `onSave`:

```javascript
levelEditor.onSave = (text, fileName)=>
{
    fetch('/levels/' + fileName, {method: 'PUT', body: text});
    return true; // kept, the editor writes no file
};
```

`onSave` may be an async function. In the 3D editor it is asked for a prefab too, when Save is pressed inside one.

### A game opened from disk

A page opened straight from a folder, with no server, can not `fetch` a JSON file. Keep the level as a script
instead: a file that sets a variable, loaded with a script tag before the game. `onSave` writes it. Tested:

<!-- test:disklevel -->
```javascript
// index.html has <script src="level.js"></script> before the game's own script, and level.js is one line:
// var level = {"littlejs3D": 1, "objects": [...]};
levelEditor.onSave = (text, fileName)=>
{
    saveText('var level = ' + text.trim() + ';\n', 'level.js', 'text/javascript');
    return true; // kept, the editor writes no JSON file
};
level3DLoad(level); // the same object the script made, so the editor's changes are the game's
```

Save then downloads `level.js`, to put in place of the old one. The autosave still brings unsaved edits back
after a reload.

## A checklist for a custom editor

1. Register the game's types with their defaults, before the level loads.
2. Set `onRestart` and `onPlayFrom`, so Restart and Play from mouse work.
3. Add keys and buttons for what the game's designers do most, each ending its stroke.
4. Add a tool for what is done with the mouse in the level: paths, zones, links between objects.
5. Draw what the level does not show by itself in `onDraw`: zones, ranges, links.
6. Ship the release build: the editor and everything you added to it are gone.

## Where the working examples are

- `examples/shorts/customEditor.js`: a 2D editor class of a game's own, with a tool that lays out rooms by a
  drag, a button, a key and an overlay drawn in `onDraw`.
- `examples/shorts/render3dLevelEditor.js`: a 3D level with its own Coin and PlayerStart types and both hooks.
- `examples/shorts/render3dPrefab.js`: the 3D editor used as a prefab maker.
- `examples/shorts/levelEditor.js` and `examples/platformer/`: the 2D editor with a game's own types, palette
  and hooks.

## What it does not do

- **It does not replace the editor's own tools.** Your keys, buttons and tools are added beside them. How the
  built-in Move tool snaps, or how painting works, is not something a game changes. That takes an engine build
  of your own:
  1. Get the LittleJS source at the version you use.
  2. Edit `src/engineEditor.js` or `plugins/render3dEditor.js`.
  3. Run `npm run build`, and use the `dist/littlejs.js` it makes.

  A changed copy of the file can not be loaded beside the engine, since the debug build has the editor in it
  already, and a build of your own has to be made again for each engine update.
- **A tool has no handles of its own.** It has the press, the drag and the release, and it can draw.
- **The editors' inner functions**, the ones named `editor...` and `editor3D...`, are not part of this. They can
  be reached in a script-tag debug build, but they change between versions.
