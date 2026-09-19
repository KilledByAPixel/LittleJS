// push every block onto a pad, seen through an angled orthographic camera
const levelData =
[
    '#######',
    '#..G..#',
    '#..B..#',
    '#GB@BG#',
    '#..B..#',
    '#..G..#',
    '#######',
];
const levelSize = levelData.length;
const cellPos = (x, z, y=0)=> vec3(x - levelSize/2 + .5, y, z - levelSize/2 + .5);
const isWall = (x, z)=> levelData[z][x] == '#';
const boxAt = (x, z)=> boxes.find(b=> b.cell.x == x && b.cell.y == z);
const padColor = hsl(.1,.6,.3), litColor = hsl(.13,1,.6);
const pushSound = new Sound([,,150,.01,.02,.08,1,1.5,,,,,,,,,.05]);
let boxMesh, blockMesh, ballMesh, padMesh, level, boxes, goals, player, moves, hoverCell;

class GridObject extends EngineObject3D
{
    constructor(x, z, mesh, color, height=0)
    {
        super(cellPos(x, z, height), mesh, undefined, color);
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
        const p = this.moveTimer.isSet() ? min(this.moveTimer.getPercent(), 1) : 1;
        this.pos3D = this.startPos.lerp(cellPos(this.cell.x, this.cell.y, this.height), p);
    }
}

class Goal extends GridObject
{
    constructor(x, z)
    {
        super(x, z, padMesh, padColor, .03);
        this.light = new Light3D(cellPos(x, z, .6), 4, rgb(1,.8,.3,0));
    }
    update()
    {
        // light up while a block sits on the pad, with a burst the moment it lands
        const lit = !!boxAt(this.cell.x, this.cell.y);
        if (lit && !this.lit)
            new ParticleEmitter3D(
                cellPos(this.cell.x, this.cell.y, .5), // pos
                .6, .1, 80, PI, undefined,            // emitSize, emitTime, rate, cone, tileInfo
                litColor, WHITE,                      // colorStartA, colorStartB
                rgb(1,.5,0,0), rgb(1,1,0,0),          // colorEndA, colorEndB
                .7, .3, 0, .07, .95,                  // time, sizeStart, sizeEnd, speed, damping
                -.004, .1, .5, true                   // gravity, fade, randomness, additive
            );
        this.lit = lit;
        this.color = lit ? litColor : padColor;
        this.unlit = lit;
        this.light.color.a = lit ? 1 : 0;
    }
}

function buildLevel()
{
    level?.forEach(o=> o.destroy());
    level = [], boxes = [], goals = [], moves = 0;
    for (let z = levelSize; z--;)
    for (let x = levelSize; x--;)
    {
        const c = levelData[z][x];
        if (c == '#')
            level.push(new EngineObject3D(cellPos(x, z, .5), boxMesh, undefined, hsl(.6,.2,.4)));
        else if (c == 'G')
            goals.push(new Goal(x, z));
        else if (c == 'B')
            boxes.push(new GridObject(x, z, blockMesh, hsl(.05,.7,.5), .39));
        else if (c == '@')
            player = new GridObject(x, z, ballMesh, hsl(.55,.8,.6), .35);
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
    ++moves;
}

function gameInit()
{
    new Render3DPlugin;
    boxMesh = buildBox(.9);
    blockMesh = buildBox(.78);
    ballMesh = buildSphere(.7);
    padMesh = buildBox(vec3(1,.06,1));

    // an angled orthographic camera looking down at the board
    render3D.camera.pos = vec3(7,9,9);
    render3D.camera.lookAt(vec3());
    render3D.camera.orthographic = levelSize + 2;
    render3D.lightDirection = vec3(.4,-1,.3).normalize();
    render3D.ambientColor = hsl(.6,.3,.35);
    render3D.shadows = true;
    render3D.shadowRange = levelSize + 4;
    render3D.shadowCenter = vec3();
    render3D.setSky(hsl(.6,.6,.5), hsl(.55,.5,.6), hsl(.6,.5,.25));

    // a checkered floor, and a trophy that spins on top of the 2D text
    const checker = (x, z)=> (floor(x) + floor(z)) % 2 ? hsl(0,0,.35) : hsl(0,0,.28);
    new EngineObject3D(vec3(0,-.02,0), buildGrid(vec2(levelSize), levelSize, checker));
    const trophy = new EngineObject3D(vec3(5,3,-5), buildTorus(1, .3), undefined, litColor);
    trophy.angleVelocity3D = vec3(.01,.03,0);
    trophy.renderAfter2D = trophy.unlit = true;
    buildLevel();
}

function gameUpdate()
{
    if (keyWasPressed('ArrowLeft'))  tryMove(-1, 0);
    if (keyWasPressed('ArrowRight')) tryMove(1, 0);
    if (keyWasPressed('ArrowUp'))    tryMove(0, -1);
    if (keyWasPressed('ArrowDown'))  tryMove(0, 1);
    if (keyWasPressed('KeyR'))       buildLevel();

    // the cell under the mouse: a block if the ray hits one, else where it meets the floor
    const ray = render3D.screenToRay(mousePosScreen);
    const picked = render3D.raycastObjects(ray.origin, ray.direction, boxes)?.object;
    const ground = render3D.screenToGround(mousePosScreen);
    const groundCell = ground && vec2(floor(ground.x + levelSize/2), floor(ground.z + levelSize/2));
    hoverCell = picked ? picked.cell : groundCell;
    if (hoverCell && isWall(clamp(hoverCell.x, 0, levelSize-1), clamp(hoverCell.y, 0, levelSize-1)))
        hoverCell = undefined;
}

function gameRender()
{
    // outline the hovered cell with a debug primitive
    if (hoverCell)
        debugBox3D(cellPos(hoverCell.x, hoverCell.y, .03), vec3(.95,.05,.95), WHITE);
}

function gameRenderPost()
{
    const text = '3D Puzzle\narrows: move, R: reset, moves: ' + moves;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
    if (goals.every(g=> g.lit))
        drawTextScreen('SOLVED!', vec2(mainCanvasSize.x/2, mainCanvasSize.y - 50), 50, litColor);
}
