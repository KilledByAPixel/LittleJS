class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2), tile(9), 0, RED);
        this.damping = 1; // disable damping
        this.clampSpeed = false; // disable speed clamping
    }

    update()
    {
        // check ground height
        const h = getGroundHeight(this.pos.x);
        if (this.pos.y < h + this.size.y/2)
        {
            // clamp to ground and reflect velocity
            this.pos.y = h + this.size.y/2;
            const h2 = getGroundHeight(this.pos.x+.1);
            const n = vec2((h-h2)/.1, 1).normalize();
            this.velocity = this.velocity.reflect(n,0);
        }

        // apply movement controls
        if (mouseIsDown(0) || keyIsDown('Space'))
            this.applyAcceleration(vec2(0,-.05));
        this.velocity.x = max(this.velocity.x,.4);
        this.angle = this.velocity.angle() - PI/2;

        // move camera with player
        cameraPos = vec2(this.pos.x+9,5);
    }
}

function getGroundHeight(x)
{
    return sin(x/4)*2 + sin(x/17);
}

function gameInit()
{
    gravity.y = -.01;
    new Player(vec2(0,5));
    canvasClearColor = hsl(.6,1,.8);
}

function gameRender()
{
    // draw ground as a series of thin rectangles
    const h = 100, w = 20;
    const pos = vec2();
    const sizeTop = vec2(.4);
    const size = vec2(.2,h);
    const color = rgb();
    for (let x=cameraPos.x-w; x<cameraPos.x+w; x+=.1)
    {
        pos.x = x;
        pos.y = getGroundHeight(x);
        drawRect(pos, sizeTop, BLACK);
        pos.y -= h/2;
        color.setHSLA(.2+.2*wave(.2,1,x), .7, .5);
        drawRect(pos, size, color);
    }
}