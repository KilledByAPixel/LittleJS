let player, playerStart = vec3(0, 2, 6), score = 0;

// the level as plain data, the editor edits it in place and saves it;
// a color in a level is a hex string, written here from its hsl
const color = (h, s, l)=> hsl(h, s, l).toString(false);
// its scene block sets the sky, the sun and the shadows, the editor's
// Scene box changes them
const level = {littlejs3D: 1,
    scene: {sky: [color(.6, .5, .4), color(.6, .5, .8), color(.6, .5, .8)],
        sunDirection: [-.3, 1, .5], shadows: true},
    // a map of blocks, 16 by 8 by 16 cells, painted with the Blocks tool
    // (B): its blocks are runs of a count and a type, here a low wall
    voxels: {pos: [-8, 0, -8], size: [16, 8, 16],
        blocks: [258, 0, 4, 10, 12, 0, 4, 10, 1770, 0]},
    objects: [
    {id: 1, type: 'Box', pos: [0, -.5, 0], scale: [16, 1, 16],
        properties: {color: color(.3, .3, .4)}},
    {id: 2, type: 'Box', pos: [-3.5, 1, -2.5], scale: [1, 2, 5],
        properties: {color: color(.08, .4, .5)}},
    {id: 3, type: 'Box', pos: [3, .5, -3], scale: [2, 1, 2],
        properties: {color: color(.65, .3, .6)}},
    {id: 4, type: 'Coin', pos: [3, 2, -3]},
    {id: 5, type: 'Coin', pos: [-1.5, 1, 1.5]},
    {id: 6, type: 'Light', pos: [0, 4, 0],
        properties: {color: color(.1, 1, .7), radius: 12}},
    {id: 7, type: 'PlayerStart', pos: [0, 2, 6]},
]};

class Coin extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, render3D.sphereMesh, undefined, hsl(.15, 1, .5));
        this.scale3D = vec3(.6, .6, .15); // a disc
        this.emissive = .5;
    }

    update()
    {
        this.rotation3D.y += .05;
        if (player && player.pos3D.distance(this.pos3D) < 1)
        {
            ++score;
            this.destroy();
        }
    }
}

// build the level from its data, and again when the editor restarts it
function loadLevel()
{
    engineObjectsDestroy();
    level3DLoad(level);
    player = new FirstPersonCamera3D(playerStart, 0, 0);
    player.size3D = vec3(.6, 1.6, .6); // a body, so the boxes stop it
    player.eyeHeight = .6;
    player.jumpSpeed = .2;
    player.setCollision();
    score = 0;
}

function gameInit()
{
    new Render3DPlugin;
    render3D.gravity.y = -.01;

    // the object types, by the names they have in the level; Box, Sphere,
    // Cylinder and Light are built in
    level3DAddType('Coin', Coin);
    level3DAddType('PlayerStart', (pos)=> playerStart = pos);
    loadLevel();

    // the editor opens with the game's view, so look at the level
    render3D.camera.pos = vec3(0, 7, 13);
    render3D.camera.lookAt(vec3(0, 0, 0));

    // start in the level editor, its Restart button rebuilds the level,
    // and Play from mouse puts the player where the mouse is
    levelEditor.onRestart = loadLevel;
    levelEditor.onPlayFrom = (pos)=>
    {
        player.pos3D = pos.add(vec3(0, 1, 0));
        player.velocity3D = vec3();
    };
    levelEditor.open();
}

function gameRenderPost()
{
    drawTextScreen('Coins ' + score, vec2(mainCanvasSize.x / 2, 40), 40);
}

/* info
A small 3D level that starts in the 3D level editor. Place boxes, lights
and coins, paint blocks, then press Play or Escape to walk around, and
Escape again to go back to editing. The level is autosaved as you go.

In the editor: click selects, W, E and R move, rotate and scale with
handles, pick a type in the panel and click to place it, B paints
blocks, the right button looks around and Ctrl+Z undoes. The `?` key
lists every key. While playing: click to capture the mouse and look,
WASD or the arrow keys walk, Space jumps.

## How it works
The game keeps its level as data, and the editor changes that same
data. The code here is what any game needs for that: a level, the types
of object it can hold, and a function that builds it.

### The level
`level` is a plain object in the format `level3DLoad` reads, the same
that the editor's Save writes as a JSON file.

- `objects` is the list. Each has an `id`, a `type` name, a `pos` of
  `[x, y, z]`, and where they are not the default a `rotation` in
  degrees, a `scale` and `properties`.
- A color in a level is a hex string. The `color` helper at the top
  writes one from `hsl` with `toString(false)`, which leaves the alpha
  out.
- `scene` sets the sky's three colors, the sun's direction and the
  shadows when the level loads.
- `voxels` is a map of blocks: its corner, its size in cells, and its
  blocks as runs of a count and a type. Type 0 is empty.

### Types
`level3DAddType(name, make)` says what to make for each type name.
`Box`, `Sphere`, `Cylinder` and `Light` are built in. A built in box is
one unit across, so its `scale` is its size, and it is solid.

- `'Coin'` is a class, made with `new Coin(pos3D, properties)`. Its
  constructor takes the position and builds the coin: the shared sphere
  squashed to a disc with `scale3D`. Its `update` turns it and destroys
  it when the player is within 1 unit.
- `'PlayerStart'` is an arrow function, which is called and not made
  with `new`. It makes nothing and keeps the position.

### loadLevel
`engineObjectsDestroy()` removes everything, `level3DLoad(level)` makes
every object in the level, and then the player is made at the start.
The player is a `FirstPersonCamera3D`, an object that moves with the
keys and puts the camera at its position. Giving it a `size3D` and
calling `setCollision()` gives it a body the boxes and blocks stop.
`eyeHeight` lifts the eye above the body's middle, and `jumpSpeed` is
the speed of a jump in units per frame, which `render3D.gravity` then
pulls back down.

### The editor's hooks
`levelEditor` is the editor. `open()` opens it and pauses the game.

- `onRestart` is called to build the level again from what was edited.
  Setting it gives the editor a Restart button.
- `onPlayFrom` is given a position, and setting it gives the editor
  Play from mouse. Here it puts the player 1 unit above that point.

The two `render3D.camera` lines aim the game's camera at the level,
since the editor opens with the game's view.

## Try it
- Press B and drag on the floor to paint blocks, then Escape to walk
  on them.
- Add an object in the code: after the `PlayerStart` line add
  `{id: 8, type: 'Sphere', pos: [2, 1, 2], scale: [2, 2, 2]},`.
- Jump higher: `player.jumpSpeed = .35;`.
- Change `shadows: true` to `shadows: false` in the scene block.
- Collect coins from farther away: `< 1` to `< 3` in `Coin`.

## See also
3D Prefab Maker uses the editor to build one thing a game places many
times. Level Editor is the 2D editor, and 3D First Person and 3D Voxels
show the player and the blocks on their own.
[EDITOR.md](https://github.com/KilledByAPixel/LittleJS/blob/main/EDITOR.md)
explains how a game adds its own keys, buttons and tools.
*/
