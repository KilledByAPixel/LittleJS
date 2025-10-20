class Wall extends EngineObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, hsl(.3,.5,.3));
        this.setCollision(); // make object collide
        this.mass = 0;
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
        super(pos, vec2(1), tile(9), 0, YELLOW);
        this.drawSize = vec2(2);
        this.setCollision(); // make object collide
    }

    update()
    {
        super.update();

        // flappy movement controls
        if (mouseWasPressed(0) || keyWasPressed('Space'))
            this.velocity = vec2(0,.2);
        this.angle = -this.velocity.y*2;
        this.pos.y = max(-50, this.pos.y);
    }

    collideWithObject(object)
    {
        // reset game
        engineObjectsDestroy();
        gameInit();
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.01;
    for (let i=100; i--;)
    {
        const h=100, y=-h/2-6+rand(9), spacing=15, gap=5;
        new Wall(vec2(14 + i*spacing,y+h + gap), vec2(3,h));
        new Wall(vec2(14 + i*spacing,y), vec2(3,h));
    }
    new Player(vec2(-7,6));
    canvasClearColor = hsl(.55,1,.8);
}