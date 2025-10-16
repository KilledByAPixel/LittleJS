class BounceObject extends EngineObject
{
    constructor(pos, size, tile)
    {
        super(pos, size, tile);
        this.velocity = vec2(.1);
    }

    update()
    {
        super.update();

        // show debug info
        debugText('Debug Text', this.pos.add(vec2(0,3)), 1, WHITE);
        debugRect(this.pos, this.size, RED);
        const trianglePoints = [vec2(-2,-1), vec2(0,2), vec2(2,-1)];
        debugPoly(mousePos, trianglePoints, YELLOW);
        debugLine(this.pos, mousePos, BLUE);

        // bounce off screen edges
        const cameraSize = getCameraSize();
        if (abs(this.pos.x) > cameraSize.x/2)
        {
            debugCircle(this.pos, 3, GREEN, 1);
            this.velocity.x = -this.velocity.x;
        }
        if (abs(this.pos.y) > cameraSize.y/2)
        {
            debugCircle(this.pos, 3, GREEN, 1);
            this.velocity.y = -this.velocity.y;
        }
    }
}

function gameInit()
{
    canvasClearColor = GRAY;
    new BounceObject(vec2(), vec2(5), tile(3,128));
}