class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), tile(8), 0, RED);
        this.setCollision(); // make object collide
        this.angleDamping = .95;
    }

    update()
    {
        // space ship controls
        const moveInput = keyDirection();
        this.applyAngularAcceleration(moveInput.x * .002);
        const accel = this.getUp(moveInput.y*.002);
        this.applyAcceleration(accel);
    }

    // explode when it collides
    collideWithObject()
    {
        // don't explode if player is almost still and not tilted
        if (abs(this.angle) < .2)
        if (this.velocity.length() < .05)
            return true;

        // explode!
        this.destroy();
        new ParticleEmitter(
            this.pos, 0,         // pos, angle
            1, .1, 300, 3.14, 0, // emitSize, emitTime, rate, cone, tile
            rgb(1,.5,.1), rgb(1,.1,.1),     // colorStartA, colorStartB
            rgb(1,.5,.1,0), rgb(1,.1,.1,0), // colorEndA, colorEndB
            .7, .8, .2, .2, .05,   // time, start, end, speed, angleSpeed
            .9, 1, -.2, 3.14, .05, // damp, angleDamp, gravity, cone, fade
            1, 0, 1                // randomness, collide, additive
        );
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.001;
    new Player(vec2(0,4));

    // create ground
    for (let i=0, y=0; i<20; ++i)
    {
        y = (y + rand(1,-1)*4) * .5;
        const pos = vec2(i*2-20, y-54);
        const color = hsl(0, 0, .5+i%.29);
        const o = new EngineObject(pos, vec2(2, 99), 0, 0, color);
        o.setCollision(); // make object collide
        o.mass = 0; // make object have static physics
    }
}