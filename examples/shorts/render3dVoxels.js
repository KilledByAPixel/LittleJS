const names = ['Grass','Dirt','Stone','Wood','Leaves','Water','Glass'];
let map, player, hit, selected = 1;

// draw block textures into a small tile sheet, 16 pixels each, with a
// 2 pixel border of each tile's edge so the mipmaps do not blend tiles
function makeTiles()
{
    const context = createCanvasContext(8*20, 20);
    const colors = [hsl(.3,.6,.45), hsl(.1,.4,.35), hsl(.1,.4,.35),
        hsl(0,0,.5), hsl(.1,.5,.3), hsl(.3,.6,.35), hsl(.6,.8,.5,.6),
        hsl(.55,.3,.9,.3)];
    for (let i = 8; i--;)
    for (let y = 16; y--;)
    for (let x = 16; x--;)
    {
        let color = colors[i].scale(rand(.85, 1.1), 1);
        if (i == 1 && y < 4 + rand(2)) color = colors[0]; // grass edge
        if (i == 5 && rand() < .3) color = CLEAR_BLACK;   // leaf holes
        if (i == 7 && !(x%15 && y%15)) color = WHITE;     // glass rim
        // an edge pixel also fills the border beside it
        const left = x ? 0 : 2, top = y ? 0 : 2;
        const w = 1 + left + (x < 15 ? 0 : 2), h = 1 + top + (y < 15 ? 0 : 2);
        context.fillStyle = color.toString();
        context.fillRect(i*20 + 2 + x - left, 2 + y - top, w, h);
    }
    return new TextureInfo(context.canvas);
}

// a trunk with a ball of leaves on top
function tree(x, y, z)
{
    for (let i = 4; i--;) map.setVoxel(vec3(x, y+i, z), 4);
    for (let dx = -2; dx <= 2; ++dx)
    for (let dz = -2; dz <= 2; ++dz)
    for (let dy = 3; dy <= 5; ++dy)
    {
        const cell = vec3(x+dx, y+dy, z+dz);
        if (abs(dx) + abs(dz) + dy < 8 && !map.getVoxel(cell))
            map.setVoxel(cell, 5);
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky();
    render3D.gravity = vec3(0, -.01, 0);
    setDrawScreenSpace(true); // the only 2D drawing is the hud
    const sheet = tile(0, 16, makeTiles(), 2); // 2 pixel borders
    map = new VoxelMap(vec3(), vec3(50), sheet);
    map.setBlockType(1, {top:0, side:1, bottom:2});
    for (let i = 5; i < 8; ++i)
        map.setBlockType(i, i, {seeThrough: i==5, transparent: i>5});

    // rolling hills of grass over dirt over stone, water in low parts
    for (let x = 48; x--;)
    for (let z = 48; z--;)
    {
        const h = 6 + 3*sin(x/7) + 3*cos(z/9) | 0;
        for (let y = 0; y <= h; ++y)
            map.setVoxel(vec3(x,y,z), y==h ? 1 : y>h-3 ? 2 : 3);
        for (let y = h+1; y < 6; ++y)
            map.setVoxel(vec3(x,y,z), 6);
        if (h > 7 && rand() < .01)
            tree(x, h+1, z);
    }

    // the player starts on a hill, and goes into water, under it
    player = new FirstPersonCamera3D(vec3(11, 12, 44));
    player.setCollision();
    player.collideWithVoxel = (type)=> type != 6;
    player.size3D = vec3(.5, 1.5, .5);
    player.jumpSpeed = .2;
    player.eyeHeight = .6; // near the top of the body

    // outline block under the crosshair
    render3D.onRenderTransparent = ()=> hit && render3D.drawBox(
        map.pos3D.add(hit.cell).add(vec3(.5)), 1.02, hsl(0,0,1,.5));
}

function gameUpdate()
{
    for (let i = 7; i--;)
        if (keyWasPressed('Digit' + (i+1)))
            selected = i + 1;

    // get the block in the middle of the view
    const ray = render3D.screenToRay(mainCanvasSize.scale(.5));
    hit = map.raycast(ray, 6, (type)=> type != 6); // ignore water
    if (!hit || !pointerLockIsActive()) return;
    if (mouseWasPressed(0))
        map.setVoxel(hit.cell, 0);
    if (mouseWasPressed(2))
    {
        // place against the face, unless it would be in the player
        const cell = hit.cell.add(hit.normal);
        const center = map.pos3D.add(cell).add(vec3(.5));
        const pos = player.pos3D, size = player.size3D;
        if (!isOverlapping3D(center, vec3(1), pos, size))
            map.setVoxel(cell, selected);
    }
}

function gameRenderPost()
{
    // crosshair and the selected block
    const center = mainCanvasSize.scale(.5);
    drawRect(center, vec2(2,20));
    drawRect(center, vec2(20,2));
    const selectedName = selected + ' ' + names[selected-1];
    drawTextScreen(selectedName, vec2(center.x, mainCanvasSize.y - 40), 40);
}

/* info
A small world of blocks to walk around in, dig and build. Click to
capture the mouse, then the mouse looks, WASD or the arrow keys walk and
space jumps. The left button removes the block under the crosshair, the
right button places one against it, and keys 1 to 7 choose which kind.
Escape lets the mouse go.

## How it works
A `VoxelMap` is a 3D grid of blocks, the 3D twin of a tile layer. Each
cell holds a number: 0 is empty, and 1 to 255 is a block type. The map
draws itself, leaving out the faces between blocks, and objects collide
with it.

### The tile sheet
`makeTiles` paints the block textures on a canvas, eight tiles of 16
pixels in a row. Each pixel is the tile's color with its brightness
varied at random by `color.scale(rand(.85, 1.1), 1)`, where the second
argument keeps the alpha as it is. Three tiles get more: a grass edge
along the top of tile 1, holes in the leaves, and a white rim on the
glass.

Each tile sits in a cell of 20 pixels, with a 2 pixel border that
repeats its edge pixels. Far away the texture is drawn from smaller,
blurred copies, and without the border each tile would blend with the
ones beside it. `tile(0, 16, makeTiles(), 2)` is the sheet's first tile,
with that 2 pixel padding as the fourth argument.

### The map
`new VoxelMap(pos3D, mapSize, tileInfo)` has its corner at `pos3D`, the
origin here, is 50 cells each way, and a cell is one world unit.

A block type shows the tile of its own number on every face unless
`setBlockType(type, faces, options)` says otherwise:

- Type 1, grass, has tile 0 on top, 1 on its sides and 2 below.
- Types 5 to 7 use their own tile. Leaves are `seeThrough`: the texture
  has holes, so blocks beside them keep their faces. Water and glass are
  `transparent`, drawn blended with what is behind them, and from both
  sides, so from under the water its surface shows overhead.

The loops in `gameInit` fill the columns. `h` is the ground height from
a sine and a cosine, `setVoxel(cell, type)` puts grass on top, two dirt
under it and stone below, and columns lower than 5 get water up to
height 5. `tree` stacks four wood blocks and fills a rough ball of
leaves around the top, only into empty cells, which `getVoxel` tells.

### The player
`FirstPersonCamera3D` is a camera that is also an object with a mass.
`setCollision()` and a `size3D` give it a body half a unit wide and 1.5
tall, and `render3D.gravity` pulls it down. It starts above a hill and
drops onto it. The map asks an object's `collideWithVoxel(type)` whether
a block stops it, and the player's says every type but 6, water, so it
walks into water and sinks to the bottom, where it can walk and jump.
`jumpSpeed` is the upward speed space gives it while it stands on
something, and `eyeHeight` puts the eye .6 above the body's middle.

### Digging and building
`screenToRay` with the middle of the canvas is the ray the player looks
along. `map.raycast(ray, 6, test)` walks it cell by cell, 6 units at
most, and returns the first block that `test` accepts, here any but
water: its `cell`, its `type`, and `normal`, the face the ray came in
through.

Digging sets that cell to 0. Building sets the cell next to it,
`hit.cell.add(hit.normal)`, unless `isOverlapping3D` says a block there
would overlap the player's body. Both wait for `pointerLockIsActive()`,
so the click that captures the mouse changes nothing.

`render3D.onRenderTransparent` is called while the scene's see-through
things are drawn, and `drawBox` there draws a faint white box a little
bigger than the block being looked at. `setDrawScreenSpace(true)` makes
`drawRect` in `gameRenderPost` take pixels, for the crosshair.

## Try it
- Change `rand() < .01` to `rand() < .05` for a forest.
- Set `player.jumpSpeed` to `.35` to jump about six blocks high.
- Reach farther: `map.raycast(ray, 6,` to `map.raycast(ray, 20,`.
- Start with glass selected: `selected = 1` to `selected = 7`.
- Walk on water: change `type != 6` to `true`.

## See also
3D First Person uses the same camera in a maze of solid objects, and 3D
Height Map is the other kind of level.
*/
