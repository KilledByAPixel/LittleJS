let mouseLight;

// walls cast shadows by default; the floor is drawn in gameRender and does not
class Wall extends EngineObject
{
    constructor(pos, size, tileInfo)
    {
        super(pos, size, tileInfo, 0, hsl(.6,.1,.7));
    }
}

// stained glass: its color passes through into the light instead of blocking it
class Glass extends Wall
{
    constructor(pos, size, color)
    {
        super(pos, size);
        this.color = color;
    }
    render()
    {
        lightSystem.setShadowTransparent(true); // only acts in the shadow pass
        drawRect(this.pos, this.size, this.color);
        lightSystem.setShadowTransparent(false);
    }
}

function gameInit()
{
    new LightSystemPlugin(undefined, hsl(0,0,.05));
    lightSystem.shadows = true;
    canvasClearColor = hsl(0,0,.9);

    // a room with pillars
    for (let i = 0; i < 6; ++i)
        new Wall(vec2(-10 + i*4, 0), vec2(1, 3));
    new Wall(vec2(0, 8), vec2(24, 1));
    new Wall(vec2(0, -8), vec2(24, 1));
    new Glass(vec2(-4, 4), vec2(3, .5), hsl(0, 1, .5));
    new Glass(vec2(4, 4), vec2(3, .5), hsl(.6, 1, .5));
    new Wall(vec2(4, -5), vec2(3), tile(3));
    const coin = new EngineObject(vec2(-4, -5), vec2(1), undefined, 0, YELLOW);
    coin.castShadow = false; // small things can stay out of the shadow map

    new Light(vec2(-8, 4), 8, hsl(.1,.8,.9));
    new Light(vec2(0, -4), 8, hsl(.55,.8,.9));
    mouseLight = new Light(vec2(), 10, WHITE);
}

function gameUpdate()
{
    mouseLight.pos = mousePos;
}

function gameRender()
{
    // the floor, drawn here so it casts no shadow
    drawRect(vec2(), vec2(100), hsl(0,0,.35));
    for (let x = -12; x <= 12; x += 2)
    for (let y = -7;  y <= 7;  y += 2)
        drawRect(vec2(x, y), vec2(1.8), hsl(0,0,.4));
}
