let mouseLight;

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
}

function gameUpdate()
{
    mouseLight.pos = mousePos;
}

function gameRender()
{
    // the floor with no shadow
    drawRect(vec2(), vec2(100), hsl(0,0,.3));
    for (let x = -12; x <= 12; x += 2)
    for (let y = -7;  y <= 7;  y += 2)
        drawRect(vec2(x, y), vec2(1.8), hsl(0,0,.4));
}
