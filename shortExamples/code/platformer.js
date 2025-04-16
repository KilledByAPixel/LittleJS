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
        super(pos, vec2(2,4), RED);
        this.mass = 1; // make object have dynamic physics
    }

    update()
    {
        // apply movement controls
        const moveInput = keyIsDown('ArrowRight') - keyIsDown('ArrowLeft');
        this.velocity.x += moveInput * (this.groundObject ? .1: .01);
        if (this.groundObject && keyIsDown('ArrowUp'))
            this.velocity.y = .9; // jump

        super.update(); // call parent update function
        cameraPos = vec2(this.pos.x, 9); // move camera with player
    }
}

function gameInit()
{
    // setup level
    gravity = -.05;
    new Player(vec2(0,4));

    // create random objects
    new PhysicsObject(vec2(), vec2(1e3,4), GRAY); // ground
    for (let i = 1; i < 500; ++i)
        new PhysicsObject(vec2(i*10+randInt(4), 0), vec2(2+randInt(20),4+randInt(8)), GREEN);
}