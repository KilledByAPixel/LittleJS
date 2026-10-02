const levelData =
[
    '#######',
    '##..###',
    '#G.B..#',
    '#.#B#G#',
    '#.@B..#',
    '##..G.#',
    '#######',
];
const levelSize = levelData.length;
const cellPos = (x, z, y)=> vec3(x - levelSize/2+.5, y, z - levelSize/2+.5);
const isWall = (x, z)=> levelData[z][x] == '#';
const boxAt = (x, z)=> boxes.find(b=> b.cell.x == x && b.cell.y == z);
const padColor = hsl(.1,1,.3), litColor = hsl(.15,1,.6);
const pushSound = new Sound([.5,,150,.01,,,,,9,-50]);
let wallMesh, blockMesh, ballMesh, padMesh;
let level, boxes, goals, player, hoverCell;

class GridObject extends EngineObject3D
{
    constructor(x, z, mesh, color, height=0)
    {
        super(cellPos(x, z, height), mesh);
        this.color = color;
        this.cell = vec2(x, z);
        this.height = height;
        this.startPos = this.pos3D.copy();
        this.moveTimer = new Timer;
    }
    moveTo(x, z)
    {
        this.startPos = this.pos3D.copy();
        this.cell = vec2(x, z);
        this.moveTimer.set(.12);
    }
    update()
    {
        // slide into the new cell
        const target = cellPos(this.cell.x, this.cell.y, this.height);
        const movePercent = this.moveTimer.getPercent();
        this.pos3D = this.startPos.lerp(target, movePercent);
    }
}

class Goal extends GridObject
{
    constructor(x, z)
    {
        super(x, z, padMesh, padColor);
        this.light = new Light3D(vec3(0,.57,0), 4, hsl(.1,1,.6,0));
        this.addChild(this.light);
    }
    update()
    {
        // light up while a block is on the pad, with a burst when it lands
        const active = boxAt(this.cell.x, this.cell.y);
        const particlePos = cellPos(this.cell.x, this.cell.y, .5);
        if (active && !this.active)
            particleEffect3D('explosion', particlePos, {scale: .6,
                colorStartA: litColor, colorStartB: WHITE});
        this.active = active;
        this.color = active ? litColor : padColor;
        this.light.color.a = active ? 1 : 0;
        this.emissive = active ? 1 : .3 + .2*sin(time*4); // pulse while empty
    }
}

function buildLevel()
{
    level?.forEach(o=> o.destroy());
    level = [], boxes = [], goals = [];
    for (let z = levelSize; z--;)
    for (let x = levelSize; x--;)
    {
        const c = levelData[z][x];
        if (c == '#')
            level.push(new EngineObject3D(cellPos(x, z, .3), wallMesh));
        else if (c == 'G')
            goals.push(new Goal(x, z));
        else if (c == 'B')
            boxes.push(new GridObject(x, z, blockMesh, hsl(.5,.7,.5), .4));
        else if (c == '@')
            player = new GridObject(x, z, ballMesh, hsl(0,.9,.6), .4);
    }
    level.push(player, ...boxes, ...goals);
}

function tryMove(moveX, moveZ)
{
    // walk one cell, pushing a block if one is in the way
    const x = player.cell.x + moveX, z = player.cell.y + moveZ;
    if (isWall(x, z))
        return;
    const box = boxAt(x, z);
    if (box)
    {
        const bx = x + moveX, bz = z + moveZ;
        if (isWall(bx, bz) || boxAt(bx, bz))
            return;
        box.moveTo(bx, bz);
        render3D.playSound(pushSound, box.pos3D);
    }
    player.moveTo(x, z);
}

function gameInit()
{
    new Render3DPlugin;
    canvasClearColor = hsl(0,.1,.5);
    render3D.ambientColor = hsl(.6,.3,.4);
    render3D.shadows = true;
    render3D.shadowRange = levelSize + 4;
    render3D.shadowCenter = vec3();
    render3D.onRenderTransparent = drawHover;

    // angled orthographic camera looking down at the board
    render3D.camera.pos = vec3(7,8,7);
    render3D.camera.lookAt(vec3(0,.5,0));
    render3D.camera.orthographic = levelSize;

    // make a checkered floor
    const checker = (x, z)=> hsl(0, 0, (x+z)&1 ? .4 : .3);
    const floorMesh = buildGrid(vec2(levelSize), levelSize, checker);
    new EngineObject3D(vec3(), floorMesh);

    // build all the meshes and the level
    wallMesh = buildBox(vec3(.9,.6,.9)).setColor(hsl(.6,.1,.3));
    blockMesh = buildBox(vec3(.7,1,.7));
    ballMesh = buildSphere(.8);
    padMesh = buildBox(vec3(1,.1,1));
    buildLevel();
}

function gameUpdate()
{
    if (keyWasPressed('ArrowLeft'))  tryMove(-1, 0);
    if (keyWasPressed('ArrowRight')) tryMove(1, 0);
    if (keyWasPressed('ArrowUp'))    tryMove(0, -1);
    if (keyWasPressed('ArrowDown'))  tryMove(0, 1);
    if (keyWasPressed('KeyR'))       buildLevel();

    // the cell under the mouse: a block under it, else where it meets the floor
    const picked = render3D.pick(mousePosScreen, boxes)?.object;
    const ground = render3D.screenToGround(mousePosScreen);
    const toCell = (v)=> clamp(floor(v + levelSize/2), 0, levelSize-1);
    const groundCell = ground && vec2(toCell(ground.x), toCell(ground.z));
    hoverCell = picked ? picked.cell : groundCell;
    if (hoverCell && isWall(hoverCell.x, hoverCell.y))
        hoverCell = undefined;

    // click a cell beside the player to step there, pushing a block
    if (mouseWasPressed(0) && hoverCell)
    {
        const offset = hoverCell.subtract(player.cell);
        if (abs(offset.x) + abs(offset.y) == 1)
            tryMove(offset.x, offset.y);
    }
}

function drawHover()
{
    // outline the hovered cell, a path that ends where it starts is a loop
    if (!hoverCell)
        return;
    const p = cellPos(hoverCell.x, hoverCell.y, .08);
    const corner = (x, z)=> p.add(vec3(x*.47, 0, z*.47));
    const loop = [corner(-1,-1), corner(1,-1), corner(1,1), corner(-1,1)];
    render3D.drawRibbon([...loop, loop[0]], .05);
}

function gameRenderPost()
{
    const text = 'arrows or click: move / R: reset';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 40, BLACK);
    const solvedPos = vec2(mainCanvasSize.x/2, mainCanvasSize.y - 50);
    const isSolved = goals.every(g=> boxAt(g.cell.x, g.cell.y));
    isSolved && drawTextScreen('SOLVED!', solvedPos, 50, YELLOW);
}

/* info
Push every block onto a pad, using an orthographic camera. The arrow
keys move the red ball one cell, and walking into a block pushes it if
the cell behind it is free. Clicking a cell beside the ball steps there
too. R starts the level again.

## How it works
The puzzle is a grid, and the rules only ever look at the grid: which
cell the player is in, where the walls are, which cells hold a block.
The 3D objects follow the grid, sliding to where their cell is.

### The level
`levelData` is the map as text, one string a row: `#` a wall, `.` floor,
`B` a block, `G` a pad and `@` the player. A cell is `x` along a row and
`z` for which row. `cellPos(x, z, y)` is a cell's center in the world,
shifted by half the level so the board is centered on the origin.
`isWall` reads the map, and `boxAt` finds the block in a cell, if any.

### GridObject
The player and the blocks are `GridObject`s, an `EngineObject3D` that
also keeps its `cell`.

`moveTo` does not move the object. It changes the cell, remembers where
the object is now, and sets `moveTimer` to .12 seconds. `update` then
places it each frame at `startPos.lerp(target, percent)`, where
`getPercent()` goes from 0 to 1 over the timer's time. A timer that was
never set gives 0, which leaves a new object at its start.

### Goal
A pad is a `GridObject` with a `Light3D` child. The light's color starts
with an alpha of 0, which switches a light off. In `update`, `boxAt`
says whether a block is on the pad. If so the pad takes its lit color,
`emissive = 1` draws it at full brightness and the light's alpha is set
to 1. An empty pad pulses its `emissive` with `sin(time*4)`. On the
frame a block arrives, `particleEffect3D` plays the built in explosion
at .6 of its size with two of its colors replaced.

### tryMove
The rules. The cell ahead must not be a wall. If a block is there, the
cell beyond it must be free of walls and blocks, and the block moves
there. Then the player moves. `render3D.playSound` plays the push
sound at the block's place.

### gameInit
- `canvasClearColor` is the background, since there is no sky.
- `shadowCenter` and `shadowRange` keep the shadow map on the board, 4
  units wider than it, in place of following the camera.
- The camera is put at `vec3(7,8,7)` and `lookAt` aims it at the board.
  `camera.orthographic = levelSize` makes the view orthographic: there
  is no perspective, and the number is the height of the view in world
  units. 0 is a perspective camera.
- The meshes are built once and shared. `buildBox` takes a full size,
  and `buildGrid(size, segments, color)` is the checkered floor, one
  segment a cell.

### The mouse
`render3D.pick(mousePosScreen, boxes)` finds the nearest of the given
objects under the mouse, tested by the box around its mesh, and returns
it as `object`, or nothing. `render3D.screenToGround(mousePosScreen)`
is where the mouse meets the ground plane at height 0. The hovered cell
is the picked block's cell, or else the ground point turned into a cell
by `toCell`, and a wall cell is no hover. A click on a cell one step
from the player calls `tryMove` with the offset.

`drawHover` outlines the hovered cell with `render3D.drawRibbon(points,
width)`. It is set as `render3D.onRenderTransparent` because 3D draws
only work inside the 3D pass, and that callback runs in it.

## Try it
- Open up the level: change the row `'##..###'` to `'##...##'`.
- Slide slowly: `this.moveTimer.set(.12)` to `this.moveTimer.set(.5)`.
- Set `render3D.camera.orthographic` to `0` for a perspective view
  from the same place.
- Look from straight above: `vec3(7,8,7)` to `vec3(0,12,.1)`.

## See also
3D Collision shows picking on its own, and 3D Drawing the immediate
mode draws like `drawRibbon`. Sliding Puzzle is a 2D game on a grid.
Look up `Camera3D` for `orthographic`, and `render3D.pick`.
*/
