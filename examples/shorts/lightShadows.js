let mouseLight, sun;

// walls cast shadows by default
class Wall extends EngineObject
{
    constructor(pos, size, tileInfo, color = hsl(0,0,.9))
    {
        super(pos, size, tileInfo, 0, color);
    }
}

// tinted glass has its color pass through 
class Glass extends Wall
{
    constructor(pos, size, color)
    {
        super(pos, size, undefined, color);
    }
    render()
    {
        // set this object transparent for the shadow pass
        lightSystem.setShadowTransparent(true); 
        drawRect(this.pos, this.size, this.color);
        lightSystem.setShadowTransparent(false);
    }
}

function gameInit()
{
    new LightSystemPlugin();
    lightSystem.shadows = true;

    // a room with shadow casting pillars
    for (let i=6; i--;)
        new Wall(vec2(-10 + i*4, 0), vec2(1, 3));
    new Wall(vec2(0, 8), vec2(24, 1));
    new Wall(vec2(0, -8), vec2(24, 1));
    new Glass(vec2(-2, 4), vec2(.5, 3), hsl(0, 1, .5));
    new Glass(vec2(4, 4), vec2(.5, 3), hsl(.6, 1, .5));
    new Wall(vec2(-5, -5), vec2(2), tile(3), GREEN);

    // make a coin that does not cast a shadow
    const coin = new EngineObject(vec2(5, -5), vec2(1), tile(0), 0, YELLOW);
    coin.castShadow = false;

    // make an emissive lava brick
    const lava = new EngineObject(vec2(0, -5), vec2(1), tile(1), 0, RED);
    lava.emissive = 1;

    // make some shadow casting lights
    new Light(vec2(-7, 4), 8, hsl(.1,.8,.9));
    new Light(vec2(0, -4), 8, hsl(.55,.8,.9));
    mouseLight = new Light(vec2(), 10, WHITE);

    // a low sun from the upper left, and a background wall it lights from
    // its edges; S turns the sun
    sun = new DirectionalLight(vec2(-1, .6), hsl(.12, .5, .6));
    sun.shadowLength = 8;
    const back = new EngineObject(vec2(-8, -5), vec2(6, 3), undefined, 0,
        hsl(0, 0, .5));
    back.castShadow = false;
    back.castBackgroundShadow = true;
}

function gameUpdate()
{
    mouseLight.pos = mousePos;
    if (keyWasPressed('KeyS'))
        sun.sunDirection = sun.sunDirection.rotate(PI / 8);
}

function gameRender()
{
    // the floor with no shadow
    drawRect(vec2(), vec2(100), hsl(0,0,.3));
    for (let x = -12; x <= 12; x += 2)
    for (let y = -7;  y <= 7;  y += 2)
        drawRect(vec2(x, y), vec2(1.8), hsl(0,0,.4));
}

/* info
Lights that cast shadows: a room with a row of pillars, two panes of
colored glass, a sprite, a coin and a lava brick, lit by two lamps and
by a white light that follows the mouse.

## How it works
`new LightSystemPlugin()` makes the lights work, as in Light System: the
scene is drawn at full brightness and multiplied by a lightmap the
lights are added into. `lightSystem` is the plugin, and
`lightSystem.shadows = true` turns shadows on. They are off by default.

### What casts a shadow
With shadows on, every engine object is drawn once more each frame, in
black, into a *shadow map*, and each light's rays stop where they meet
something drawn there. An object casts the shape it draws, so nothing
has to be set up:

- `Wall` is an `EngineObject` with a size and a color, and it blocks
  light. The pillars and the top and bottom walls are made from it.
- The green `Wall` has a tile. A draw blocks light by its alpha, so a
  sprite casts the shape of its picture and not of its square.
- The coin sets `castShadow = false`, which keeps an object out of the
  shadow map. Use it for pickups, floors and backgrounds.
- The floor is drawn in `gameRender` with `drawRect`. Those draws belong
  to no object, so they are never in the shadow map.

### Glass
`Glass` has its own `render`, which draws its rectangle between two
calls to `lightSystem.setShadowTransparent`. While the shadow map is
being drawn, that call lets the draws after it keep their color where
they would be black, so light that passes through is tinted and not
stopped. Outside the shadow pass the call does nothing, which is why
`render` can call it every time. It has to be set back to `false`
afterwards.

### Emissive
`lava.emissive = 1` shows the lava brick at full brightness in its own
colors, lit or not. At 0, the default, an object is lit only by the
lights, and a number between is part way.

### The lights
`new Light(pos, radius, color)` is the same as without shadows. A light
has `castShadow` too, where it means the light's rays stop at casters.
A light inside a caster is blocked completely, which is what happens
to the mouse light when the mouse is inside a pillar.

### The sun
`new DirectionalLight(sunDirection, color)` is a sun: it lights the
whole scene from one side. `sunDirection` points toward the sun, here
up and to the left, so it shines down and to the right; S turns it.
Objects that cast shadows throw long ones across the floor, fading
out by the light's `shadowLength`, 8 here. The gray block at the left sets
`castShadow = false` and `castBackgroundShadow = true`, which makes it
a background: the sun lights it only at the edges that face the
light, fading in by `backgroundDepth`.

## Try it
- Set `coin.castShadow` to `true` and the coin casts a shadow.
- Set `lava.emissive` to `0`: the brick is dark until a light reaches
  it.
- Make the red glass green: its `hsl(0, 1, .5)` to `hsl(.3, 1, .5)`.
- Set `sun.shadowLength = 20;`, the default: longer shadows.
- Add `lightSystem.shadowSoftness = 0;` after the `shadows` line. It is
  how much light bleeds into the side of a caster that faces the light,
  `.5` by default.

## See also
Light System covers the lightmap, `glow` and `renderLight`. The plugin
has more settings on `lightSystem`, like `shadowMapSize` and
`ambientColor`.
*/
