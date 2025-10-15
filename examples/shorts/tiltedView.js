class GameObject extends EngineObject
{
    update()
    {
        this.renderOrder = -this.pos.y; // sort by y position
        super.update();
    }

    render()
    {
        // adjust draw postion to be at the bottom of the object
        const drawSize = this.drawSize || this.size;
        const offset = this.getUp(drawSize.y/2);
        const pos = this.pos.add(offset);
        drawTile(pos, drawSize, this.tileInfo, this.color, this.angle);
    }
}

class Player extends GameObject
{
    update()
    {
        super.update();

        // apply movement controls
        const moveInput = keyDirection().clampLength(1).scale(.2);
        this.velocity = this.velocity.add(moveInput);
        this.setCollision(); // make object collide

        // move camera with player
        cameraPos = this.pos.add(vec2(0,2));
    }
}

function gameInit()
{
    // setup level
    objectDefaultDamping = .7;
    const player = new Player(vec2(), vec2(3,1), tile(5), 0, RED);
    player.drawSize = vec2(3);

    // create background objects
    for (let i=1; i<300; ++i)
    {
        const pos = randInCircle(90);
        const size = vec2(rand(59), rand(59));
        const color = hsl(.4,.2,rand(.4,.5),.8);
        new EngineObject(pos, size, 0, 0, color, -1e5);
    }

    // create world objects
    for (let i=1; i<1e3; ++i)
    {
        const pos = randInCircle(7+i,7);
        const isRock = randBool();
        const size = vec2(isRock ? rand(2,4) : rand(1,2));
        const color = hsl(.1,isRock ? 0 : .5,rand(.2,.3));
        const o = new GameObject(pos, size, 0, 0, color);
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
        o.angle = rand(-.1,.1); // random tilt
        o.drawSize = vec2(size.x, isRock ? rand(2,4) : rand(5,10));
    }
}