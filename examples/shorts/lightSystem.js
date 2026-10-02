let mouseLight;

function gameInit()
{
    new LightSystemPlugin;

    // draw the world at full brightness
    canvasClearColor = hsl(0,0,.9);

    // stationary Lights, each with a soft glow over it like a lamp
    new Light(vec2(-6, 0), 6, RED).glow = 3;
    new Light(vec2( 0, 4), 4, GREEN).glow = 3;
    new Light(vec2( 6, 0), 8, BLUE).glow = 3;

    // a glowing object: renderLight adds light around it to the
    // lightmap, where obj.emissive would only show its own colors
    const lava = new EngineObject(vec2(0, -5), vec2(2));
    lava.renderLight = function()
    {
        // drawn additively into the lightmap
        drawRect(this.pos, vec2(2), ORANGE);
    }

    // mouse light - scroll wheel adjusts radius
    mouseLight = new Light(vec2(), 4, WHITE);
    mouseLight.glow = 2;
}

function gameRender()
{
    // a grid of tiles so the lighting effect is visible
    for (let x = -10; x <= 10; x += 2)
    for (let y = -8;  y <= 8;  y += 2)
        drawRect(vec2(x, y), vec2(1, 1), hsl(0,0,.3));
}

function gameUpdate()
{
    mouseLight.pos = mousePos;

    // mouse wheel adjusts radius of the mouse light
    mouseLight.radius -= mouseWheel*0.5;
    mouseLight.radius = clamp(mouseLight.radius, 1, 20);
    mouseLight.fadeRange = mouseLight.radius;
}

/* info
Colored lights in the dark: a red, a green and a blue lamp over a grid
of gray squares, a square of lava that glows, and a white light that
follows the mouse. The mouse wheel changes the size of the mouse light.

## How it works
### The lightmap
`new LightSystemPlugin` turns lighting on. Each frame, after the scene
is drawn, the plugin builds a *lightmap*: a picture the size of the
canvas that starts black and has every light added into it. The scene
is then multiplied by the lightmap. Where the lightmap is black the
scene goes black, where it is white the scene shows as drawn, and where
it is red only the red of the scene is left.

So the world is drawn at full brightness and the lights do the
darkening. That is why `canvasClearColor` is a light gray here, and
`gameRender` draws its grid of squares with no thought for the lights.

Lights add up in the lightmap, so red light and blue light on the same
spot make magenta. Move the white mouse light over a lamp to see two
lights add. The plugin draws with WebGL and does nothing without it.

### Light
`new Light(pos, radius, color)` makes a light. It is an engine object
that draws nothing in the scene, only a round blob into the lightmap.
The radius is in world units. A fourth argument, `fadeRange`, is the
width of the soft edge: the light is full inside `radius - fadeRange`
and fades to nothing at `radius`. Left out, it is the radius, so the
light fades all the way from its center.

`.glow = 3` sets the light's `glow`, the size across of a soft haze
drawn over the lit scene at the light, in its color. The lightmap can
only show what is already in the scene, so a light over empty black
shows nothing. The glow is added on top, like a lamp seen at night.

### The lava
Any object can add light of its own shape by having a `renderLight`
function. The plugin calls it while the lightmap is being built, and
whatever it draws there is added as light. The lava is a plain white
object two units across whose `renderLight` draws an orange rectangle
over itself, so it always has at least orange light on it.

### The mouse light
`gameUpdate` puts `mouseLight` at `mousePos`, the mouse in world units.
`mouseWheel` is how far the wheel turned this frame, and it changes the
radius, which `clamp` keeps from 1 to 20. A light keeps the `fadeRange`
it was made with, so that is set to the new radius as well.

## Try it
- Give the dark some light: change `new LightSystemPlugin;` to
  `new LightSystemPlugin(undefined, hsl(.6,.5,.15));`. The second
  argument is the ambient color the lightmap starts from.
- Give the blue lamp a hard edge with a `fadeRange` of 1:
  `new Light(vec2( 6, 0), 8, BLUE, 1)`.
- Let the lava light the floor around it: in its `renderLight`, change
  `vec2(2)` to `vec2(6)`.
- Set the mouse light's `glow` to 8.

## See also
Light Shadows has walls that block these lights and glass that tints
them. Blending shows additive drawing on its own.
*/
