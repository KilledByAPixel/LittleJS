import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject, EngineObject3D, Render3DPlugin, render3D, engineObjects, engineObjectsUpdate, objectMaxSpeed,
    vec2, vec3 } from '../dist/littlejs.esm.js';

// clampSpeed keeps what collides from moving farther in a frame than a thin wall is thick; something that does not
// collide has nothing to pass through, so it moves as fast as it is told, in 2D and in 3D

new Render3DPlugin;
render3D.gravity = vec3();
const clear = ()=> { for (const o of engineObjects) o.destroy(); engineObjects.length = 0; };

test('a 2D object that collides is held to objectMaxSpeed, one that does not moves at its speed', ()=>
{
    clear();
    const free = new EngineObject(vec2(), vec2(1));
    free.mass = 0;
    free.velocity = vec2(3, -4);
    const solid = new EngineObject(vec2(0, 50), vec2(1));
    solid.setCollision();
    solid.velocity = vec2(3, -4);
    const platform = new EngineObject(vec2(0, -50), vec2(1));
    platform.setCollision(true, true);
    platform.mass = 0; // moves by its velocity and pushes what it meets, so it is held too
    platform.velocity = vec2(3, 0);
    engineObjectsUpdate();
    assert.deepEqual([free.velocity.x, free.velocity.y], [3, -4], 'not held');
    assert.equal(free.pos.x, 3);
    assert.equal(solid.velocity.x, objectMaxSpeed);
    assert.equal(platform.velocity.x, objectMaxSpeed);
    clear();
});

test('a 2D object that only collides with tiles is held while it has a mass, which tile collision needs', ()=>
{
    clear();
    const faller = new EngineObject(vec2(), vec2(1));
    faller.setCollision(false, false, true);
    faller.velocity = vec2(0, -3);
    const drifter = new EngineObject(vec2(10, 0), vec2(1));
    drifter.setCollision(false, false, true);
    drifter.mass = 0;
    drifter.velocity = vec2(0, -3);
    engineObjectsUpdate();
    assert.ok(faller.velocity.y >= -objectMaxSpeed - .1, 'held, ' + faller.velocity.y);
    assert.equal(drifter.velocity.y, -3, 'no mass, no tile collision, not held');
    clear();
});

test('a 3D object that does not collide moves as fast as it is told', ()=>
{
    clear();
    const free = new EngineObject3D(vec3());
    free.velocity3D = vec3(3, -5, 2);
    engineObjectsUpdate();
    assert.deepEqual([free.velocity3D.x, free.velocity3D.y, free.velocity3D.z], [3, -5, 2]);
    assert.equal(free.pos3D.x, 3);
    clear();
});
