// A regular EngineObject that contributes additively to the lightmap by
// overriding renderLight(). It's visible in the normal pass via render(),
// and during the lightmap pass it adds a sharp orange glow at its position.
class LavaTile extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1), undefined, 0, rgb(0.9, 0.3, 0));
    }

    renderLight()
    {
        // additive emissive contribution into the lightmap
        // (drawRect honors the additive blend the plugin set up)
        drawRect(this.pos, vec2(3), rgb(1, 0.4, 0));
    }
}

let mouseLight;

function gameInit()
{
    new LightSystemPlugin();

    // draw the world at full brightness — the lightmap multiplies it down
    canvasClearColor = rgb(0.6, 0.6, 0.7);

    // stationary Lights: each draws a soft falloff blob into the lightmap.
    // The lightmap accumulates ADDITIVELY, so overlapping colored lights mix
    // (red + blue = magenta, all three = near-white). The final composite then
    // MULTIPLIES the lightmap with the scene, so unlit areas go black.
    new Light(vec2(-6, 0), 6, rgb(1, 0, 0));
    new Light(vec2( 6, 0), 6, rgb(0, 0, 1));
    new Light(vec2( 0, 4), 6, rgb(0, 1, 0));

    // emissive non-Light objects — use the EngineObject.renderLight() hook
    new LavaTile(vec2(-8, -5));
    new LavaTile(vec2( 8, -5));

    // mouse-follow light — scroll wheel adjusts radius
    mouseLight = new Light(vec2(), 4, rgb(1, 1, 1));
}

function gameRender()
{
    // a grid of bright tiles so the lighting effect is visible
    for (let x = -10; x <= 10; x += 2)
    for (let y = -8;  y <= 8;  y += 2)
        drawRect(vec2(x, y), vec2(1, 1), rgb(0.9, 0.9, 1));
}

function gameUpdate()
{
    mouseLight.pos = mousePos;

    // mouse wheel adjusts the radius of the mouse light
    if (mouseWheel)
    {
        mouseLight.radius = clamp(mouseLight.radius - mouseWheel*0.5, 0.5, 20);
        mouseLight.fadeRange = mouseLight.radius; // keep it fully soft
    }
}
