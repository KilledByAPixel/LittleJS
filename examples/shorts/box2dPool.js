const hitSound = new Sound([,,2e3,,,.01]);
const maxHitDistance = 6;

class Ball extends Box2dObject
{
    constructor(position, number=0)
    {
        const color = hsl(number/9, 1, number? .5 : 1);
        super(position, vec2(), 0, 0, color);
        this.number = number;

        // setup pool ball physics
        const friction = 0, restitution = .95;
        this.addCircle(1, vec2(), 1, friction, restitution);
        this.setLinearDamping(.4);
        this.setBullet(true);
        this.setFixedRotation(true);
    }
    beginContact()
    {
        const volume = clamp(this.getSpeed()/20);
        hitSound.play(this.pos, clamp(this.getSpeed()/20));
    }
    canHit() { return this == cueBall && this.getSpeed() < 1; }
    getHitOffset()
    {
        // hit from cue ball to mouse position
        const deltaPos = mousePos.subtract(this.pos);
        const length = min(deltaPos.length(), maxHitDistance);
        return deltaPos.normalize(length); 
    }
    update()
    {
        if (this.canHit() && mouseWasPressed(0))
        {
            // hit the cue ball
            const accel = this.getHitOffset().scale(8);
            this.applyAcceleration(accel);
            hitSound.play(cueBall.pos);
        }
        if (this.pocketed)
            this.destroy();
    }
    render()
    {
        super.render();

        // draw white circle and ball number
        drawCircle(this.pos, .6, WHITE);
        const textPos = this.pos.add(vec2(0,-.06));
       	if (this.number)
            drawTextOverlay(this.number, textPos, .5, BLACK);
        if (this.canHit())
        {
            // draw the aim line
            const offset = this.getHitOffset();
            const endPos = this.pos.add(offset);
            const width = offset.length()/maxHitDistance;
            drawLine(this.pos, endPos, width, hsl(0,1,.5,.5), 
                vec2(), 0, false, false, overlayContext);
        }
    }
}

class Pocket extends Box2dStaticObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, BLACK);

        // create a sensor circle for pocket
        this.addCircle(size.x);
        this.setSensor(true);
    }
    render()
    {
        // add ball size to pocket size for drawing
        drawCircle(this.pos, this.size.x + 1, BLACK);
    }
    beginContact(other) { other.pocketed = 1; }
}

async function gameInit()
{
    // setup box2d
    await box2dInit();
    canvasClearColor = hsl(.4,.5,.5);

    // create table walls
    const groundObject = new Box2dStaticObject;
    groundObject.color = hsl(.1,1,.2);
    groundObject.addBox(vec2(100,3), vec2( 0, 8.5));
    groundObject.addBox(vec2(100,3), vec2( 0,-8.5));
    groundObject.addBox(vec2(3,100), vec2( 15,0));
    groundObject.addBox(vec2(3,100), vec2(-15,0));

    // create pockets
    for (let j=0; j<2; ++j)
    for (let i=0; i<3; ++i)
        new Pocket(vec2(i-1, j-.5).scale(13), vec2(.5));
   
    // create balls
    let number = 1;
    for (let i=5;   i--;)
    for (let j=i+1; j--;)
        new Ball(vec2(6+i*.9, j-i/2), number++);
    cueBall = new Ball(vec2(-6, 0));
}