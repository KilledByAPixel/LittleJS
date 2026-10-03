import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, HeightMap, VoxelMap, EngineObject3D, Ray3D, TextureInfo, TileInfo, vec2, vec3,
    engineObjectsUpdate, engineObjectsCollect3D, FirstPersonCamera3D }
    from '../dist/littlejs.esm.js';
import { loadEngine, keyEvent } from './vmEngine.mjs';

// the level in 3D: height maps and voxel maps that draw themselves and that objects collide with

new Render3DPlugin;
const near = (a, b, epsilon=1e-6, message='')=> assert.ok(Math.abs(a - b) < epsilon, `${message} ${a} != ${b}`);

test('a HeightMap is an object that draws its own mesh, and its lookups are where it is in the world', () =>
{
    const terrain = new HeightMap([[0, 1], [0, 1]], vec2(4), 2, undefined, vec3(10, 3, -5));
    assert.ok(terrain instanceof EngineObject3D);
    assert.ok(terrain.mesh && terrain.mesh.points.length > 0);
    near(terrain.getHeight(10, -5), 3 + 1, 1e-9, 'the middle, half way up the slope');
    near(terrain.getHeight(vec3(12, 0, -5)), 3 + 2, 1e-9, 'the high edge');
    near(terrain.getHeight(8, -5), 3, 1e-9, 'the low edge');
    assert.ok(terrain.getNormal(10, -5).x < 0, 'the slope rises toward +x');
    const hit = terrain.raycast(new Ray3D(vec3(10, 20, -5), vec3(0, -1, 0)));
    near(hit, 20 - 4, 1e-9, 'a ray straight down meets the ground under it');
    terrain.destroy();
});

test('rebuild gives a HeightMap a new mesh after its heights change', () =>
{
    const terrain = new HeightMap([[0, 0], [0, 0]], vec2(2), 1);
    const before = terrain.mesh;
    terrain.heights[0][0] = 1;
    terrain.rebuild();
    assert.notEqual(terrain.mesh, before);
    near(terrain.getHeight(-1, -1), 1);
    terrain.destroy();
});

test('a body with collideLevel falls onto a HeightMap and stands on it, even one placed off the origin', () =>
{
    const terrain = new HeightMap([[.5, .5], [.5, .5]], vec2(10), 2, undefined, vec3(10, 3, 0));
    const body = new EngineObject3D(vec3(10, 9, 0));
    body.setCollision(false, false);
    body.mass = 1;
    render3D.gravity = vec3(0, -.02, 0);
    for (let i = 0; i < 200; ++i)
        engineObjectsUpdate();
    near(body.pos3D.y, 3 + 1 + .5, 1e-6, 'its box bottom on the surface');
    assert.equal(body.groundObject, terrain);
    body.pos3D.x = 30; // off the map's footprint it falls
    for (let i = 0; i < 10; ++i)
        engineObjectsUpdate();
    assert.ok(body.pos3D.y < 4.4);
    render3D.gravity = vec3();
    body.destroy();
    terrain.destroy();
});

test('a 3D object made to collide collides with the level by default', () =>
{
    const o = new EngineObject3D;
    o.setCollision();
    assert.equal(o.collideLevel, true);
    o.destroy();
});

// the triangles of a chunk mesh, 2 per face
const faces = (mesh)=> mesh ? mesh.getTriangles().indices.length / 6 : 0;

test('a lone block shows 6 faces, two touching blocks 10, and outside the map counts as empty', () =>
{
    const map = new VoxelMap(vec3(), vec3(16));
    map.setVoxel(vec3(0, 0, 0), 1); // in a corner of the map, its outer faces still drawn
    map.buildChunks();
    assert.equal(faces(map.chunkMeshes[0]), 6);
    map.setVoxel(vec3(1, 0, 0), 1);
    map.buildChunks();
    assert.equal(faces(map.chunkMeshes[0]), 10);
    assert.equal(map.getVoxel(vec3(1, 0, 0)), 1);
    assert.equal(map.getVoxel(vec3(-1, 0, 0)), 0);
    map.setVoxel(vec3(99, 0, 0), 1); // outside, ignored
    assert.equal(map.data.length, 16 ** 3);
    assert.throws(()=> map.setVoxel(vec3(), 256), /Assert failed/);
    assert.throws(()=> map.setVoxel(vec3(), 1.5), /Assert failed/);
    map.destroy();
});

test('see-through blocks keep their neighbors\' faces, same see-through blocks hide theirs, transparent is apart', () =>
{
    const map = new VoxelMap(vec3(), vec3(16));
    map.setBlockType(5, 5, {seeThrough: true});
    map.setBlockType(6, 6, {transparent: true});
    map.setVoxel(vec3(1, 1, 1), 1);
    map.setVoxel(vec3(2, 1, 1), 5); // leaves beside stone: the stone keeps its face toward it, the leaves do not
    map.buildChunks();
    assert.equal(faces(map.chunkMeshes[0]), 6 + 5);
    map.setVoxel(vec3(3, 1, 1), 5); // two leaves hide the face between them
    map.buildChunks();
    assert.equal(faces(map.chunkMeshes[0]), 6 + 4 + 5);
    map.setVoxel(vec3(1, 3, 1), 6);
    map.setVoxel(vec3(2, 3, 1), 6); // two water blocks, one body of water, in the transparent mesh
    map.buildChunks();
    assert.equal(faces(map.chunkTransparentMeshes[0]), 10);
    map.destroy();
});

test('a doubleSided block type shows its faces from inside too, as the surface of water from under it; others do not', () =>
{
    const map = new VoxelMap(vec3(), vec3(16));
    map.setBlockType(6, 6, {transparent: true, doubleSided: true});
    map.setBlockType(7, 7, {transparent: true});
    map.setVoxel(vec3(1, 1, 1), 6);
    map.buildChunks();
    assert.equal(faces(map.chunkTransparentMeshes[0]), 12, 'each face twice, once facing in');
    const mesh = map.chunkTransparentMeshes[0];
    assert.ok(mesh.normals.some((n)=> n.y < 0) && mesh.normals.some((n)=> n.y > 0));
    map.setVoxel(vec3(1, 1, 1), 7);
    map.buildChunks();
    assert.equal(faces(map.chunkTransparentMeshes[0]), 6, 'glass from outside only');
    assert.equal(map.blockType(6).doubleSided, true);
    map.destroy();
});

test('each face shows its own tile, a {top, side, bottom} type picks one for each', () =>
{
    const texture = new TextureInfo({ width: 64, height: 64 }, false);
    const map = new VoxelMap(vec3(), vec3(16), new TileInfo(vec2(), vec2(16), texture, 0, 0));
    map.ambientOcclusion = false;
    map.setBlockType(1, {top: 0, side: 1, bottom: 2});
    map.setVoxel(vec3(4, 4, 4), 1);
    map.buildChunks();
    // the uv range of each kind of face, which must fit in one tile of the 4x4 sheet
    const mesh = map.chunkMeshes[0], ranges = {};
    for (let i = 0; i < mesh.points.length; ++i)
    {
        const n = mesh.normals[i], uv = mesh.uvs[i];
        const face = n.y > .5 ? 'top' : n.y < -.5 ? 'bottom' : 'side';
        const r = ranges[face] ||= {min: vec2(1e9), max: vec2(-1e9)};
        r.min = vec2(Math.min(r.min.x, uv.x), Math.min(r.min.y, uv.y));
        r.max = vec2(Math.max(r.max.x, uv.x), Math.max(r.max.y, uv.y));
    }
    const tileOf = (face)=>
    {
        const {min, max} = ranges[face];
        assert.ok(max.x - min.x < .25 + 1e-9 && max.y - min.y < .25 + 1e-9, face + ' spans one tile');
        return Math.floor((min.x + max.x) / 2 * 4) + 4 * Math.floor((min.y + max.y) / 2 * 4);
    };
    assert.equal(tileOf('top'), 0);
    assert.equal(tileOf('side'), 1);
    assert.equal(tileOf('bottom'), 2);
    map.destroy();
});

test('setting a block builds its chunk, and a chunk beside it only when a block there touches it', () =>
{
    const map = new VoxelMap(vec3(), vec3(40, 16, 16)), built = [];
    const buildChunk = map.buildChunk.bind(map);
    map.buildChunk = (index)=> { built.push(index); buildChunk(index); };
    const set = (cell)=> { built.length = 0; map.setVoxel(cell, 1); map.buildChunks(); return built.sort(); };
    assert.deepEqual(set(vec3(5, 5, 5)), [0]);
    assert.deepEqual(set(vec3(15, 5, 5)), [0], 'on the edge, but only air across it');
    assert.deepEqual(set(vec3(16, 6, 6)), [0, 1], 'diagonally beside the last one, whose corner shading it changes');
    built.length = 0;
    map.buildChunks();
    assert.deepEqual(built, [], 'nothing changed, nothing built');
    map.ambientOcclusion = false;
    assert.deepEqual(set(vec3(15, 7, 7)), [0], 'with no corner shading only a block face to face counts');
    assert.deepEqual(set(vec3(15, 6, 6)), [0, 1], 'face to face with the one across the edge');
    map.destroy();
});

// a map with a floor of stone at y 0 across it, placed off the origin, and a body above it
function floorMap()
{
    const map = new VoxelMap(vec3(-8, 2, -8), vec3(16, 8, 16));
    for (let x = 16; x--;)
    for (let z = 16; z--;)
        map.setVoxel(vec3(x, 0, z), 3);
    return map;
}
const step = (frames)=> { for (let i = 0; i < frames; ++i) engineObjectsUpdate(); };

test('a body falls onto a voxel floor and rests on it, grounded every frame', () =>
{
    const map = floorMap(), body = new EngineObject3D(vec3(.5, 8, .5));
    body.size3D = vec3(.8);
    body.setCollision(false, false);
    body.mass = 1;
    render3D.gravity = vec3(0, -.02, 0);
    step(120);
    near(body.pos3D.y, 2 + 1 + .4, 2e-3, 'on the floor top, which is the map corner plus one cell');
    for (let i = 0; i < 30; ++i)
    {
        step(1);
        assert.equal(body.groundObject, map, 'grounded at frame ' + i);
    }
    near(body.pos3D.y, 2 + 1 + .4, 2e-3, 'still there, no sinking');

    // a point with no size, the first person camera's default, rests on it too
    const point = new EngineObject3D(vec3(2.5, 6, 2.5));
    point.size3D = vec3();
    point.setCollision(false, false);
    point.mass = 1;
    step(120);
    near(point.pos3D.y, 3, 2e-3);
    render3D.gravity = vec3();
    body.destroy(); point.destroy(); map.destroy();
});

test('a wall stops a sideways move, a ceiling stops a rise, and collideWithVoxel can let a block through', () =>
{
    const map = floorMap();
    for (let y = 1; y < 4; ++y)
        map.setVoxel(vec3(12, y, 8), 3); // a wall cell at world x 4..5
    map.setVoxel(vec3(8, 3, 4), 3);       // a ceiling cell at world y 5..6 above (0.5, *, -3.5)
    map.setVoxel(vec3(4, 1, 4), 6);       // water on the floor at world (-3.5, 3.5, -3.5)

    const walker = new EngineObject3D(vec3(2.5, 3.5, .5));
    walker.size3D = vec3(1);
    walker.setCollision(false, false);
    walker.mass = 1;
    walker.velocity3D = vec3(.3, 0, 0);
    for (let i = 0; i < 20; ++i) { walker.velocity3D.x = .3; step(1); }
    assert.ok(walker.pos3D.x + .5 <= 4 + 1e-6, 'stopped at the wall, x ' + walker.pos3D.x);

    const jumper = new EngineObject3D(vec3(.5, 3.5, -3.5));
    jumper.size3D = vec3(1);
    jumper.setCollision(false, false);
    jumper.mass = 1;
    jumper.velocity3D = vec3(0, .5, 0);
    step(3);
    assert.ok(jumper.pos3D.y + .5 <= 5 + 1e-6, 'stopped under the ceiling, y ' + jumper.pos3D.y);

    const diver = new EngineObject3D(vec3(-3.5, 7, -3.5));
    diver.size3D = vec3(.8);
    diver.setCollision(false, false);
    diver.mass = 1;
    diver.collideWithVoxel = (type)=> type !== 6; // swims through water
    render3D.gravity = vec3(0, -.02, 0);
    step(150);
    near(diver.pos3D.y, 3 + .4, 2e-3, 'through the water to the floor under it');
    render3D.gravity = vec3();
    walker.destroy(); jumper.destroy(); diver.destroy(); map.destroy();
});

test('a raycast finds the block, the face it came in through and the distance, both ways down each axis', () =>
{
    const map = new VoxelMap(vec3(10, 0, 0), vec3(8));
    map.setVoxel(vec3(4, 4, 4), 3); // world 14..15, 4..5, 4..5
    const cases = [
        [vec3(5, 4.5, 4.5), vec3(1, 0, 0), 9, vec3(-1, 0, 0)],
        [vec3(20, 4.5, 4.5), vec3(-1, 0, 0), 5, vec3(1, 0, 0)],
        [vec3(14.5, 20, 4.5), vec3(0, -1, 0), 15, vec3(0, 1, 0)],
        [vec3(14.5, -3, 4.5), vec3(0, 1, 0), 7, vec3(0, -1, 0)],
        [vec3(14.5, 4.5, 9), vec3(0, 0, -1), 4, vec3(0, 0, 1)],
        [vec3(14.5, 4.5, 1), vec3(0, 0, 1), 3, vec3(0, 0, -1)],
    ];
    for (const [origin, direction, distance, normal] of cases)
    {
        const hit = map.raycast(new Ray3D(origin, direction));
        assert.ok(hit, 'hit from ' + origin);
        near(hit.distance, distance);
        assert.deepEqual([hit.cell.x, hit.cell.y, hit.cell.z, hit.type], [4, 4, 4, 3]);
        assert.deepEqual([hit.normal.x, hit.normal.y, hit.normal.z], [normal.x, normal.y, normal.z]);
    }
    assert.equal(map.raycast(new Ray3D(vec3(5, 4.5, 4.5), vec3(1, 0, 0)), 8), undefined, 'out of reach');
    map.destroy();
});

test('a raycast can look through water, starts inside a block at 0, and a ray with no direction or wide of it misses', () =>
{
    const map = new VoxelMap(vec3(), vec3(8));
    map.setVoxel(vec3(2, 1, 1), 6);
    map.setVoxel(vec3(4, 1, 1), 3);
    const ray = new Ray3D(vec3(0, 1.5, 1.5), vec3(1, 0, 0));
    assert.equal(map.raycast(ray).type, 6);
    assert.equal(map.raycast(ray, Infinity, (type)=> type !== 6).type, 3);
    near(map.raycast(new Ray3D(vec3(4.5, 1.5, 1.5), vec3(0, 1, 0))).distance, 0);
    assert.equal(map.raycast(new Ray3D(vec3(1, 1.5, 1.5), vec3())), undefined);
    assert.equal(map.raycast(new Ray3D(vec3(0, 20, 1.5), vec3(1, 0, 0))), undefined, 'parallel above the map');
    map.destroy();
});

test('render3D.pick lands on a voxel face and on the terrain surface, not their boxes', () =>
{
    const map = new VoxelMap(vec3(), vec3(8));
    map.setVoxel(vec3(3, 0, 3), 3);
    const down = new Ray3D(vec3(3.5, 10, 3.5), vec3(0, -1, 0));
    near(render3D.pick(down, [map]).distance, 9);
    assert.equal(render3D.pick(new Ray3D(vec3(.5, 10, .5), vec3(0, -1, 0)), [map]), undefined, 'empty cells are no hit');
    map.destroy();

    const terrain = new HeightMap([[0, 0], [0, 1]], vec2(4), 2);
    const hit = render3D.pick(new Ray3D(vec3(-1, 10, -1), vec3(0, -1, 0)), [terrain]);
    near(hit.distance, 10 - terrain.getHeight(-1, -1), 1e-9);
    terrain.destroy();
});

test('a FirstPersonCamera3D with jumpSpeed jumps on Space only while it stands on something', async () =>
{
    const { run, handlers } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run(`new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        var map = new VoxelMap(vec3(-4, 0, -4), vec3(8));
        for (let x = 8; x--;) for (let z = 8; z--;) map.setVoxel(vec3(x, 0, z), 3);
        var camera = new FirstPersonCamera3D(vec3(0, 6, 0));
        camera.lockPointer = false; camera.size3D = vec3(.6, 1.6, .6); camera.setCollision(false, false);
        camera.jumpSpeed = .3;`);
    // a step with Space pressed, then the pressed state cleared as inputUpdatePost does in a browser, which headless
    // mode skips, or Space would still read as pressed in the steps after
    const clear = 'for (const device of inputData) for (const i in device) device[i] &= 1;';
    const press = ()=>
    {
        handlers.keydown(keyEvent('Space'));
        run('engineStep();' + clear);
        handlers.keyup(keyEvent('Space'));
        run(clear);
    };
    press(); // in the air, falling
    assert.ok(run('camera.velocity3D.y') < 0, 'no jump in the air');
    run('engineStep(120)');
    assert.equal(run('camera.groundObject === map'), true);
    press();
    assert.ok(run('camera.velocity3D.y') > .2, 'jumped from the ground');
});

test('a point collider at whole number x and z, the first person camera at its spawn, lands on a voxel floor', () =>
{
    const map = floorMap(), point = new EngineObject3D(vec3(0, 5, 0));
    point.size3D = vec3();
    point.setCollision(false, false);
    point.mass = 1;
    render3D.gravity = vec3(0, -.02, 0);
    step(120);
    near(point.pos3D.y, 3, 2e-3);
    render3D.gravity = vec3();
    point.destroy(); map.destroy();
});

test('a body resting on a voxel floor under light gravity is grounded every frame', () =>
{
    const map = floorMap(), body = new EngineObject3D(vec3(.5, 3.5, .5));
    body.setCollision(false, false);
    body.mass = 1;
    render3D.gravity = vec3(0, -.0004, 0);
    step(5);
    for (let i = 0; i < 20; ++i)
    {
        step(1);
        assert.equal(body.groundObject, map, 'grounded at frame ' + i);
    }
    render3D.gravity = vec3();
    body.destroy(); map.destroy();
});

test('walking down a HeightMap slope keeps to the ground, grounded every frame so it can jump', () =>
{
    const terrain = new HeightMap([[1, 0], [1, 0]], vec2(20), 10); // falls .5 a unit toward +x
    const body = new EngineObject3D(vec3(-8, terrain.getHeight(-8, 0) + .5, 0));
    body.setCollision(false, false);
    body.mass = 1;
    render3D.gravity = vec3(0, -.012, 0);
    step(2);
    for (let i = 0; i < 40; ++i)
    {
        body.velocity3D.x = .08;
        step(1);
        assert.equal(body.groundObject, terrain, 'grounded at frame ' + i);
    }
    near(body.pos3D.y, terrain.getHeight(body.pos3D) + .5, 1e-6, 'on the surface');
    render3D.gravity = vec3();
    body.destroy(); terrain.destroy();
});

test('a block set in a body\'s lower half pushes it up onto the block, one at its head leaves it free to walk out', () =>
{
    const map = floorMap(), body = new EngineObject3D(vec3(.5, 3 + .75, .5));
    body.size3D = vec3(.5, 1.5, .5);
    body.setCollision(false, false);
    body.mass = 1;
    render3D.gravity = vec3(0, -.01, 0);
    step(10);
    map.setVoxel(vec3(8, 1, 8), 3); // the cell at its feet, world y 3 to 4
    step(1);
    near(body.pos3D.y, 4 + .75, 2e-3, 'standing on the new block');
    assert.equal(body.groundObject, map);
    step(10);
    near(body.pos3D.y, 4 + .75, 2e-3, 'and resting there');

    map.setVoxel(vec3(8, 3, 8), 3); // at its head, world y 5 to 6, above its middle
    step(10);
    near(body.pos3D.y, 4 + .75, 2e-3, 'not pushed up over it, and not sinking');
    for (let i = 0; i < 30; ++i) { body.velocity3D.x = .1; step(1); }
    assert.ok(body.pos3D.x > 3, 'walked out the way it was going, x ' + body.pos3D.x);
    near(body.pos3D.y, 3 + .75, 2e-3, 'down on the floor once clear');

    const point = new EngineObject3D(vec3(-3.5, 3.5, -3.5)); // a point, the first person camera's default size
    point.size3D = vec3();
    point.setCollision(false, false);
    point.mass = 1;
    step(5);
    map.setVoxel(vec3(4, 1, 4), 3);
    step(1);
    near(point.pos3D.y, 4, 2e-3, 'a point in a new block stands on it');
    render3D.gravity = vec3();
    body.destroy(); point.destroy(); map.destroy();
});

test('a VoxelMap and the child that draws its blending blocks are not things a query near its corner finds', () =>
{
    const map = new VoxelMap(vec3(), vec3(8));
    const found = engineObjectsCollect3D(vec3(.2), 1).filter(o=> o === map || o.parent === map);
    assert.deepEqual(found, []);
    map.destroy();
});

test('a FirstPersonCamera3D puts the camera eyeHeight above its position, toward the top of its body', () =>
{
    const camera = new FirstPersonCamera3D(vec3(1, 2, 3));
    camera.lockPointer = false;
    camera.eyeHeight = .6;
    camera.update();
    const eye = render3D.camera.pos;
    assert.deepEqual([eye.x, eye.y, eye.z].map(v=> Math.round(v * 1e6) / 1e6), [1, 2.6, 3]);
    camera.destroy();
});

test('a body stuck in a block moves out of it but not into new ones, through no wall and up no ceiling', () =>
{
    const map = floorMap();
    for (let x = 10; x < 14; ++x) // a wall 4 blocks thick and tall, world x 2 to 6, y 3 to 7
    for (let y = 1; y < 5; ++y)
    for (let z = 7; z < 10; ++z)
        map.setVoxel(vec3(x, y, z), 3);
    const body = new EngineObject3D(vec3(1.5, 3.75, .5));
    body.size3D = vec3(.5, 1.5, .5);
    body.setCollision(false, false);
    body.mass = 1;
    render3D.gravity = vec3(0, -.01, 0);
    step(10);
    map.setVoxel(vec3(9, 2, 8), 3); // at its head, world x 1 to 2, y 4 to 5
    for (let i = 0; i < 60; ++i) { body.velocity3D.x = .1; step(1); }
    assert.ok(body.pos3D.x + .25 <= 2 + 1e-6, 'stopped at the wall, x ' + body.pos3D.x);
    near(body.pos3D.y, 3.75, 2e-3, 'still on the floor');

    const climber = new EngineObject3D(vec3(4, 3.75, .5)); // made inside the wall
    climber.size3D = vec3(.5, 1.5, .5);
    climber.setCollision(false, false);
    climber.mass = 1;
    let highest = 0; // it may move within the cells it is in, its top up to 5, but not into the ones above
    for (let i = 0; i < 60; ++i) { climber.groundObject && (climber.velocity3D.y = .2); step(1); highest = Math.max(highest, climber.pos3D.y); }
    assert.ok(highest <= 5 - .75 + 1e-6, 'did not jump up through the wall, y ' + highest);
    render3D.gravity = vec3();
    body.destroy(); climber.destroy(); map.destroy();
});
