class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), tile(8));
        this.damping = .97;
        this.angleDamping = .95;
    }

    update()
    {
        super.update();

        // space ship controls
        const moveInput = keyDirection();
        this.applyAngularAcceleration(moveInput.x * .005);
        this.applyAcceleration(vec2().setAngle(this.angle, moveInput.y*.02));
        if (frame%9==0 && keyIsDown('Space'))
        {
            // shoot bullet
            const pos = this.pos.add(vec2(0,1).rotate(cameraAngle));
            const bullet = new EngineObject(pos, vec2(.2,.5), 0, this.angle, YELLOW);
            bullet.velocity = this.velocity.add(vec2(0,.5).rotate(this.angle));
        }

        // move camera with player
        cameraPos = this.pos;
        cameraAngle = this.angle;
    }
}

function gameInit()
{
    new Player(vec2(0,4));
}

function gameRender()
{
    // draw wrapped starfield with parallax
    const size = 32;
    for (let i=1e3; i--;)
    {
        const parallax =0; i%.13;
        let pos = vec2(i**2.1, i**3.1);
        pos = pos.add(cameraPos.scale(parallax)).subtract(cameraPos).mod(size);
        pos = cameraPos.add(pos).subtract(vec2(size/2));
        drawRect(pos, vec2(i%.07+.03), rgb(1,1,1,.1+i%.9));
    }
}