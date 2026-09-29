// rain on a pool: the waves are a cellular automaton, each cell heads
// for the average of its neighbors and overshoots; the water is a grid
// mesh changed in place each frame, and a rain drop that reaches it
// starts a ring there

const poolSize = 24, samples = 128, waveHeight = 4;
let water, rain, now, last;
const vertices = []; // where each cell's vertex is in the mesh

// push the water down around a world position, a ring spreads from
// there; a round dent a few cells wide makes a smooth one
function drop(x, z, depth)
{
    const cell = (v)=>
        clamp(round((v/poolSize + .5)*(samples-1)), 3, samples-4);
    for (let i = -2; i <= 2; ++i)
    for (let j = -2; j <= 2; ++j)
        now[cell(z)+j][cell(x)+i] -= depth*max(1 - hypot(i, j)/3, 0);
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.3,.2), hsl(.6,.2,.45));
    render3D.setFog(25, 70);
    render3D.sunDirection = vec3(.5,1,.3);
    new CameraControl3D(vec3(), 28, .6, .002);

    // the pool's floor under the water
    const bottom = buildGrid(vec2(poolSize), 1, hsl(.55,.6,.12));
    new EngineObject3D(vec3(0,-2,0), bottom);

    // the water, a smooth grid; dynamicDraw is for a mesh whose values
    // change and whose shape does not
    const mesh = buildGrid(vec2(poolSize), samples-1,
        hsl(.55,.7,.45,.85), ()=> 0, true);
    mesh.dynamicDraw = true;
    water = new EngineObject3D(vec3(), mesh);
    water.transparent = true;
    water.specular = 1;
    water.reflectivity = .3; // the sky in it, more toward the horizon

    // the grid uses each vertex in several places of its strips, its
    // keys say which cell each one is
    mesh.vertexKeys.forEach((cell, i)=> vertices[cell] = i);
    const grid = ()=> Array.from({length: samples},
        ()=> new Float32Array(samples));
    now = grid(), last = grid();

    // rain falls straight down, each drop a streak along where it was
    rain = new ParticleEmitter3D(
        vec3(0,14,0),                      // pos
        vec3(poolSize,0,poolSize), 0,      // emitSize, emitTime
        60, 0, undefined,                  // rate, cone, tileInfo
        hsl(.6,.4,.9,.5), hsl(.6,.2,1,.3), // colorStartA, colorStartB
        hsl(.6,.4,.9,.5), hsl(.6,.2,1,.3), // colorEndA, colorEndB
        2, .05, .05,                       // time, sizeStart, sizeEnd
        .4, 1, 0,                          // speed, damping, gravity
        0, .2                              // fade, randomness
    );
    rain.rotation3D.x = PI; // it emits along its own up, so aim it down
    rain.trailTime = .1;

    // a drop that reaches the water starts a ring there and ends
    rain.particleUpdateCallback = (p)=>
    {
        if (p.pos.y > 0)
            return;
        drop(p.pos.x, p.pos.z, .03);
        p.destroy();
    };
}

function gameUpdate()
{
    if (mouseWasPressed(2)) // right click drops a stone
    {
        const p = render3D.screenToGround(mousePosScreen);
        p && drop(p.x, p.z, .3);
    }

    // the waves: each cell goes to twice the average of its neighbors
    // less where it was, a little less each time so they die down
    const {points, normals} = water.mesh;
    const slope = waveHeight*(samples-1)/poolSize/2;
    for (let z = samples-1; --z;)
    for (let x = samples-1; --x;)
    {
        const left = now[z][x-1], right = now[z][x+1];
        const back = now[z-1][x], front = now[z+1][x];
        const around = left + right + back + front;
        const wave = last[z][x] = (around/2 - last[z][x])*.985;

        // the cell's vertex: its height, and which way it faces
        const i = vertices[z*samples + x], normal = normals[i];
        points[i].y = wave*waveHeight;
        normal.x = (left-right)*slope;
        normal.z = (back-front)*slope;
    }
    [now, last] = [last, now];
    water.mesh.dirty = true;
}

function gameRenderPost()
{
    const text = 'right click: drop a stone';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}
