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
            const friction = 20;
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
        s = input ? clamp(s + input, -maxSpeed, maxSpeed) : 0;
        this.wheels[0].motorJoint.setMotorSpeed(s);
        cameraPos.x = this.pos.x;
    }
}

/* info
A car with two sprung wheels on bumpy ground, built from Box2D bodies
and joints. Hold the left mouse button or the right arrow key to drive
right, and the right mouse button or the left arrow key to drive left.

## How it works
### Setting up
`await box2dInit()` loads the Box2D plugin, and has to finish before
any Box2D object is made, so `gameInit` is `async`. Box2D reads
`gravity` in units per second squared, so `-20` is a much bigger number
than the engine's own objects would use, which count per frame.

### The ground
The ground is a line, not a solid shape. The loop makes 1000 points, 5
units apart, starting at x `-15`. The height `y` is a random walk: each
point is up to one unit above or below the last, and `clamp` keeps it
from 0 to 5. Eight is taken off so the ground is below the middle of
the view.

`new Box2dStaticObject` makes a body that never moves, and
`addEdgeList(points)` adds the line through all the points as its
shape. An edge list has no inside and is for ground like this.
`lineWidth = 1` is only how thick it is drawn.

### The car
`CarObject` extends `Box2dObject`, which is dynamic. Its body is a box
7 units wide and 2 tall, `addBox(vec2(7,2))`, drawn in red from that
shape because the car has no tile.

The loop runs twice, with `i` at 1 and then 0, and makes a wheel each
time:

- The wheel is another `Box2dObject`, placed 2 units to one side of the
  car's center and 1 below it. It has a tile, so the tile is what is
  drawn, 2 units across.
- `addCircle(2, vec2(), 1, friction)` is its shape: a circle of
  diameter 2, with no offset, a density of 1 and a friction of 20. The
  high friction is what lets the wheel grip the ground.
- `new Box2dWheelJoint(this, wheel)` joins the wheel to the car. A
  wheel joint lets the wheel turn, and slide along one line fixed to
  the car, up and down unless another is given, with a spring along
  that line. That is the suspension.
- `setSpringFrequencyHz(4)` sets how stiff the spring is, in bounces a
  second. Lower is softer.
- `setMaxMotorTorque(250)` is how hard the joint's motor can turn the
  wheel, and `enableMotor(!i)` turns the motor on only when `i` is 0.
  That is the wheel on the left, so the car is driven by one wheel and
  the other rolls free.

### Driving
`update` runs every frame. `input` is 1, -1 or 0: the mouse buttons
first, and without them `keyDirection().x`, the left and right arrow
keys or A and D. While there is input the motor's speed changes by 1 a
frame, up
to `maxSpeed` either way. The speed is how fast the wheel turns, in
radians per second, clockwise when positive, which rolls the car to
the right. With no input the speed is set to 0, so the motor works to
stop the wheel.

The last line keeps the camera's x on the car.

## Try it
- Softer suspension: `frequency = 4` to `frequency = 1.5`.
- A higher top speed: `maxSpeed = 40` to `maxSpeed = 80`.
- Slippery tires: `const friction = 20` to `const friction = .2`.
- Low gravity: `gravity.y = -20` to `gravity.y = -5`.
- Steeper bumps: `i*5-15` to `i*2-15` puts the points 2 units apart.

## See also
Box2D Demo covers bodies, shapes and the mouse joint, and Box2D Pool
and Box2D Tile Layer are the other Box2D shorts. Box2D Plugin in the
full examples has the other joints.
*/
