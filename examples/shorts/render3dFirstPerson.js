// walk a small maze with a first person camera
const mazeData =
[
    '##########',
    '#........#',
    '#.##.###.#',
    '#.#....#.#',
    '#.#.##.#.#',
    '#...#..#.#',
    '###.#.##.#',
    '#...#....#',
    '#.####.#.#',
    '#........#',
    '##########',
];
const mazeSize = vec2(mazeData[0].length, mazeData.length);
const cellSize = 2, wallHeight = 3, eyeHeight = 1.6;
let player;

// the world position of a maze cell, at a height
const cellPos = (x, z, y)=> vec3(
    (x - mazeSize.x/2 + .5)*cellSize, y, (z - mazeSize.y/2 + .5)*cellSize);

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.5), hsl(.6,.4,.8));
    render3D.setFog(8, 30);
    render3D.ambientColor = hsl(.6,.2,.4);
    render3D.shadows = true;
    render3D.shadowCenter = vec3(); // pinned over the whole maze
    render3D.shadowRange = mazeSize.y*cellSize*1.5;

    // make a checkered floor and a solid block for every wall
    const checker = (x, z)=> hsl(0, 0, (x+z)/cellSize&1 ? .45 : .35);
    const floorSize = mazeSize.scale(cellSize);
    new EngineObject3D(vec3(), buildGrid(floorSize, mazeSize, checker));
    for (let z = mazeSize.y; z--;)
    for (let x = mazeSize.x; x--;)
    {
        if (mazeData[z][x] != '#')
            continue;
        const pos = cellPos(x, z, wallHeight/2);
        const wall = new EngineObject3D(pos, render3D.boxMesh);
        wall.scale3D = vec3(cellSize, wallHeight, cellSize);
        wall.color = hsl(.08, .3, rand(.45,.55));
        wall.setCollision();
    }

    // glowing lamps to find around the maze
    for (const [x, z, hue] of [[8,1,0], [3,3,.3], [5,7,.6]])
    {
        const lamp = new EngineObject3D(cellPos(x, z, 2), render3D.sphereMesh);
        lamp.color = hsl(hue,1,.6);
        lamp.scale3D = vec3(.5);
        lamp.emissive = 1;
        lamp.addChild(new Light3D(vec3(), 8, lamp.color));
    }

    // the player is a first person camera that bumps into walls
    player = new FirstPersonCamera3D(cellPos(1, 9, eyeHeight), 0, 0);
    player.size3D = vec3(1);
    player.collideAsSphere3D = true;
    player.setCollision();
}

function gameUpdate()
{
    if (keyWasPressed('KeyF')) // F toggles flying, walking lands at eye height
    {
        player.fly = !player.fly;
        if (!player.fly)
            player.pos3D.y = eyeHeight;
    }
}

function gameRenderPost()
{
    const mode = player.fly ? 'flying' : 'walking';
    const text = `click: look / WASD: move / F: fly (${mode})`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}
