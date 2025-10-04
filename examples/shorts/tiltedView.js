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
        const pos = this.pos.add(vec2(0,this.size.y/2).rotate(this.angle));
        drawTile(pos, this.size, this.tileInfo, this.color, this.angle);
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

        // move camera with player
        cameraPos = this.pos.add(vec2(0,2));
    }
}

function gameInit()
{
    // setup level
    objectDefaultDamping = .7;
    new Player(vec2(), vec2(3), tile(5), 0, RED);

    // create background objects
    for (let i=1; i<300; ++i)
        new EngineObject(randInCircle(90), vec2(rand(59),rand(59)), 0, 0, hsl(.4,.2,rand(.4,.5),.8), -1e5);

    // create world objects
    for (let i=1; i<1e3; ++i)
        new GameObject(randInCircle(7+i,7), vec2(rand(1,2),rand(4,9)), 0, 0, hsl(.1,.5,rand(.2,.3)));
}