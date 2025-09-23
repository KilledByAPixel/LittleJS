class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2,4), 0, 0, RED);
        this.setCollision(); // make object collide
    }

    update()
    {
        super.update();

        // apply movement controls
        const moveInput = keyDirection();
        this.velocity.x += moveInput.x * (this.groundObject ? .1: .01);
        if (this.groundObject && moveInput.y > 0)
            this.velocity.y = .9; // jump

        // move camera with player
        cameraPos = vec2(this.pos.x, 9); 
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.05;
    new Player(vec2(0,4));

    // create random objects
    for (let i=500; i--;)
    {
        const pos = i ? vec2(i*10+randInt(4), 0) : vec2();
        const size = i ? vec2(2+randInt(20),4+randInt(8)) : vec2(1e3,4);
        const color = i ? GREEN : GRAY;
        const o = new EngineObject(pos, size, 0, 0, color);
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
    }
}