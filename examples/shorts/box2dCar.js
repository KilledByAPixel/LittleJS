async function gameInit()
{
    // setup box2d and create the objects
    await box2dInit();
    gravity.y = -20;
    groundObject = new Box2dObject(vec2(-8), vec2(), 0, 0, GRAY, box2d.bodyTypeStatic);
    groundObject.addBox(vec2(100,6));
    new CarObject(vec2(0,-2));
}

class CarObject extends Box2dObject
{
    constructor(pos)
    {
        super(pos, vec2(), 0, 0, RED);

        // create car with wheels
        this.addBox(vec2(7,2));
        const frequency = 4, maxTorque = 250;
        this.wheels = [];
        for(let i=2; i--;)
        {
            const wheelPos = pos.add(vec2(i?2:-2, -1));
            const wheel = new Box2dObject(wheelPos, vec2(2), tile(7));
            const joint = new Box2dWheelJoint(this, wheel);
            joint.setSpringFrequencyHz(frequency);
            joint.setMaxMotorTorque(maxTorque);
            joint.enableMotor(!i);
            wheel.addCircle(2, vec2(), 1, 1);
            wheel.motorJoint = joint;
            this.wheels[i] = wheel;
        }
    }
    update()
    {
        super.update();
        
        // car controls - use arrow keys or A/D to drive
        const maxSpeed = 40;
        const input = keyDirection().x;
        let s = this.wheels[0].motorJoint.getMotorSpeed();
        s = input ? clamp(s - input, -maxSpeed, maxSpeed) : 0;
        this.wheels[0].motorJoint.setMotorSpeed(s);
    }
}