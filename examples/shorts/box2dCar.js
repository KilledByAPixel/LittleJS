async function gameInit()
{
    // setup box2d and create the objects
    await box2dInit();
    gravity.y = -20;

    // create edge list for ground
    const edgePoints = [];
    for (let i=0, y=0, s=0; i<1e3; ++i)
    {   
        y = clamp(y+rand(-1,1),0,5);
        edgePoints.push(vec2(i*5-15, y-8));
    }
    const ground = new Box2dStaticObject;
    ground.lineWidth = 1;
    ground.addEdgeList(edgePoints);

    // make a car
    new CarObject(vec2(0,-2));
    canvasClearColor = hsl(0,0,.9);
}

class CarObject extends Box2dObject
{
    constructor(pos)
    {
        super(pos);

        // create car with wheels
        this.color = RED;
        this.addBox(vec2(7,2));
        const frequency = 4, maxTorque = 250;
        this.wheels = [];
        for (let i=2; i--;)
        {
            const wheelPos = pos.add(vec2(i?2:-2, -1));
            const wheel = new Box2dObject(wheelPos, vec2(2), tile(7));
            const joint = new Box2dWheelJoint(this, wheel);
            joint.setSpringFrequencyHz(frequency);
            joint.setMaxMotorTorque(maxTorque);
            joint.enableMotor(!i);
            const friction = 1;
            wheel.addCircle(2, vec2(), 1, friction);
            wheel.motorJoint = joint;
            this.wheels[i] = wheel;
        }
    }
    update()
    {
        // car controls - use mouse, arrow keys, or A/D to drive
        const maxSpeed = 40;
        const input = mouseIsDown(0) ? 1 : 
            mouseIsDown(2) ? -1 : keyDirection().x ;
        let s = this.wheels[0].motorJoint.getMotorSpeed();
        s = input ? clamp(s - input, -maxSpeed, maxSpeed) : 0;
        this.wheels[0].motorJoint.setMotorSpeed(s);
        cameraPos.x = this.pos.x;
    }
}