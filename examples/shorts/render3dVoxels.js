const names = ['Grass','Dirt','Stone','Wood','Leaves','Water','Glass'];
let map, player, hit, selected = 1;

// draw block textures into a small tile sheet, 16 pixels each
function makeTiles()
{
    const context = createCanvasContext(128, 16);
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
        context.fillStyle = color.toString();
        context.fillRect(i*16 + x, y, 1, 1);
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
    map = new VoxelMap(vec3(), vec3(50), tile(0, 16, makeTiles()));
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

    player = new FirstPersonCamera3D(vec3(25, 9, 25));
    player.setCollision();
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
    drawRect(center, vec2(2,20), WHITE, 0, true, true);
    drawRect(center, vec2(20,2), WHITE, 0, true, true);
    const selectedName = selected + ' ' + names[selected-1];
    drawTextScreen(selectedName, vec2(center.x, mainCanvasSize.y - 40), 40);
}
