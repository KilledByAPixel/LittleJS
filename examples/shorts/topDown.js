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
        super(pos, vec2(2), RED);
        this.mass = 1; // make object have dynamic physics
        this.renderOrder = 1; // render player on top of other objects
    }

    update()
    {
        super.update();

        // apply movement controls
        const moveInput = keyDirection().clampLength(1).scale(.2); // clamp and scale input
        this.velocity = this.velocity.add(moveInput);

        // move camera with player
        cameraPos = this.pos;
    }
}

function gameInit()
{
    // setup level
    objectDefaultDamping = .7;
    new Player();

    // create background objects
    for (let i=300; i--;)
        new EngineObject(randInCircle(90), vec2(rand(59),rand(59)), 0, rand(), hsl(.4,.5,rand(.2)));

    // create foreground objects
    for (let i=300; i--;)
        new PhysicsObject(randInCircle(7+i,7), vec2(rand(4,9),rand(4,9)), hsl(0,0,rand(.8,1)));
}