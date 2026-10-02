const trackSize = 160, roadWidth = 8, gateCount = 4;
const engineSound = new Sound([.5,0,91,,.5,.01,2,,,,,,.14,1,,,,,,,-150]);
let terrain, car, lapCount = 0, nextGate = 1, bestTime = 0;
let lapTimer = new Timer(0);

// the center line of the track, a wobbly loop on the ground
function trackRadius(a) { return 42 + 9*sin(a*3) + 5*sin(a*2 + 1); }
function trackPoint(a) { return vec3(trackRadius(a), 0, 0).rotateY(-a); }
function trackDistance(x, z)
{ return abs(hypot(x, z) - trackRadius(atan2(z, x))); }

class Car extends EngineObject3D
{
    constructor(pos)
    {
        // make a simple car shaped mesh
        const body = buildBox(vec3(1.6,.6,3.4)).setColor(hsl(0,.7,.5));
        body.combine(buildBox(vec3(1.3,.5,1.5)), vec3(0,.5,-.2), hsl(.6,.6,.9));
        body.combine(buildBox(vec3(1.7,.15,.5)), vec3(0,.6,1.6), hsl(0,0,.2));

        super(pos, body);
        this.speed = 0;
        this.yaw = PI;
        this.spin = this.steer = 0;
        this.specular = .6;

        // four wheels as children so they can roll and steer
        const wheelMesh = buildCylinder(.8, .4, 10).setColor(hsl(.6,.1,.1));
        wheelMesh.combine(buildBox(vec3(.5,.44,.1)), undefined, hsl(0,0,.5));
        this.wheels = [];
        for (let i = 4; i--;)
        {
            const pos = vec3(i&1 ? .9 : -.9, -.3, i&2 ? 1.2 : -1.2);
            const wheel = this.addChild(new EngineObject3D(pos, wheelMesh));
            wheel.front = !(i&2);
            this.wheels.push(wheel);
        }

        // a skid mark from each rear wheel, lying flat on the ground
        const mark = hsl(0,0,.1,.7), faded = hsl(0,0,.1,0);
        this.trails = [-.9, .9].map(x=> this.addChild(
            new Trail3D(vec3(x,-.65,1.3), 1.5, .35, undefined, mark, faded)));
    }
    update()
    {
        // drive with the arrow keys, grass is slow
        const input = keyDirection();
        const offRoad = trackDistance(this.pos3D.x, this.pos3D.z) - roadWidth/2;
        this.speed += input.y*.01;
        this.speed *= offRoad < 0 ? .99 : .95;
        this.speed = clamp(this.speed, -.15, offRoad < 0 ? .6 : .3);
        this.yaw -= input.x*.03*clamp(abs(this.speed)*5)*sign(this.speed);

        // car follows the angle of the ground
        const forward = vec3(0, 0, -1).rotateY(this.yaw);
        this.pos3D = this.pos3D.add(forward.scale(this.speed));
        this.pos3D.y = terrain.getHeight(this.pos3D) + .85;
        const ahead = this.pos3D.add(forward.scale(1.5));
        const behind = this.pos3D.subtract(forward.scale(1.5));
        const rise = terrain.getHeight(ahead) - terrain.getHeight(behind);
        this.rotation3D = vec3(atan2(rise, 3), this.yaw, 0);

        // the wheels roll with the speed
        this.spin -= this.speed/.4;
        this.steer = lerp(this.steer, -input.x*.5, .2);
        for (const wheel of this.wheels)
        {
            const steer = wheel.front ? this.steer : 0;
            wheel.rotation3D = vec3(this.spin, steer, PI/2);
        }

        // make flat skid marks
        for (const trail of this.trails)
            trail.side = vec3(1, 0, 0).rotateY(this.yaw);

        // engine sound loops, playing faster with speed
        if (!this.engineLoop?.isPlaying())
            this.engineLoop =
                render3D.playSoundLoop(engineSound, this.pos3D, .4);
        this.engineLoop?.setRate(.4 + abs(this.speed)*2);

        // gates count in order, the finish line completes a lap
        const angle = mod(atan2(this.pos3D.z, this.pos3D.x), 2*PI);
        const gate = floor(angle/(2*PI)*gateCount);
        if (gate == nextGate && offRoad < 3)
        {
            if (!gate)
            {
                ++lapCount;
                const lap = lapTimer.get();
                bestTime = bestTime ? min(bestTime, lap) : lap;
                lapTimer.set();
            }
            nextGate = (gate + 1) % gateCount;
        }
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.6,.5), hsl(.6,.7,.8), hsl(.3,.1,.5));
    render3D.setFog(45, 140);
    render3D.ambientColor = hsl(.6,.1,.5);
    render3D.shadows = true;
    render3D.shadowRange = 150;
    render3D.shadowMapSize = 2048;

    // hills from noise, flattened where the road is
    const n = 81, heights = [], colors = [];
    const grassColor = hsl(.3,.4,.3);
    const rockColor = hsl(.1,.2,.4);
    for (let r = 0; r < n; ++r)
    {
        const heightRow = [], colorRow = [];
        for (let c = 0; c < n; ++c)
        {
            const x = (c/(n-1) - .5)*trackSize;
            const z = (r/(n-1) - .5)*trackSize;
            const hills = noise2D(x*.025, z*.025);
            const edge = trackDistance(x, z) - roadWidth;
            const blend = smoothStep(clamp(edge/12));
            heightRow.push(lerp(.3, hills, blend));
            colorRow.push(grassColor.lerp(rockColor, hills));
        }
        heights.push(heightRow);
        colors.push(colorRow);
    }
    terrain = new HeightMap(heights, vec2(trackSize), 18, colors, vec3(), true);

    // the road is a ribbon along the center line just above the ground
    const points = [];
    for (let i = 0; i < 120; ++i)
    {
        const p = trackPoint(i/120*2*PI);
        p.y = terrain.getHeight(p) + .1;
        points.push(p);
    }
    const road = buildRibbon(points, roadWidth, hsl(.6,.1,.2), true);
    new EngineObject3D(vec3(), road);

    // a post on each side of every gate, the finish line is red
    const post = buildBox(vec3(.6,5,.6));
    for (let i = gateCount*2; i--;)
    {
        const a = floor(i/2)/gateCount*2*PI, side = i%2 ? 1 : -1;
        const along = trackPoint(a + .01).subtract(trackPoint(a));
        const across = vec3(-along.z, 0, along.x);
        const p = trackPoint(a).add(across.normalize(side*(roadWidth/2 + 1)));
        p.y = terrain.getHeight(p) + 2.5;
        const postObject = new EngineObject3D(p, post);
        postObject.color = i > 1 ? hsl(.15,1,.5) : hsl(0,.7,.5);
    }

    // trees clear of the road, sharing one mesh so they draw as one batch
    const tree = buildCylinder(.5, 3, 7).setColor(hsl(.1,.4,.3));
    tree.combine(buildCone(3.2, 4, 8), vec3(0,2.5,0), hsl(.3,.5,.2));
    tree.combine(buildCone(2.2, 3, 8), vec3(0,4,0), hsl(.3,.5,.3));
    const half = trackSize/2;
    for (let i = 300; i--;)
    {
        const x = rand(-half, half), z = rand(-half, half);
        if (trackDistance(x, z) < roadWidth/2 + 6)
            continue;
        const y = terrain.getHeight(x, z) + 1.5;
        const treeObject = new EngineObject3D(vec3(x, y, z), tree);
        treeObject.scale3D = vec3(rand(1,2));
    }

    // make the car on the road, with the camera already behind it
    const start = trackPoint(0);
    start.y = terrain.getHeight(start) + .85;
    car = new Car(start);
    render3D.camera.follow(car.pos3D, vec3(0,5,10).rotateY(car.yaw));
}

function gameUpdatePost()
{
    // the camera and the shadow map follow the car
    const target = car.pos3D.add(vec3(0, 2, 0));
    render3D.camera.follow(target, vec3(0, 1, 6).rotateY(car.yaw), .2);
    render3D.shadowCenter = car.pos3D;
}

function gameRenderPost()
{
    drawTextScreen('LAP ' + lapCount, vec2(95, 40), 44, WHITE, 6);
    const bestText = 'BEST ' + formatTime(bestTime);
    if (bestTime)
        drawTextScreen(bestText, vec2(90, 85), 26, WHITE, 5);
    const speed = round(car.speed*180) + ' KPH';
    drawTextScreen(speed, vec2(mainCanvasSize.x - 120, 40), 44, WHITE, 6);
}

/* info
Drive laps around a hilly track, and hit every gate in order. Up and
down arrows speed up and brake or reverse, left and right steer. The
grass is slow. The red posts are the finish line, and the screen shows
the lap count, the best lap and the speed.

## How it works
Everything is made in code from one formula for the track. There is no
physics engine in the driving: the car keeps a speed and a heading, and
each frame moves itself and reads the ground's height under it.

### The track
The track's center line is a wobbly circle around the origin.
`trackRadius(a)` is how far out the line is at angle `a`: 42 units, plus
two sine waves that push it in and out. `trackPoint(a)` is that point on
the ground, and `trackDistance(x, z)` is how far a place is from the
line: its distance from the origin, less the radius at its angle. That
one function shapes the hills, keeps trees off the road, and tells the
car when it is on the grass.

### The ground
`HeightMap(heights, mapSize, height, colors, pos3D, smooth)` is terrain
from a grid of heights, each 0 to 1. Here the grid is 81 by 81 samples
over 160 units, and a full height is 18 units.

- `noise2D(x, y)` gives a smooth noise value from 0 to 1, the hills.
- Within `roadWidth` of the center line the height is a flat .3. Over
  the next 12 units `smoothStep` blends it into the hills, so the
  ground under the road is level and the hills rise or fall beside it.
- Each sample's color is grass blended toward rock by its hill height.

`terrain.getHeight(pos)` returns the ground's world height at a place.
The road, the posts, the trees and the car all use it to sit on the
ground.

### Road, gates and trees
- `buildRibbon(points, width, color, closed)` makes a flat strip along
  a path. The path is 120 points of the center line, lifted .1 above
  the ground, and `closed` joins the end to the start.
- Each gate is two posts. `along` is the track's direction at the gate,
  from two points close together, and `across` is that turned a quarter
  turn on the ground, which puts a post on each side of the road.
- The tree is one mesh: a trunk from `buildCylinder` with two cones
  joined on by `combine(mesh, position, color)`. Up to 300 objects share
  it, at random places more than 6 units off the road, each with a
  random `scale3D`.

### Car
The body is three boxes joined with `combine`. It has to be built
before `super`, which is why the constructor starts with it. The wheels
are child objects, so their `pos3D` is an offset from the car, and each
can turn on its own.

In `update`:

- `keyDirection()` is the arrow keys as a `Vector2`. Up adds .01 to the
  speed each frame. The speed is then multiplied by .99 on the road or
  .95 on grass, and clamped to .6 units a frame on the road, .3 off it
  and .15 in reverse. On the road the clamp is the top speed. On grass
  the .95 is: the speed settles near .19, where the .01 added equals
  what is lost, and the .3 only slows a car that leaves the road fast.
- Steering turns `yaw`. It is scaled by the speed so a still car can not
  turn, and by the speed's sign so reversing steers the other way.
- `vec3(0, 0, -1).rotateY(yaw)` is the way the car faces, since objects
  face negative z. The car moves along it, then takes its height from
  the terrain.
- The pitch comes from the ground too: the height 1.5 units ahead less
  the height 1.5 behind is the rise over 3 units, and `atan2(rise, 3)`
  is the slope's angle.
- A wheel is .8 across, so `speed/.4` is the distance moved divided by
  the radius, the angle it rolls in a frame. The front wheels also take
  the steering angle, eased with `lerp`.
- The skid marks are `Trail3D` children at the rear wheels. Setting
  `side` to a level direction lays the ribbon flat on the ground and
  not facing the camera.
- `render3D.playSoundLoop` starts the engine sound and returns its
  `SoundInstance`. `setRate` changes its speed and pitch while it
  plays, so the engine note follows the car's speed.

### Laps
The car's angle around the origin is cut into `gateCount` equal parts,
four quarters here, and `nextGate` is the quarter it must enter next.
Being in that quarter, within 3 units of the road, moves `nextGate` on.
Entering quarter 0 is crossing the finish line: a lap is counted, the
best time kept and `lapTimer` set again. Driving backward enters the
wrong quarter, so it does not count.

### Camera, shadows and text
`gameUpdatePost` runs after the car has moved. `camera.follow(target,
offset, percent)` moves the camera a fifth of the way toward a spot
behind the car each frame, which makes it swing behind in turns, and
looks at the target. `shadowCenter` is moved to the car so the 150 unit
`shadowRange` covers what is near it, and `shadowMapSize = 2048` gives
the shadow map more pixels than the default 1024 to cover it with.
`gameRenderPost` draws the text with `drawTextScreen`, whose position
and size are in screen space and whose fifth argument is an outline's
width. `formatTime` writes seconds as minutes and seconds.

## Try it
- A faster car: change the top speed `.6` to `1`, in
  `offRoad < 0 ? .6 : .3`.
- Sharper steering: `input.x*.03` to `input.x*.06`.
- Taller hills: the `18` in `new HeightMap` to `40`.
- A wider road: `roadWidth = 8` to `roadWidth = 16`. The terrain, the
  gates and the trees all follow.
- Sit the camera high above the car: `vec3(0, 1, 6)` to
  `vec3(0, 12, 14)`.

## See also
3D Height Map shows terrain from images, 3D Trails the ribbons, and 3D
Dodge Game is a smaller game with the same chase camera. 3D Plugin in
the full examples has a bigger terrain. Look up `HeightMap`,
`buildRibbon` and `Camera3D`.
*/
