// burn away by a noise threshold that rises and falls, with a glowing edge
const dissolveShader = new Shader(`
float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2)))*4e4); }
void mainImage(out vec4 c, vec2 uv)
{
    c = texture(iChannel0, uv);
    float edge = sin(iTime*1.5)*.6 + .5;
    float n = noise(floor(localUV*24.)/24.);
    if (n < edge) c = vec4(0);
    else if (n < edge + .1) c.rgb = vec3(1, .6, .1);
}`);

// cycle the hue down the sprite, recolored without a second image
const hueShader = new Shader(`
void mainImage(out vec4 c, vec2 uv)
{
    c = texture(iChannel0, uv);
    float a = iTime*2. + localUV.y*4.;
    c.rgb *= cos(vec3(a, a + 2.1, a + 4.2))*.5 + .5;
}`);

// scanlines that roll upward, darkening every other band
const scanShader = new Shader(`
void mainImage(out vec4 c, vec2 uv)
{
    c = texture(iChannel0, uv);
    c.rgb *= .6 + .4*step(.5, fract(localUV.y*20. - iTime*3.));
}`);

class ShadedSprite extends EngineObject
{
    constructor(pos, shader, color)
    {
        super(pos, vec2(7), tile(3,128), 0, color);
        this.shader = shader;
    }
}

function gameInit()
{
    // each tile in tiles.png has a 1 pixel border, which stops bleeding
    setTileDefaultPadding(1);

    new ShadedSprite(vec2(-9, 2), dissolveShader, hsl(0,0,1));
    new ShadedSprite(vec2(0, 2), hueShader, hsl(0,0,1));
    new ShadedSprite(vec2(9, 2), scanShader, hsl(.1,1,.7)); // tinted too
}

function gameRender()
{
    // draws that are not objects use setShader, and setShader() ends it
    setShader(hueShader);
    for (let i = 5; i--;)
    {
        const pos = vec2(i*4.5 - 9, -5);
        drawTile(pos, vec2(3), tile(3,128), hsl(0,0,1), time + i);
    }
    setShader();
}

/* info
Shaders on single sprites, not the whole screen: three big logos, one
burning away and coming back, one cycling through colors and one with
rolling scan lines, and a row of small spinning logos that share the
color shader. Each `Shader` is a `mainImage` snippet. The engine wraps
it and then applies the object's color like any other sprite. There is
nothing to press.

## How it works
### A Shader
`new Shader(code)` takes a piece of GLSL that defines
`mainImage(out vec4 c, vec2 uv)`. The engine calls it for each pixel of
a sprite drawn with that shader, and the color left in `c` is the
sprite's color there. Inside it:

- `iChannel0` is the texture being drawn, and `uv` is this pixel's place
  in it, so `texture(iChannel0, uv)` is the color the sprite would have
  had. All three snippets start with it and then change it.
- `localUV` goes from 0 to 1 across the sprite itself. `uv` does not,
  because the sprite is one tile of a bigger sheet.
- `iTime` is the engine's `time`, in seconds.

The shaders are made once, at the top of the file, and shared. Sprites
that use the same `Shader` are drawn together in one batch.

### The three snippets
`dissolveShader` gives each small square of the sprite a random number
and removes the squares whose number is under a moving threshold.
`floor(localUV*24.)/24.` rounds the position to a 24 by 24 grid, so
every pixel in a square gets the same `noise` value, from 0 to 1. `edge`
swings from `-.1` to `1.1` with a sine of the time. A square under
`edge` gets `vec4(0)`, see through, and one less than `.1` above it is
colored orange, the burning rim. Because `edge` goes past both ends, the
sprite is whole at one end of the swing and gone at the other.

`hueShader` multiplies the color by three cosines a third of a turn
apart, one each for red, green and blue. Their angle grows with time and
with `localUV.y`, so the colors change along the sprite and keep moving.

`scanShader` cuts the sprite into 20 bands with `fract(localUV.y*20.)`
and uses `step(.5, ...)` to pick half of each band. The picked half
keeps its brightness and the other half is multiplied by `.6`.
Subtracting `iTime*3.` makes the bands roll.

### Objects and draws
`ShadedSprite` is an `EngineObject` seven units across showing the logo
tile, with `this.shader` set. The engine uses an object's `shader` when
it draws the object. The last argument of `super` is the object's color:
two sprites are white, which changes nothing, and the third is tinted
orange. The tint is applied after the snippet, to its result. Each tile
of the sheet has a 1 pixel border, and `setTileDefaultPadding(1)`, first
in `gameInit`, makes `tile` count it.

Draws that are not objects have no `shader` property. In `gameRender`
`setShader(hueShader)` sets the shader for the `drawTile` calls that
follow, and `setShader()` with nothing goes back to normal drawing. The
last argument of that `drawTile` is the angle, `time + i`, which spins
each small logo.

A `Shader` works on textured draws with WebGL. A plain `drawRect` has no
texture and is drawn as it is.

## Try it
- Bigger blocks in the dissolve: `localUV*24.)/24.` to
  `localUV*8.)/8.`.
- A blue rim in place of the orange: `vec3(1, .6, .1)` to
  `vec3(.2, .6, 1)`.
- Wider scan lines: `localUV.y*20.` to `localUV.y*6.`.
- Dissolve the small logos: `setShader(hueShader)` to
  `setShader(dissolveShader)`.

## See also
Post Processing and Post Effects shade the whole screen with snippets
of the same kind. 3D Shaders uses the `Shader` class on 3D objects.
*/
