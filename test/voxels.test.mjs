import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, HeightMap, EngineObject3D, Ray3D, vec2, vec3, engineObjectsUpdate }
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
