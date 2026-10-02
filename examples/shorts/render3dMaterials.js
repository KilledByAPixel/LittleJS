let light, bumped = [], shiny, normalMap;

// bricks with mortar between them and a few round dents, a height at
// each pixel of a 256 by 256 map, 8 bricks across and 16 rows
function brickHeight(x, y)
{
    const row = y >> 4, bx = (x + (row & 1)*16) & 31, by = y & 15;
    const mortar = bx < 2 || by < 2 ? 0 : 1;
    const dx = (x & 63) - 40, dy = (y & 63) - 24;
    const dent = max(0, 1 - hypot(dx, dy)/9);
    return mortar - dent*dent*.5;
}

// the tower's windows, a few lit, on a canvas as the emissive map
function windowTexture()
{
    const context = createCanvasContext(64);
    context.fillStyle = hsl(0,0,0).toString();
    context.fillRect(0, 0, 64, 64);
    const random = new RandomGenerator(3);
    for (let y = 4; y < 64; y += 12)
    for (let x = 6; x < 64; x += 14)
    {
        if (random.float() < .4)
            continue;
        context.fillStyle = hsl(.12, 1, random.float(.4, .7)).toString();
        context.fillRect(x, y, 8, 7);
    }
    return new TextureInfo(context.canvas);
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.62,.5,.35), hsl(.07,.6,.6), hsl(.6,.2,.1), .3);
    render3D.sunDirection = vec3(-.4,.6,.5);
    render3D.sunColor = hsl(.08,.5,.35);
    new CameraControl3D(vec3(0,2,0), 16, .4, .003);

    normalMap = normalMapFromHeight(vec2(256), brickHeight, 3);
    const stone = hsl(.05,.35,.55);
    const floor = new EngineObject3D(vec3(), buildGrid(vec2(16), 1),
        undefined, stone);
    const wall = new EngineObject3D(vec3(0,3,-4), render3D.boxMesh,
        undefined, stone);
    wall.scale3D = vec3(12,6,1);
    for (const o of bumped = [floor, wall])
    {
        o.normalMap = normalMap;
        o.specular = .3;
    }

    // polished: a sharp highlight and the sky in it, most at the edges
    shiny = new EngineObject3D(vec3(-3,1.5,0), render3D.sphereMesh,
        undefined, hsl(.6,.3,.15));
    shiny.scale3D = vec3(3);
    shiny.specular = 1;
    shiny.shininess = 100;
    shiny.reflectivity = .4;

    const tower = new EngineObject3D(vec3(3,2.5,0), render3D.boxMesh,
        undefined, hsl(.6,.1,.3));
    tower.scale3D = vec3(2,5,2);
    tower.emissiveMap = windowTexture();
    tower.emissiveMapColor = hsl(.1,1,.6);

    light = new Light3D(vec3(), 10, hsl(.55,1,.7), 2);
}

function gameUpdate()
{
    light.pos3D = vec3(cos(time)*5, 2.5, sin(time)*5 + 1);
    if (keyWasPressed('KeyN'))
        for (const o of bumped)
            o.normalMap = o.normalMap ? undefined : normalMap;
    if (keyWasPressed('KeyR'))
        shiny.reflectivity = shiny.reflectivity ? 0 : .4;
}

function gameRenderPost()
{
    const text = 'N: normal maps   R: reflection';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
Materials: a brick wall and floor bumped by a normal map made in code, a
polished ball reflecting the sky, and a tower whose windows glow from an
emissive map, under a light that circles them. N turns the normal maps
off and on, R the ball's reflection. Drag to turn the camera and roll
the wheel to zoom.

## How it works
A material here is a few fields on an `EngineObject3D`. Each one is off
until it is set, and the objects in this scene set different ones.

### The normal map
A normal map is an image that says which way the surface faces at each
pixel. The mesh stays flat, but the light falls on it as if it had
bumps and grooves.

`normalMapFromHeight(size, heightFunction, strength)` makes one with no
image file. It calls the function for every pixel, x across and y down,
takes the slope from the heights of the pixels around, and returns a
`TextureInfo` that wraps. `strength` is how steep the slopes are.

`brickHeight` is that function. Rows are 16 pixels tall, `y >> 4` is
the row number, and every other row is shifted 16 pixels. A brick is 32
pixels wide, and its first 2 pixels each way are mortar, at height 0.
Every 64 pixels there is a round dent 9 pixels in radius, taken off the
height.

The floor and the wall get the map in the loop, with `specular = .3`
so the bumps catch a highlight. The map is read at the mesh's texture
coordinates, which run once across the floor and once across each face
of the box.

### The ball
- `specular = 1` gives it the highlight of the sun and the light at
  full strength.
- `shininess` is how small and sharp that highlight is: 16 by default,
  100 for polished.
- `reflectivity = .4` shows the sky in it, from the colors `setSky` was
  given. Edges seen at a glancing angle reflect more.

### The tower
`windowTexture` paints a 64 pixel canvas black, then rows of rectangles
for the windows. `new RandomGenerator(3)` gives the same numbers every run,
so the same windows are lit: `random.float() < .4` leaves a window out,
and `random.float(.4, .7)` picks how bright one is. A canvas takes its
`fillStyle` as text, so each color is written with `toString()`.

`emissiveMap` is a texture of where an object glows. It is added on top
of the lit surface, so it shows where no light reaches, and
`emissiveMapColor` multiplies it.

### The light
`setSky`'s fourth argument, `.3`, is how much of the sky lights the
scene, and `sunColor` is dim, so the `Light3D` stands out. Its
arguments are position, radius, color and intensity. `gameUpdate`
moves it around a circle of radius 5 and reads the two keys with
`keyWasPressed`.

## Try it
- Change the map's strength, the `3` after `brickHeight`, to `10`.
- Set `shiny.shininess = 100` to `4` for a broad, dull highlight.
- Change `reflectivity = .4` to `1` for a mirror of the sky.
- Change `random.float() < .4` to `< .8` and most windows go dark.
- Set `emissiveMapColor` to `hsl(.1,1,.2)` to dim the windows.

## See also
3D Lights has more about `Light3D`, and 3D Textures puts a color
texture on shapes. 3D Water uses `reflectivity` on a moving surface,
and 3D Glow makes bright things bloom. A glTF model's normal and
emissive maps load into the same fields, see 3D Mesh.
*/
