let mouseLight;

function gameInit()
{
    new LightSystemPlugin;

    // draw the world at full brightness
    canvasClearColor = hsl(0,0,.9);

    // stationary Lights
    new Light(vec2(-6, 0), 6, RED);
    new Light(vec2( 0, 4), 4, GREEN);
    new Light(vec2( 6, 0), 8, BLUE);

    // emissive object
    const lava = new EngineObject(vec2(0, -5), vec2(2));
    lava.renderLight = function()
    {
        // additive emissive into the lightmap
        drawRect(this.pos, vec2(2), ORANGE);
    }

    // mouse light - scroll wheel adjusts radius
    mouseLight = new Light(vec2(), 4, WHITE);
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
    mouseLight.fadeRange = mouseLight.radius; // keep it soft
}