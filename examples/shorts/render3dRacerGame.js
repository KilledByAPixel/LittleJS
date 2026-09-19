// drive laps around a hilly track, hit every gate in order
const trackSize = 160, roadWidth = 8, gateCount = 4;
const engineSound = new Sound([,0,90,.01,.03,.1,3,1.5,,,,,,.6]);
let terrain, car, lapCount = 0, nextGate = 1, bestTime = 0, lapTime = 0;

// the center line of the track, a wobbly circle on the ground
function trackRadius(a) { return 42 + 9*sin(a*3) + 5*sin(a*2 + 1); }
function trackPoint(a) { const r = trackRadius(a); return vec3(cos(a)*r, 0, sin(a)*r); }
function trackDistance(x, z) { return abs(hypot(x, z) - trackRadius(atan2(z, x))); }
function trackSide(a)
{
    const d = trackPoint(a + .01).subtract(trackPoint(a)).normalize();
    return vec3(-d.z, 0, d.x);
}

// rolling noise terrain, flattened into a corridor along the track
function buildTerrain()
{
    const n = 81, heights = [], colors = [];
    for (let r = 0; r < n; ++r)
    {
        const heightRow = [], colorRow = [];
        for (let c = 0; c < n; ++c)
        {
            const x = (c/(n-1) - .5)*trackSize, z = (r/(n-1) - .5)*trackSize;
            const hills = noise2D(x*.025, z*.025)*.75 + noise2D(x*.08, z*.08)*.25;
            const flat = .3 + .1*sin(atan2(z, x)*2 + 1);
            const blend = smoothStep(clamp((trackDistance(x, z) - roadWidth/2)/12));
            heightRow.push(lerp(flat, hills, blend));
            const grass = rgb(.22,.45,.2).lerp(rgb(.5,.47,.35), hills);
            colorRow.push(blend < .4 ? rgb(.3,.29,.27) : grass);
        }
        heights.push(heightRow);
        colors.push(colorRow);
    }
    return new HeightMap(heights, vec2(trackSize), 18, colors);
}

// a car and a tree, each a few builders combined into one mesh
function buildCar()
{
    const mesh = buildBox(vec3(1.6,.6,3.4)).setColor(rgb(.85,.15,.15));
    mesh.combine(buildBox(vec3(1.3,.5,1.5)), buildMatrix(vec3(0,.5,-.2)), rgb(.8,.85,.95));
    mesh.combine(buildBox(vec3(1.7,.15,.5)), buildMatrix(vec3(0,.6,1.6)), rgb(.2,.2,.2));
    const wheel = buildCylinder(.8, .4, 10);
    for (let i = 4; i--;)
    {
        const pos = vec3(i&1 ? .9 : -.9, -.3, i&2 ? 1.2 : -1.2);
        mesh.combine(wheel, buildMatrix(pos, vec3(0,0,PI/2)), rgb(.1,.1,.12));
    }
    return mesh;
}
function buildTree()
{
    const mesh = buildCylinder(.5, 3, 7).setColor(rgb(.35,.25,.15));
    mesh.combine(buildCone(3.2, 4, 8), buildMatrix(vec3(0,3,0)), rgb(.12,.35,.15));
    mesh.combine(buildCone(2.2, 3, 8), buildMatrix(vec3(0,4.8,0)), rgb(.18,.48,.2));
    return mesh;
}

class Car extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, buildCar());
        this.speed = 0;
        this.yaw = PI;
        this.specular = .6;
        this.cullBackFaces = true;

        // a skid mark from each rear wheel, lying flat instead of facing the camera
        const mark = rgb(.1,.1,.1,.7), faded = rgb(.1,.1,.1,0);
        this.trails = [-.9, .9].map(x =>
            this.addChild(new Trail3D(vec3(x,-.65,1.3), 1.5, .35, undefined, mark, faded)));
    }
    update()
    {
        // drive with the arrow keys, grass is slow
        const input = keyDirection();
        const offRoad = trackDistance(this.pos3D.x, this.pos3D.z) - roadWidth/2;
        this.speed += input.y*.012;
        this.speed *= offRoad < 0 ? .985 : .92;
        this.speed = clamp(this.speed, -.15, offRoad < 0 ? .6 : .3);
        this.yaw -= input.x*.035*clamp(abs(this.speed)*5)*sign(this.speed || 1);

        // follow the ground, the nose follows the slope
        const forward = vec3(-sin(this.yaw), 0, -cos(this.yaw));
        this.pos3D = this.pos3D.add(forward.scale(this.speed));
        this.pos3D.y = terrain.getHeight(this.pos3D.x, this.pos3D.z) + .85;
        const ahead = this.pos3D.add(forward.scale(1.5));
        const behind = this.pos3D.subtract(forward.scale(1.5));
        const rise = terrain.getHeight(ahead.x, ahead.z) - terrain.getHeight(behind.x, behind.z);
        this.rotation3D = vec3(atan2(rise, 3), this.yaw, -input.x*this.speed*.6);
        for (const trail of this.trails)
            trail.side = vec3(cos(this.yaw), 0, -sin(this.yaw));

        // the engine revs faster with speed
        if (frame % max(2, round(9 - abs(this.speed)*12)) == 0)
            render3D.playSound(engineSound, this.pos3D, .4, .7 + abs(this.speed)*2.5);

        // gates count in order, the finish line completes a lap
        const gate = floor(mod(atan2(this.pos3D.z, this.pos3D.x), 2*PI)/(2*PI)*gateCount);
        if (gate == nextGate && offRoad < 3)
        {
            if (!gate)
            {
                ++lapCount;
                bestTime = bestTime ? min(bestTime, time - lapTime) : time - lapTime;
                lapTime = time;
            }
            nextGate = (gate + 1) % gateCount;
        }
    }
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.2,.42,.85), rgb(.72,.82,.95), rgb(.45,.5,.45));
    render3D.fogStart = 45;
    render3D.fogEnd = 140;
    render3D.lightDirection = vec3(.4,-1,.3).normalize();
    render3D.ambientColor = rgb(.4,.43,.5);
    render3D.shadows = true;
    render3D.shadowRange = 45;
    terrain = buildTerrain();
    new EngineObject3D(vec3(), terrain.buildMesh(true));

    // the road is a ribbon along the center line just above the ground, striped
    const points = [], colors = [];
    for (let i = 0; i < 120; ++i)
    {
        const p = trackPoint(i/120*2*PI);
        p.y = terrain.getHeight(p.x, p.z) + .1;
        points.push(p);
        colors.push(i%8 < 4 ? rgb(.16,.16,.18) : rgb(.2,.2,.22));
    }
    new EngineObject3D(vec3(), buildRibbon(points, roadWidth, colors, true));

    // a post on each side of every gate, the finish line is red
    const post = buildBox(vec3(.6,5,.6));
    for (let i = 0; i < gateCount*2; ++i)
    {
        const a = floor(i/2)/gateCount*2*PI;
        const p = trackPoint(a).add(trackSide(a).scale((i%2 ? 1 : -1)*(roadWidth/2 + 1)));
        p.y = terrain.getHeight(p.x, p.z) + 2.5;
        new EngineObject3D(p, post, undefined, i > 1 ? rgb(1,.85,.1) : rgb(.9,.15,.15));
    }

    // trees scattered clear of the road
    const tree = buildTree();
    for (let i = 300; i--;)
    {
        const x = rand(-trackSize/2, trackSize/2), z = rand(-trackSize/2, trackSize/2);
        if (trackDistance(x, z) < roadWidth/2 + 6)
            continue;
        const o = new EngineObject3D(vec3(x, terrain.getHeight(x, z) + 1.5, z), tree);
        o.rotation3D.y = rand(2*PI);
        o.scale3D = vec3(rand(.7, 1.3));
        o.cullBackFaces = true;
    }
    car = new Car(trackPoint(0));
    lapTime = time;
}

function gameUpdatePost()
{
    // the camera and the shadow map follow the car
    render3D.camera.follow(car.pos3D, vec3(sin(car.yaw)*10, 5, cos(car.yaw)*10), .15);
    render3D.shadowCenter = car.pos3D;
}

function gameRenderPost()
{
    drawTextScreen('LAP ' + lapCount, vec2(110, 50), 44, WHITE, 6, BLACK);
    if (bestTime)
        drawTextScreen('BEST ' + formatTime(bestTime), vec2(110, 95), 26, WHITE, 5, BLACK);
    const gate = nextGate ? 'NEXT GATE ' + nextGate : 'FINISH LINE';
    drawTextScreen(gate, vec2(mainCanvasSize.x - 140, 50), 28, YELLOW, 5, BLACK);
    const speed = round(abs(car.speed)*180) + ' KPH';
    drawTextScreen(speed, vec2(mainCanvasSize.x/2, mainCanvasSize.y - 40), 36, WHITE, 6, BLACK);
}
