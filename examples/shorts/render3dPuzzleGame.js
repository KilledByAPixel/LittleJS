// push every block onto a pad, using an orthographic camera
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
            new ParticleEmitter3D(
                particlePos, .6, .1,              // pos, emitSize, emitTime
                500, PI, undefined,               // rate, cone, tileInfo
                litColor, WHITE,                  // colorStartA, colorStartB
                hsl(0,1,.5,0), hsl(.1,1,.5,0),    // colorEndA, colorEndB
                .5, .3, 0,                        // time, sizeStart, sizeEnd
                .1, .95, -.004,                   // speed, damping, gravity
                .1, .5, true                      // fade, randomness, additive
            );
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

function gameRender()
{
    // outline the hovered cell with a debug primitive
    if (hoverCell)
        debugBox3D(cellPos(hoverCell.x, hoverCell.y, .03),
            vec3(.95,.05,.95), WHITE);
}

function gameRenderPost()
{
    const text = 'arrows or click: move / R: reset';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 40, BLACK);
    const solvedPos = vec2(mainCanvasSize.x/2, mainCanvasSize.y - 50);
    const isSolved = goals.every(g=> boxAt(g.cell.x, g.cell.y));
    isSolved && drawTextScreen('SOLVED!', solvedPos, 50, YELLOW);
}
