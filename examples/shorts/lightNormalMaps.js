let mouseLight, sun, spinners = [], cover;

// a white image and its normal map, both size pixels across, drawn
// from a shape that gives the normal at each point from -1 to 1
// across, y up, or nothing where the image is clear
function makeTextures(size, shape)
{
    const images = [0, 1].map(()=> new ImageData(size, size));
    for (let y = 0; y < size; ++y)
    for (let x = 0; x < size; ++x)
    {
        const n = shape((x + .5)/size*2 - 1, 1 - (y + .5)/size*2);
        if (!n) continue;
        const i = (x + y*size)*4;
        images[0].data.set([255, 255, 255, 255], i);
        images[1].data.set(n.map((v)=> (v*.5 + .5)*255).concat(255), i);
    }
    return images.map((image)=>
    {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').putImageData(image, 0, 0);
        return new TextureInfo(canvas, true, false, false);
    });
}

// a ball: its normal points out from its middle
function sphere(x, y)
{
    const z = 1 - x*x - y*y;
    return z > 0 && [x, y, z**.5];
}

// a tile with bevelled edges, flat in the middle, leaning out at
// its sides
function bevel(x, y)
{
    const lean = (v)=> sign(v) * max(abs(v) - .6, 0) / .4;
    const nx = lean(x), ny = lean(y), length = hypot(nx, ny, 1);
    return [nx/length, ny/length, 1/length];
}

function gameInit()
{
    new LightSystemPlugin(undefined, hsl(.6, .3, .1));
    lightSystem.normalMaps = true;
    canvasClearColor = hsl(0, 0, .5);

    // balls in a row, each tinted, the tint does not change its shape
    const [ballColor, ballNormal] = makeTextures(64, sphere);
    for (let i = 0; i < 5; ++i)
    {
        const tileInfo = new TileInfo(vec2(), vec2(64), ballColor);
        const pos = vec2(i*4 - 8, 3);
        const ball = new EngineObject(pos, vec2(3), tileInfo);
        ball.color = hsl(i/5, .6, .7);
        ball.normalMap = ballNormal;
    }

    // bevelled tiles that turn, one mirrored, the shading turns too
    const [tileColor, tileNormal] = makeTextures(64, bevel);
    for (let i = 0; i < 4; ++i)
    {
        const tileInfo = new TileInfo(vec2(), vec2(64), tileColor);
        const pos = vec2(i*4 - 6, -3);
        const spinner = new EngineObject(pos, vec2(3), tileInfo);
        spinner.normalMap = tileNormal;
        spinner.mirror = i == 3;
        spinners.push(spinner);
    }

    // a plain square that passes in front, hiding the normals there
    cover = new EngineObject(vec2(), vec2(2), undefined, 0, hsl(0,0,.8));

    // the mouse light, the wheel raises and lowers it
    mouseLight = new Light(vec2(), 12, hsl(.1, .3, 1));
}

function gameUpdate()
{
    mouseLight.pos = mousePos;
    mouseLight.height = clamp(mouseLight.height - mouseWheel*.5, 0, 10);
    spinners.forEach((spinner, i)=> spinner.angle = time * (i+1) * .3);
    cover.pos = vec2(sin(time*.5)*10, 0);

    // Space turns the sun on and off, toward the top right
    if (keyWasPressed('Space'))
    {
        if (sun)
            sun = sun.destroy();
        else
        {
            sun = new DirectionalLight(vec2(1, 1), hsl(.6, .3, .6));
            sun.castShadow = false; // its long shadows would cover them
        }
    }
}

function gameRenderPost()
{
    const text = 'Light height ' + mouseLight.height.toFixed(1) +
        '   Wheel: height   Space: sun ' + (sun ? 'on' : 'off');
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
Balls and bevelled tiles that catch the light as if they had depth:
a light follows the mouse, and each one is bright on the side facing
it and dark on the side away. The mouse wheel raises and lowers the
light, Space turns on a sun, and a plain square passes in front.

## How it works
### Normal maps
A *normal map* is a second image laid out like a sprite's own, where
each pixel's color says which way the surface faces there: red for
right, green for up and blue for out of the screen, each from -1 at 0
to 1 at 255. A flat pixel, facing straight out, is a light blue.

`makeTextures` draws two images in code, a white one for the color and
its normal map, from a shape function. `sphere` points every normal out
from the middle of a ball, and `bevel` is flat in the middle and leans
out at the edges. Any image a paint program or a normal map tool makes
works the same way, laid out like the sprite's sheet.

### Turning them on
`lightSystem.normalMaps = true` turns normal maps on, and an object's
`normalMap` is its normal map image, a `TextureInfo`. Each frame every
object draws into a normal buffer: one with a normal map draws its
normals, turned and mirrored with it, and everything else draws flat.
So the square passing in front hides the normals behind it, and the
floor is shaded as a flat surface.

The normals are read where the object's tile is, so an animated sprite
keeps its normals frame by frame. The color tints only the color: the
balls are tinted five ways and all shade the same.

### Height
A light's `height` is how far above the scene it is, in world units.
The lower it is, the more the surfaces it reaches at an angle darken.
The sun's `height` is how far it rises for each unit across, 1 being
45 degrees.

Normal maps cost a second draw of the scene each frame, which is why
they are off until turned on. With them on every surface is shaded,
so lights fall off faster than without.

## Try it
- Raise the light: in `gameInit` add `mouseLight.height = 5;`.
- Flatten the bevel: change `/ .4` to `/ 2`.
- Turn normal maps off to compare: change `normalMaps = true` to
  `normalMaps = false`.
- Lower the sun: add `sun.height = .3;` after its `castShadow`.
- Let the sun throw long shadows: remove its `castShadow` line.

## See also
Light System has colored lights and a searchlight, and Light Shadows
has walls that block them.
*/
