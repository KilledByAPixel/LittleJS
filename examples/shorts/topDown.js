class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2), tile(5), 0, RED);
        this.setCollision(); // make object collide
        this.renderOrder = 1; // render player on top
    }

    update()
    {
        super.update();

        // apply movement controls
        const moveInput = keyDirection().clampLength(1).scale(.2);
        this.velocity = this.velocity.add(moveInput);

        // move camera with player
        cameraPos = this.pos;
    }
}

function gameInit()
{
    // setup level
    objectDefaultDamping = .7;
    new Player;

    // create collision objects
    for (let i=300; i--;)
    {
        const o = new EngineObject(randInCircle(15+i,7), vec2(rand(4,9),rand(4,9)), 0, 0, hsl(0,0,rand(.8,1)));
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
    }
}