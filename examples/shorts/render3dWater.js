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

    // rain falls straight down, each drop a streak along where it was;
    // the built-in rain at this short's speed, flattened to a sheet of
    // sky as wide as the pool
    rain = particleEffect3D('rain', vec3(0,14,0), {flatten: true,
        emitSize: poolSize, emitRate: 60, speed: .4, gravity: 0,
        particleTime: 2, sizeStart: .05, sizeEnd: .05, fadeRate: 0});
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

/* info
Rain on a pool. The waves are a cellular automaton: each cell heads for
the average of its neighbors and overshoots. The water is a grid mesh
changed in place each frame, and a rain drop that reaches it starts a
ring there. Right click the water to drop a stone. Drag with the left
button to turn the camera and roll the wheel to zoom.

## How it works
The surface is kept as a grid of heights, `samples` cells a side. Each
frame every cell gets a new height: half the sum of its four neighbors,
less the height it had the frame before. A cell below its neighbors is
pulled up and goes past them, and that overshoot is what carries a ring
outward. Two grids hold it: `now` is this frame and `last` the one
before. The new height is written over the old one in `last`, and then
the two swap.

`poolSize` is the pool's width in world units. `waveHeight` turns a
grid value into a height in the world.

### drop
`drop(x, z, depth)` pushes the water down around a world position.
`cell` turns a coordinate into a grid index: `v/poolSize + .5` is 0 to 1
across the pool, and `clamp` keeps it 3 cells from the edge so the dent
fits. The dent is 5 cells square, deepest in the middle and fading with
`hypot(i, j)`, the distance from it. A round dent a few cells wide
makes a smooth ring.

### The scene
- `render3D.setFog(fogStart, fogEnd)` sets the distances from the
  camera where fog starts and where it is total. Its color is the
  horizon color `setSky` was given.
- The pool's floor is a one cell grid 2 units under the water.
- The rain is the built-in `'rain'` effect, made with
  `particleEffect3D` 14 units up. `flatten` makes the area the drops
  start in a flat sheet, and `emitSize` makes it as wide as the pool.
  `speed` is in world units per frame. `trailTime = .1` draws each drop
  as a streak along the last tenth of a second of its path.
- `particleUpdateCallback` is called with each particle every update,
  after it moves. When a drop's `pos.y` is at the water or under it, the
  callback starts a ring there and ends the drop with `p.destroy()`.

### The water mesh
`buildGrid(size, segments, color, heightFunction, smooth)` with
`samples-1` cells a side has `samples` vertices a side, one for each
cell of the automaton. The color's alpha is `.85`, and
`transparent = true` has the object drawn blended, so the floor shows
through. `reflectivity` adds the sky's colors, more where the surface
is seen at a glancing angle.

A mesh is uploaded to the GPU once. `dynamicDraw = true` says its
values will change and its shape will not, so setting `mesh.dirty`
only writes the vertices again.

The builders make triangle strips, which list a vertex once for every
strip that uses it. A smooth grid sets `mesh.vertexKeys`, a number for
each entry that says which vertex it is: here its row times `samples`
plus its column. `vertices` is that list turned around, from a cell to
one of its entries. The entries of one vertex share the same point and
normal objects, so changing one changes them all.

### gameUpdate
`mouseWasPressed(2)` is the right button.
`render3D.screenToGround(mousePosScreen)` is where the mouse lands on
the flat ground at height 0, or `undefined` when it misses.

The loops then run the automaton over every cell but the border, which
stays at 0. `*.985` takes a little off each wave so it dies down. Each
cell's vertex gets its height, and its normal is leaned by the slope:
the difference between the neighbors on each side, times `slope`, which
is `waveHeight` over the width of two cells. The normals are what make
the light and the reflection move with the waves.

## Try it
- Change `*.985` to `*.999` and the waves last much longer.
- Set `emitRate: 60` to `5` for a light rain.
- Drop a bigger stone: change `p.z, .3)` to `p.z, 1)`.
- Change `waveHeight = 4` to `10` for taller waves.
- Set `water.reflectivity` to `1` for a mirror of the sky.

## See also
3D Particles has more of the effects, and 3D Trails moves a mesh's
points in place the same way. 3D Height Map makes terrain from a grid
of heights, and 3D Materials shows `reflectivity` on a ball.
*/
