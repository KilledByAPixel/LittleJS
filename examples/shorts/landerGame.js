class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), tile(8), 0, RED);
        this.setCollision(); // make object collide
    }

    update()
    {
        super.update();

        // apply movement controls
        this.applyAcceleration(keyDirection().scale(.002));
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.001;
    new Player(vec2(0,4));

    // create ground
    for (let i=0, y=0; i<20; ++i)
    {
        y = (y + rand(1,-1)*4) * .5;
        const o = new EngineObject(vec2(i*2-20, y-54), vec2(2, 99), 0, 0, hsl(0,0,.5+i%.29));
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
    }
}