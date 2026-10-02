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

/* info
Walk a small maze with a first person camera. At night the player's
flashlight, a spotlight, lights the way and casts the shadows. Click to
capture the mouse and look around, walk with WASD or the arrow keys,
press F to fly and N to switch between night and day. Escape lets the
mouse go.

## How it works
### The maze
`mazeData` is the maze as rows of text, `#` for a wall. The function
`cellPos(x, z, y)` turns a cell into a world position: cells are 2 units
wide and the maze is centered on the origin, with the rows along z.

- The floor is `buildGrid(size, segments, color)` with one grid cell for
  each maze cell, colored by the `checker` function.
- Each wall is the shared `render3D.boxMesh` with `scale3D` making it 2
  by 3 by 2. `setCollision()` makes it solid, and its mass of 0 keeps it
  still.
- Each lamp is a small ball with `emissive = 1`, so it shows in its own
  color with no shading, and a `Light3D` attached with `addChild`.
  `new Light3D(pos3D, radius, color)` is a point light that fades to
  nothing at its radius, 8 units here.

### The player
`new FirstPersonCamera3D(pos3D)` is an object that reads the mouse and
keys, moves itself, and puts the camera where it is. It starts in cell
`(1, 9)` at eye height. `size3D = vec3(1)` with `collideAsSphere3D` and
`setCollision()` give it a round body one unit across that the walls
push back out.

`render3D.gravity` is left at zero, so the player stays at the height it
has. With `fly` on, the keys move it the way it looks, up and down too,
and when F turns flying off the code puts it back at eye height.

### The flashlight
A `Light3D` with a `coneAngle` is a spotlight. It shines along its own
forward direction, which `rotation3D` turns.

- `new Light3D(vec3(), 25, color, 3)` reaches 25 units at 3 times the
  color's brightness.
- `coneAngle = .45` is the angle in radians from the middle of the beam
  to its edge, so the whole beam is .9 radians across.
- `coneSoftness = .6` fades the outer 60% of the cone, where 0 would be
  a hard edge.

`gameUpdatePost` runs after the camera has moved. It puts the light .4
to the camera's right and .3 down, and copies the camera's rotation, so
the beam points where the player looks. The comment in the code says
why it is not at the eye: seen from the light itself, every shadow is
hidden behind the thing that casts it.

### Night and day
`render3D.shadows = true` turns shadows on, and by default the sun casts
them. `render3D.shadowLight = flashlight` has the spotlight cast them in
its place, and `undefined` gives them back to the sun.

`setNight` changes the rest with it: the sky and ambient colors, the
sun's color, almost black at night, and the flashlight's `intensity`,
where 0 switches a light off. `setFog(8, 30)` starts the fog 8 units
from the camera and makes it total at 30, in the sky's horizon color.

`shadowCenter` and `shadowRange` are for the sun's shadows: the area
they cover is centered on the origin and 33 units wide, one and a half
times the maze's length, which covers it from any angle.

## Try it
- Narrow the beam: `coneAngle = .45` to `.2`.
- Set `coneSoftness` to `0` for a hard edged circle of light.
- Start in daylight: `night = true` to `night = false`.
- Open a wall: change the row `'#.##.###.#'` to `'#........#'`.
- Set `wallHeight` to `6`.

## See also
3D Voxels uses the same camera with gravity and jumping. 3D Lights has
point lights and a directional light, and the `LensFlare3D` of 3D Lens
Flare can be a light's flare through `flare.light`. Look up `Light3D`
and `FirstPersonCamera3D`.
*/
