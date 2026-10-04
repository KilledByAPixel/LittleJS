let player, playerStart;
const torchRadius = 4; // how far a torch lights, unless the editor sets it

// the dungeon as a Tiled map: a layer of walls, and torches and a start
function makeLevel()
{
    const width = 30, height = 17, data = [];
    for (let row = height; row--;) // Tiled lists rows from the top
    for (let x = 0; x < width; ++x)
    {
        const edge = !x || !row || x == width-1 || row == height-1;
        data.push(edge || x == 15 && row != 8 ? 11 : 0); // tile 10, brick
    }
    const object = (id, type, x, y)=>
        ({id, type, point: true, x: x * 16, y: (height - y) * 16});
    return {width, height, tilewidth: 16, tileheight: 16,
        nextlayerid: 3, nextobjectid: 4, layers: [
            {type: 'tilelayer', id: 1, name: 'Walls', width, height, data},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [
                object(1, 'PlayerStart', 4, 8),
                object(2, 'Torch', 8, 12),
                object(3, 'Torch', 22, 5)]}]};
}
const level = makeLevel();

class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(.8), tile(3), 0, hsl(.55, 1, .7));
        this.setCollision();
        this.damping = .8;
    }
    update()
    {
        this.velocity = this.velocity.add(keyDirection().scale(.04));
        cameraPos = this.pos.copy();
    }
}

class Torch extends EngineObject
{
    constructor(pos) { super(pos, vec2(1), tile(6)); }
    render()
    {
        // its light, a faint circle as wide as its radius says
        setAdditiveBlendMode(true);
        drawCircle(this.pos, this.radius * 2, this.color.scale(.2, 1));
        setAdditiveBlendMode(false);
        super.render();
    }
}

// build the level from the map, and again when the editor restarts it
function loadLevel()
{
    engineObjectsDestroy();
    tileLayersLoad(level, tile(0, 16), 0, 'Walls'); // the walls are solid
    objectLayersLoad(level);
    player = new Player(playerStart);
}

// the game's own level editor: a tool, a button, a key and an overlay
class DungeonEditor extends LevelEditor
{
    constructor()
    {
        super();
        this.showLight = true;
        this.addTool('Room',
        {
            key: 'b', // R is the editor's, it turns the brush
            hint: 'Room: drag a box, walls on its edge and space inside',
            // the box's corners: where it was pressed, and the mouse now
            onPress: (at)=> { this.room = at.cell && [at.cell, at.cell]; },
            onDrag: (at)=> { at.cell && this.room?.splice(1, 1, at.cell); },
            onRelease: ()=> this.buildRoom(),
            onDraw: ()=> this.drawRoom(),
        });
        this.addButton('Clear', ()=> this.clear(), 'Take out every wall');
        this.addKey('l', ()=> { this.showLight = !this.showLight; },
            'L: show how far each torch lights');
    }

    // the hooks are methods: Restart, and Play from mouse
    onRestart() { loadLevel(); }
    onPlayFrom(pos) { player.pos = pos.copy(); }

    // the box the room drag covers, its low and high cells
    roomBox()
    {
        const [a, b] = this.room;
        return [vec2(min(a.x, b.x), min(a.y, b.y)),
            vec2(max(a.x, b.x), max(a.y, b.y))];
    }

    buildRoom()
    {
        if (!this.room) return;
        const [low, high] = this.roomBox(), edit = this.edit2D;
        edit.bulk(()=>
        {
            for (let x = low.x; x <= high.x; ++x)
            for (let y = low.y; y <= high.y; ++y)
            {
                const edge = x == low.x || x == high.x ||
                    y == low.y || y == high.y;
                edit.paint(vec2(x, y), edge ? 10 : -1); // -1 erases
            }
        });
        this.room = undefined; // the editor ends the stroke
    }

    drawRoom()
    {
        // only while the button is held: a right click takes the drag back
        if (!this.room || !mouseIsDown(0)) return;
        const [low, high] = this.roomBox(), size = high.subtract(low);
        const center = low.add(size.scale(.5)).add(vec2(.5));
        drawRect(center, size.add(vec2(1)), hsl(.15, 1, .5, .3));
    }

    clear()
    {
        const edit = this.edit2D, {width, height} = edit.map;
        edit.bulk(()=>
        {
            for (let x = width; x--;)
            for (let y = height; y--;)
                edit.paint(vec2(x, y), -1);
        });
        edit.strokeEnd(); // one undo
    }

    // draw each torch's reach from the map, where the level keeps it
    onDraw()
    {
        if (!this.showLight) return;
        for (const object of level.layers[1].objects)
        if (object.type == 'Torch')
        {
            const pos = vec2(object.x/16, level.height - object.y/16);
            const radius = object.properties?.find(
                (p)=> p.name == 'radius')?.value ?? torchRadius;
            drawCircle(pos, radius * 2, hsl(.1, 1, .5, .15),
                .1, hsl(.1, 1, .6));
        }
    }
}

function gameInit()
{
    canvasClearColor = hsl(.7, .3, .12);
    objectLayersAddType('PlayerStart', (pos)=> playerStart = pos, {},
        tile(3));
    objectLayersAddType('Torch', Torch,
        {radius: torchRadius, color: hsl(.1, 1, .6)}, tile(6));
    loadLevel();

    // the game's editor in place of the plain one, then start in it
    setLevelEditor(new DungeonEditor);
    levelEditor.paletteTiles = [10]; // brick is the one tile to paint
    cameraPos = vec2(15, 8.5);
    levelEditor.open();
}

/* info
A small dungeon with a level editor made for it. The editor has a Room
tool, B or its button, that lays out a room by dragging a box: walls go
on its edge and the inside is cleared. Clear takes out every wall, and
L shows how far each torch lights. Press Play or Escape to walk around
with the arrow keys, and Escape again to edit.

## How it works
The engine's level editor is the base of a game's own. Everything goes
through `levelEditor`, and a game can give it a class of its own that
extends `LevelEditor`, set with `setLevelEditor`. In a release build the
class does nothing, so the same code ships without the editor.

### The level
`makeLevel` builds a map in the format of the
[Tiled](https://www.mapeditor.org) editor: a tile layer named `Walls`,
with brick, tile 10, around the edge and down the middle, and an object
layer with the player start and two torches. `loadLevel` makes it with
`tileLayersLoad(level, tile(0, 16), 0, 'Walls')`, the last argument
naming the solid layer, and `objectLayersLoad(level)`.

`objectLayersAddType('Torch', Torch, defaults, tile(6))` names the
type, `tile(6)` its icon in the editor. Its defaults, a `radius` and
a `color`, become inputs in the editor's panel, and what is set there
is saved in the map and set on the torch when it is made.

### The editor class
`DungeonEditor` adds what this game's designer does most:

- `addTool('Room', tool)` adds a tool with a button and the key B, as
  R is one of the editor's own keys.
  While it is on, the left mouse button in the level is the tool's.
  `onPress` and `onDrag` are given `at.cell`, the cell under the mouse,
  and keep the corners of the box. `onRelease` paints it with
  `edit2D.paint(cell, tile)`, 10 for a wall and -1 to erase, inside
  `edit2D.bulk`, so the layer redraws once. The editor makes the press,
  drag and release one undo step.
- `onDraw` of the tool draws the box while it is dragged.
- `addButton('Clear', ...)` adds a button to the panel. It ends its
  edit with `strokeEnd()`, which makes it one undo step.
- `addKey('l', ...)` adds a key and a line to the editor's help.
- The class's own `onDraw` draws a circle at each torch for its reach,
  read from the map's objects, which is where the editor keeps them.
- `onRestart` and `onPlayFrom` are hooks as methods: Restart builds the
  level again, and Play from mouse puts the player at the mouse.

`setLevelEditor(new DungeonEditor)` puts it in place of the plain one,
before it opens, and `paletteTiles = [10]` offers only the brick to
paint by hand.

## Try it
- A wider light: `torchRadius = 4` to `torchRadius = 7`.
- Rooms of stone: in `buildRoom`, `edge ? 10 : -1` to `edge ? 1 : -1`.
- Start playing: take out `levelEditor.open();`, then Escape and 0
  open the editor.

## See also
Level Editor is the editor as it comes, and 3D Level Editor the 3D one,
which takes the same keys, buttons and tools through `levelEditor`.
*/
