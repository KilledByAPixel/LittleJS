class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), tile(8), 0, CYAN);
        this.damping = .97;
        this.angleDamping = .95;
        this.shootTimer = new Timer;
    }

    update()
    {
        // space ship controls
        const moveInput = keyDirection();
        this.applyAngularAcceleration(moveInput.x * .005);
        const accel = vec2().setAngle(this.angle, moveInput.y*.02);
        this.applyAcceleration(accel);
        if (!this.shootTimer.active())
        if (keyIsDown('Space') || mouseIsDown(0))
        {
            // shoot bullet
            const pos = this.pos.add(vec2(0,1).rotate(cameraAngle));
            const bullet = new EngineObject(pos, vec2(.2,.5), 0, this.angle);
            bullet.velocity = this.getUp(.5);
            bullet.velocity = bullet.velocity.add(this.velocity);
            this.shootTimer.set(.1);
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
    const range = 32, halfRange = range/2;

    // precreate variables to avoid overhead
    const pos = vec2(), size = vec2(), color = rgb();
    const x = cameraPos.x, y = cameraPos.y;
    for (let i=1e3; i--;)
    {
        // use math to generate random star positions
        const parallax = i%.13-1;
        pos.x = mod(i**2.1 + x*parallax, range) + x - halfRange;
        pos.y = mod(i**3.1 + y*parallax, range) + y - halfRange;
        size.x = size.y = i%.07 + .03;
        color.a = .1+i%.9;
        drawRect(pos, size, color);
    }
}