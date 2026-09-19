// drive laps around a hilly track, hit every gate in order
const trackSize = 160, roadWidth = 8, gateCount = 4;
const engineSound = new Sound([,0,90,.01,.03,.1,3,1.5,,,,,,.6]);
let terrain, car, lapCount = 0, nextGate = 1, bestTime = 0, lapTime = 0;

// the center line of the track, a wobbly circle on the ground
function trackRadius(a) { return 42 + 9*sin(a*3) + 5*sin(a*2 + 1); }
function trackPoint(a) { return vec3(trackRadius(a)).rotateY(-a); }
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
    const grassColor = hsl(.32,.4,.33), rockColor = hsl(.13,.18,.42), roadColor = hsl(.1,.05,.28);
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
            colorRow.push(blend < .4 ? roadColor : grassColor.lerp(rockColor, hills));
        }
        heights.push(heightRow);
        colors.push(colorRow);
    }
    return new HeightMap(heights, vec2(trackSize), 18, colors);
}

// a car and a tree, each a few builders combined into one mesh
function buildCar()
{
    const mesh = buildBox(vec3(1.6,.6,3.4)).setColor(hsl(0,.7,.5));
    mesh.combine(buildBox(vec3(1.3,.5,1.5)), buildMatrix(vec3(0,.5,-.2)), hsl(.6,.6,.87));
    mesh.combine(buildBox(vec3(1.7,.15,.5)), buildMatrix(vec3(0,.6,1.6)), hsl(0,0,.2));
    const wheel = buildCylinder(.8, .4, 10);
    for (let i = 4; i--;)
    {
        const pos = vec3(i&1 ? .9 : -.9, -.3, i&2 ? 1.2 : -1.2);
        mesh.combine(wheel, buildMatrix(pos, vec3(0,0,PI/2)), hsl(.65,.1,.1));
    }
    return mesh;
}
function buildTree()
{
    const mesh = buildCylinder(.5, 3, 7).setColor(hsl(.08,.4,.25));
    mesh.combine(buildCone(3.2, 4, 8), buildMatrix(vec3(0,3,0)), hsl(.35,.5,.23));
    mesh.combine(buildCone(2.2, 3, 8), buildMatrix(vec3(0,4.8,0)), hsl(.34,.45,.33));
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
        const mark = hsl(0,0,.1,.7), faded = hsl(0,0,.1,0);
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
        const forward = vec3(0, 0, -1).rotateY(this.yaw);
        this.pos3D = this.pos3D.add(forward.scale(this.speed));
        this.pos3D.y = terrain.getHeight(this.pos3D.x, this.pos3D.z) + .85;
        const ahead = this.pos3D.add(forward.scale(1.5));
        const behind = this.pos3D.subtract(forward.scale(1.5));
        const rise = terrain.getHeight(ahead.x, ahead.z) - terrain.getHeight(behind.x, behind.z);
        this.rotation3D = vec3(atan2(rise, 3), this.yaw, -input.x*this.speed*.6);
        for (const trail of this.trails)
            trail.side = vec3(1).rotateY(this.yaw);

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
    render3D.setSky(hsl(.61,.62,.52), hsl(.6,.7,.84), hsl(.33,.05,.47));
    render3D.setFog(45, 140);
    render3D.lightDirection = vec3(.4,-1,.3).normalize();
    render3D.ambientColor = hsl(.62,.11,.45);
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
        colors.push(hsl(.65, .05, i%8 < 4 ? .17 : .21));
    }
    new EngineObject3D(vec3(), buildRibbon(points, roadWidth, colors, true));

    // a post on each side of every gate, the finish line is red
    const post = buildBox(vec3(.6,5,.6));
    for (let i = gateCount*2; i--;)
    {
        const a = floor(i/2)/gateCount*2*PI, side = i%2 ? 1 : -1;
        const p = trackPoint(a).add(trackSide(a).scale(side*(roadWidth/2 + 1)));
        p.y = terrain.getHeight(p.x, p.z) + 2.5;
        const postObject = new EngineObject3D(p, post);
        postObject.color = i > 1 ? hsl(.14,1,.55) : hsl(0,.7,.5);
    }

    // trees scattered clear of the road, welded into one mesh so they are one draw
    const tree = buildTree(), forest = new Mesh;
    for (let i = 300; i--;)
    {
        const x = rand(-trackSize/2, trackSize/2), z = rand(-trackSize/2, trackSize/2);
        if (trackDistance(x, z) < roadWidth/2 + 6)
            continue;
        const pos = vec3(x, terrain.getHeight(x, z) + 1.5, z);
        forest.combine(tree, buildMatrix(pos, vec3(0, rand(2*PI)), vec3(rand(.7,1.3))));
    }
    new EngineObject3D(vec3(), forest).cullBackFaces = true;
    car = new Car(trackPoint(0));
    lapTime = time;
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
        drawTextScreen('BEST ' + formatTime(bestTime), vec2(110, 95), 26, WHITE, 5, BLACK);
    const gate = nextGate ? 'NEXT GATE ' + nextGate : 'FINISH LINE';
    drawTextScreen(gate, vec2(mainCanvasSize.x - 140, 50), 28, YELLOW, 5, BLACK);
    const speed = round(abs(car.speed)*180) + ' KPH';
    drawTextScreen(speed, vec2(mainCanvasSize.x/2, mainCanvasSize.y - 40), 36, WHITE, 6, BLACK);
}
