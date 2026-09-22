// drive laps around a hilly track, hit every gate in order
const trackSize = 160, roadWidth = 8, gateCount = 4;
const engineSound = new Sound([,0,91.6,,.4,0,2,2,,,,,.2,1,,,,,,.3,-200]);
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
        this.cullBackFaces = true;

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
        this.trails = [-.9, .9].map(x => this.addChild(
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
            this.engineLoop = render3D.playSound(engineSound, this.pos3D, .2, 1, 1, true);
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
    render3D.lightDirection = vec3(.4,-1,.3);
    render3D.ambientColor = hsl(.6,.1,.5);
    render3D.shadows = true;
    render3D.shadowRange = 90;
    render3D.shadowMapSize = 2048; // twice the range, so twice the pixels

    // hills from noise, flattened where the road runs
    const n = 81, heights = [], colors = [];
    const grassColor = hsl(.3,.4,.3);
    const rockColor = hsl(.1,.2,.4);
    const roadColor = hsl(.1,.1,.3);
    for (let r = 0; r < n; ++r)
    {
        const heightRow = [], colorRow = [];
        for (let c = 0; c < n; ++c)
        {
            const x = (c/(n-1) - .5)*trackSize;
            const z = (r/(n-1) - .5)*trackSize;
            const hills = noise2D(x*.025, z*.025);
            const edge = trackDistance(x, z) - roadWidth; // flat past the road
            const blend = smoothStep(clamp(edge/12));
            heightRow.push(lerp(.3, hills, blend));
            const ground = grassColor.lerp(rockColor, hills);
            colorRow.push(edge < 1 ? roadColor : ground);
        }
        heights.push(heightRow);
        colors.push(colorRow);
    }
    terrain = new HeightMap(heights, vec2(trackSize), 18, colors);
    new EngineObject3D(vec3(), terrain.buildMesh(true));

    // the road is a ribbon along the center line just above the ground, striped
    const points = [], stripes = [];
    for (let i = 0; i < 120; ++i)
    {
        const p = trackPoint(i/120*2*PI);
        p.y = terrain.getHeight(p) + .1;
        points.push(p);
        stripes.push(hsl(.6, .1, i%8 < 4 ? .2 : .25));
    }
    new EngineObject3D(vec3(), buildRibbon(points, roadWidth, stripes, true));

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
    tree.combine(buildCone(3.2, 4, 8), vec3(0,3,0), hsl(.3,.5,.2));
    tree.combine(buildCone(2.2, 3, 8), vec3(0,4.8,0), hsl(.3,.5,.3));
    const half = trackSize/2;
    for (let i = 300; i--;)
    {
        const x = rand(-half, half), z = rand(-half, half);
        if (trackDistance(x, z) < roadWidth/2 + 6)
            continue;
        const y = terrain.getHeight(x, z) + 1.5;
        const treeObject = new EngineObject3D(vec3(x, y, z), tree);
        treeObject.rotation3D.y = rand(2*PI);
        treeObject.scale3D = vec3(rand(.7,1.3));
        treeObject.cullBackFaces = true;
    }
    car = new Car(trackPoint(0));
}

function gameUpdatePost()
{
    // the camera and the shadow map follow the car
    render3D.camera.follow(car.pos3D, vec3(0, 5, 10).rotateY(car.yaw), .15);
    render3D.shadowCenter = car.pos3D;
}

function gameRenderPost()
{
    drawTextScreen('LAP ' + lapCount, vec2(110, 50), 44, WHITE, 6, BLACK);
    if (bestTime)
        drawTextScreen('BEST ' + formatTime(bestTime), vec2(110, 95),
            26, WHITE, 5, BLACK);
    const gate = nextGate ? 'NEXT GATE ' + nextGate : 'FINISH LINE';
    drawTextScreen(gate, vec2(mainCanvasSize.x - 140, 50),
        28, YELLOW, 5, BLACK);
    const speed = round(abs(car.speed)*180) + ' KPH';
    drawTextScreen(speed, vec2(mainCanvasSize.x/2, mainCanvasSize.y - 40),
        36, WHITE, 6, BLACK);
    drawTextScreen('arrows: drive', vec2(110, mainCanvasSize.y - 40),
        26, WHITE, 5, BLACK);
}
