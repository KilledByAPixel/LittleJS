class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2), tile(9), 0, CYAN);
        this.damping = 1; // disable damping
        this.clampSpeed = false; // disable speed clamping
    }

    update()
    {
        super.update();

        const h = getGroundHeight(this.pos.x);
        if (this.pos.y < h + this.size.y/2)
        {
            // clamp to ground and reflect velocity
            this.pos.y = h + this.size.y/2;
            const n = vec2((h-getGroundHeight(this.pos.x+.1))/.1, 1).normalize();
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
    return Math.sin(x/4)*2 + Math.sin(x/17);
}

function gameInit()
{
    gravity.y = -.01;
    new Player(vec2(0,5));
}

function gameRender()
{
    const h=100, w=20;
    for (let x=cameraPos.x-w; x<cameraPos.x+w; x+=.1)
        drawRect(vec2(x,getGroundHeight(x)-h/2), vec2(.2,h), hsl(.2+.2*wave(.2,1,x),.5,.5));
}