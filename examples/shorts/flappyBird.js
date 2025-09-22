class Wall extends EngineObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, GRAY);
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }
    update()
    {
        this.pos.x -= .1; // move walls to the left
    }
}

class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1), 0, 0, YELLOW);
        this.setCollision(); // make object collide
    }

    update()
    {
        super.update();
        
        // flappy movement controls
        if (mouseWasPressed(0) || keyWasPressed('Space'))
            this.applyAcceleration(vec2(0,.2));
    }

    collideWithObject(object)
    {
        this.destroy(); // die if wall is hit
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.005;
    new Player(vec2(-7,6));
    for (let i=100; i--;)
    {
        const h=50, y=-h/2-6+rand(9), spacing=15, gap=5;
        new Wall(vec2(9 + i*spacing,y+h + gap), vec2(3,h));
        new Wall(vec2(9 + i*spacing,y), vec2(3,h));
    }
}