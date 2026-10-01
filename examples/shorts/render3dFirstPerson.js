// walk a small maze with a first person camera; at night the player's
// flashlight, a spotlight, lights the way and casts the shadows
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
const cellSize = 2, wallHeight = 3, eyeHeight = 1.5;
let player, flashlight, night = true;

// the world position of a maze cell, at a height
const cellPos = (x, z, y)=> vec3(
    (x - mazeSize.x/2 + .5)*cellSize, y, (z - mazeSize.y/2 + .5)*cellSize);

function gameInit()
{
    new Render3DPlugin;
    render3D.shadows = true;
    render3D.shadowCenter = vec3();
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
        wall.color = hsl(.08, .3, rand(.4,.5));
        wall.setCollision();
    }

    // glowing lamps to find around the maze
    for (const [x, z, hue] of [[8,1,0], [3,3,.3], [5,7,.6]])
    {
        const pos = cellPos(x, z, 1.5);
        const lamp = new EngineObject3D(pos, render3D.sphereMesh);
        lamp.color = hsl(hue,1,.6);
        lamp.scale3D = vec3(.5);
        lamp.emissive = 1;
        lamp.addChild(new Light3D(vec3(), 8, lamp.color));
    }

    // the player is a first person camera that bumps into walls
    player = new FirstPersonCamera3D(cellPos(1, 9, eyeHeight));
    player.size3D = vec3(1);
    player.collideAsSphere3D = true;
    player.setCollision();

    // the flashlight: a light with a cone is a spotlight, coneSoftness is
    // how much of the cone is its fading edge
    flashlight = new Light3D(vec3(), 25, hsl(.13,.4,.9), 3);
    flashlight.coneAngle = .45;
    flashlight.coneSoftness = .6;
    setNight(night);
}

// night: a dark sky, and the flashlight casts the shadows in place of
// the sun; day: the sun does, and the flashlight is off
function setNight(on)
{
    night = on;
    const sky = on ? .08 : .5;
    render3D.setSky(hsl(.6,.5,sky), hsl(.6,.4,sky*1.6));
    render3D.setFog(8, 30);
    render3D.ambientColor = hsl(.6,.2,on ? .06 : .4);
    render3D.sunColor = hsl(.6,.2,on ? .05 : 1);
    render3D.shadowLight = on ? flashlight : undefined;
    flashlight.intensity = on ? 3 : 0;
}

function gameUpdate()
{
    keyWasPressed('KeyN') && setNight(!night); // N is night and day
    if (keyWasPressed('KeyF')) // F toggles flying
    {
        player.fly = !player.fly;
        if (!player.fly)
            player.pos3D.y = eyeHeight;
    }
}

function gameUpdatePost()
{
    // the flashlight shines the way the camera looks, held in a hand to the
    // right and a little down: a light at the eye would hide its own shadows
    const hand = render3D.cameraRight.scale(.4).add(vec3(0, -.3, 0));
    flashlight.pos3D = render3D.camera.pos.add(hand);
    flashlight.rotation3D = render3D.camera.rotation.copy();
}

function gameRenderPost()
{
    const mode = player.fly ? 'flying' : 'walking';
    const text = `click: look / WASD: move / F: fly (${mode}) / N: night`;
    const color = night ? WHITE : BLACK;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, color);
}
