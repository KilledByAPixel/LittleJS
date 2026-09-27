import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, HeightMap, VoxelMap, EngineObject3D, Ray3D, TextureInfo, TileInfo, vec2, vec3,
    engineObjectsUpdate }
    from '../dist/littlejs.esm.js';

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

test('setting a block builds only its chunk, and the chunk beside it when it is on the edge', () =>
{
    const map = new VoxelMap(vec3(), vec3(40, 16, 16)), built = [];
    const buildChunk = map.buildChunk.bind(map);
    map.buildChunk = (index)=> { built.push(index); buildChunk(index); };
    map.setVoxel(vec3(5, 5, 5), 1);
    map.buildChunks();
    assert.deepEqual(built, [0]);
    built.length = 0;
    map.setVoxel(vec3(15, 5, 5), 1);
    map.buildChunks();
    assert.deepEqual(built.sort(), [0, 1]);
    built.length = 0;
    map.buildChunks();
    assert.deepEqual(built, [], 'nothing changed, nothing built');
    map.destroy();
});
