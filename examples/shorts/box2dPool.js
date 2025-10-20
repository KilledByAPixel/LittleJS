let hitSound = new Sound([,,2e3,,,.01]);
let cueBall;
const maxHitDistance = 6;

class Ball extends Box2dObject
{
    constructor(position, number=0)
    {
        const color = hsl(number/9, 1, number? .5 : 1);
        super(position, vec2(), 0, 0, color);

        // setup pool ball physics
        const friction = .2, restitution = .95;
        this.addCircle(1, vec2(), 1, friction, restitution);
        this.setLinearDamping(.4);
        this.setBullet(true);
        this.setFixedRotation(true);
        this.number = number;
    }
    beginContact()
    {
        const volume = clamp(this.getSpeed()/20);
        hitSound.play(this.pos, volume);
    }
    update()
    {
        if (this.pocketed)
        {
            // handle pocketed balls
            if (this.number)
	            this.destroy();
           	else
            {
                // reset cue ball
                this.setPosition(vec2(-7,0));
                this.setLinearVelocity(vec2());
                this.pocketed = 0;
            }
        }
    }
    render()
    {
        super.render();

        // draw ball number
        drawCircle(this.pos, .6, WHITE);
        const textPos = this.pos.add(vec2(0,-.06));
       	if (this.number)
            drawTextOverlay(this.number, textPos, .5, BLACK);
    }
}

class Pocket extends Box2dObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, BLACK, box2d.bodyTypeStatic);

        // create a sensor circle for pocket
        this.addCircle(size.x);
        this.setSensor(true);
    }
    render()
    {
        // add ball size to pocket size for drawing
        drawCircle(this.pos, this.size.x+1, BLACK);
    }
    beginContact(other) { other.pocketed = 1; }
}

async function gameInit()
{
    // setup box2d
    await box2dInit();
    canvasClearColor = hsl(.4,.5,.5);

    // create table walls
    const groundObject = new Box2dObject(vec2(), vec2(), 0, 0,
        hsl(.1,1,.2), box2d.bodyTypeStatic);
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
        new Ball(vec2(i*.9, j-i/2), number++);
    cueBall = new Ball(vec2(-7, 0));
}

const canHit = ()=> cueBall.getSpeed() < 1;

function getHitOffset()
{
    // hit from cue ball to mouse position
    const deltaPos = mousePos.subtract(cueBall.pos);
    const length = min(deltaPos.length(), maxHitDistance);
    return deltaPos.normalize(length); 
}

function gameUpdate()
{
    if (mouseWasPressed(0) && canHit())
    {
        // hit the cue ball
        const accel = getHitOffset().scale(8);
        cueBall.applyAcceleration(accel);
        hitSound.play(cueBall.pos, length/maxHitDistance);
    }
}

function gameRenderPost()
{
    if (canHit())
    {
        // draw the aim line
        const endPos = cueBall.pos.add(getHitOffset());
        const width = getHitOffset().length()/maxHitDistance;
        drawLine(cueBall.pos, endPos, width, hsl(0,1,.5,.5));
    }
}