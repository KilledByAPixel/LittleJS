class PhysicsObject extends EngineObject
{
    constructor(pos, size, color)
    {
        super(pos, size, 0, 0, color);
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }
}

class Player extends PhysicsObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), RED);
        this.mass = 1; // make object have dynamic physics
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
        new PhysicsObject(vec2(i*2-20, y-54), vec2(2, 99), hsl(0,0,.3+i%.19));
    }
}