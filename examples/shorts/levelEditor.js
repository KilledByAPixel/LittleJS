let player, playerStart, score = 0;

// the level as a Tiled map, the editor edits it in place and saves it
function makeLevel()
{
    const width = 40, height = 12, data = [];
    for (let row = height; row--;) // Tiled lists rows from the top
    for (let x = 0; x < width; ++x)
    {
        const ground = row < 2 || row == 5 && x > 12 && x < 18;
        data.push(ground ? 2 : 0); // a gid is the tile plus one
    }
    const object = (id, type, x, y)=>
        ({id, type, point: true, x: x * 16, y: (height - y) * 16});
    return {width, height, tilewidth: 16, tileheight: 16,
        nextlayerid: 3, nextobjectid: 5, layers: [
            {type: 'tilelayer', id: 1, name: 'Ground', width, height, data},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [
                object(1, 'PlayerStart', 3.5, 3),
                object(2, 'Coin', 15.5, 7.5),
                object(3, 'Coin', 22.5, 3.5),
                object(4, 'Coin', 26.5, 3.5)]}]};
}
const level = makeLevel();

class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1, 2), undefined, 0, hsl(0, .8, .5));
        this.setCollision();
    }

    update()
    {
        const move = keyDirection(), speed = this.groundObject ? .1 : .01;
        this.velocity.x = clamp(this.velocity.x + move.x * speed, -.3, .3);
        if (this.groundObject && move.y > 0)
            this.velocity.y = .9; // jump
        cameraPos = vec2(this.pos.x, 7);
    }
}

class Coin extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(.8), tile(6), 0, hsl(.15, 1, .5));
        this.mass = 0; // static, it stays where it was placed
        this.value = 1;
    }

    update()
    {
        if (player && player.pos.distance(this.pos) < 1)
        {
            score += this.value;
            this.destroy();
        }
    }
}

// build the level from the map, and again when the editor restarts it
function loadLevel()
{
    engineObjectsDestroy();
    tileLayersLoad(level, tile(0, 16), 0, 0); // layer 0 has collision
    objectLayersLoad(level);
    player = new Player(playerStart);
    score = 0;
}

function gameInit()
{
    gravity.y = -.05;
    canvasClearColor = hsl(.6, .4, .6);
    cameraPos = vec2(10, 6); // the editor opens looking at the level

    // the object types, by the names they have in the map, with icons
    objectLayersAddType('PlayerStart', (pos)=> playerStart = pos, {},
        tile(3));
    objectLayersAddType('Coin', Coin, {value: 1}, tile(6));
    loadLevel();

    // start in the level editor, its Restart button rebuilds the level,
    // and Play from mouse, in its Advanced section, puts the player there
    levelEditor.onRestart = loadLevel;
    levelEditor.paletteTiles = [0, 1, 10]; // the level tiles of the sheet
    levelEditor.onPlayFrom = (pos)=>
    {
        player.pos = pos.copy();
        player.velocity = vec2();
    };
    levelEditor.open();
}

function gameRenderPost()
{
    drawTextScreen('Coins ' + score, vec2(mainCanvasSize.x / 2, 40), 40);
}

/* info
A tiny platformer that starts in the level editor. Paint ground, place
coins and the player start, then press Play or Escape to try it, and
Escape again to go back to editing. The level is autosaved as you go.
While playing, the left and right arrow keys run and the up arrow
jumps.

## How it works
The level editor is part of the engine's debug build. It edits a level
in the format of the [Tiled](https://www.mapeditor.org) map editor: an
object with tile layers and object layers. A game loads that object
with `tileLayersLoad` and `objectLayersLoad`, and the editor changes
the same object in place.

### The map
`makeLevel` builds the map in code, where a game would more often load
a JSON file. It is 40 tiles wide and 12 high, with two layers:

- A tile layer, `data`, one number for each cell, row by row from the
  top row down. 0 is empty and any other number is a tile's index in
  the tile sheet plus one, so `2` is tile 1. The ground is the two
  bottom rows and a short platform.
- An object layer, a list of objects with an `id`, a `type` and a
  position. Tiled counts positions in pixels from the top left with y
  going down, so the `object` helper multiplies by the 16 pixel tile
  size and flips y.

`level` is made once and kept. That matters: the editor's changes are
in this object, so loading it again gives the edited level.

### Object types
`objectLayersAddType(name, make, defaults, tileInfo)` says what to make
for each object type in the map:

- `'Coin'` is given the `Coin` class. A class is made with
  `new Coin(pos)`, where `pos` is the object's place in world units.
  Then the defaults, `{value: 1}`, are set on it, and the editor shows
  an input for each.
- `'PlayerStart'` is given an arrow function, which is called with the
  position and here only remembers it in `playerStart`.
- The last argument is a tile for the editor to show as the icon.

### loadLevel
`engineObjectsDestroy()` removes everything from the last time. Then
`tileLayersLoad(level, tile(0, 16), 0, 0)` makes a `TileCollisionLayer`
for the tile layer: the arguments are the map, a tile that says which
sheet and tile size to use, the render order, and which layer is solid,
here layer 0.
`objectLayersLoad(level)` makes the objects, which sets `playerStart`,
and the player is made there.

### The editor's hooks
`levelEditor` is the engine's editor object, and a game sets what it
needs on it:

- `onRestart = loadLevel` gives the editor a Restart button that
  rebuilds the level.
- `paletteTiles = [0, 1, 10]` lists the tiles to offer for painting.
  Left out, every tile of the sheet is offered.
- `onPlayFrom` is given a position and puts the player there, for the
  editor's Play from mouse.
- `levelEditor.open()` opens the editor, which pauses the game. A game
  that does not call it opens the editor with Escape, then 0.

In a release build the editor is not there and these calls do nothing.

### The game
`Player` is a solid object one unit wide and two tall. `keyDirection()`
is a vector from the arrow keys. `groundObject` is what the player is
standing on, if anything: on the ground it speeds up by `.1` a frame
and can jump, in the air by `.01`. `clamp` keeps the x speed within
`.3` units a frame, and the camera follows the player's x.

A `Coin` has `mass = 0` so gravity leaves it where it was placed. Its
`update` adds its `value` to the score and destroys it when the player
is within one unit.

## Try it
- Make each coin worth 5: change the defaults `{value: 1}` to
  `{value: 5}`.
- Add a tile to the palette: `[0, 1, 10]` to `[0, 1, 10, 11]`.
- A lower jump: `this.velocity.y = .9` to `.6`.
- A faster run: the `clamp` limits `-.3, .3` to `-.5, .5`.

## See also
Platforming Game in the full examples uses the editor on a whole game,
with a level loaded from a file. Tile Layer and Platformer Game cover
the tile layer and the platforming. 3D Level Editor is the same idea
in 3D, and EDITOR.md in the repository lists everything a game can add
to the editor.
*/
