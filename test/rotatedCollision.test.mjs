import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, EngineObject3D, engineObjects, engineObjectsUpdate, collideBoxBox3D, vec3, PI }
    from '../dist/littlejs.esm.js';

// 3D solid collision follows rotation: a turned box collides as the box you see, and a push within the upper
// object's groundAngle of straight up means it stands there, lifted straight off so it does not creep down a slope

new Render3DPlugin;
const degrees = (d)=> d * PI / 180;
const near = (a, b, tolerance=1e-6, message)=> assert.ok(Math.abs(a - b) < tolerance, message ?? `${a} is not ${b}`);

beforeEach(()=>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    render3D.gravity = vec3(0, -.01, 0);
});

// a solid box, static unless given a mass
function box(pos, size, rotation, mass=0)
{
    const o = new EngineObject3D(pos);
    o.size3D = size;
    rotation && (o.rotation3D = rotation);
    o.setCollision();
    o.mass = mass;
    return o;
}
const step = (frames=1)=> { for (let i = frames; i--;) engineObjectsUpdate(); };
const touching = (a, b)=> collideBoxBox3D(a.pos3D, a.size3D, b.pos3D, b.size3D, a.rotation3D, b.rotation3D);

test('a box moving into a turned wall is turned aside along the wall\'s face, and never passes into it', ()=>
{
    render3D.gravity = vec3();
    const wall = box(vec3(), vec3(1, 4, 6), vec3(0, degrees(45), 0));
    const mover = box(vec3(-3, 0, 0), vec3(1), undefined, 1);
    mover.velocity3D = vec3(.05, 0, 0);
    for (let i = 0; i < 120; ++i)
    {
        step();
        const push = touching(mover, wall);
        assert.ok(!push || push.length() < .06, 'no deeper than one frame of movement');
    }
    assert.ok(Math.abs(mover.pos3D.z) > .1, 'slid along the slanted face, ' + mover.pos3D.z);
});

test('a box dropped on a 20 degree ramp comes to rest on it and stays, standing on it', ()=>
{
    const ramp = box(vec3(), vec3(6, 1, 6), vec3(0, 0, degrees(20)));
    const crate = box(vec3(0, 2.5, 0), vec3(1), undefined, 1);
    step(200);
    assert.equal(crate.groundObject, ramp);
    const rested = crate.pos3D.copy();
    step(100);
    assert.equal(crate.groundObject, ramp);
    near(crate.pos3D.x, rested.x, 1e-4, 'no creeping down the slope');
    near(crate.pos3D.y, rested.y, 1e-4);
    const push = touching(crate, ramp);
    assert.ok(!push || push.length() < .02, 'resting on the surface');
});

test('on a 60 degree slope a box slides down, unless its groundAngle is steeper', ()=>
{
    const slope = box(vec3(), vec3(8, 1, 6), vec3(0, 0, degrees(60)));
    const slider = box(vec3(0, 3, 0), vec3(1), undefined, 1);
    step(120);
    assert.notEqual(slider.groundObject, slope, 'too steep to stand on');
    assert.ok(Math.abs(slider.pos3D.x) > .5, 'slid off along it, ' + slider.pos3D.x);

    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const steep = box(vec3(), vec3(8, 1, 6), vec3(0, 0, degrees(60)));
    const climber = box(vec3(0, 3, 0), vec3(1), undefined, 1);
    climber.groundAngle = degrees(70);
    step(200);
    assert.equal(climber.groundObject, steep);
    const rested = climber.pos3D.copy();
    step(60);
    near(climber.pos3D.x, rested.x, 1e-4, 'stands there');
});

test('a box on an upright floor lands as before, and stands on it', ()=>
{
    const floor = box(vec3(), vec3(10, 1, 10));
    const crate = box(vec3(0, 3, 0), vec3(1), undefined, 1);
    step(300);
    near(crate.pos3D.y, 1, 1e-9, 'on the floor, as the upright push always put it');
    near(crate.velocity3D.y, 0, 1e-9);
    assert.equal(crate.groundObject, floor);
});

test('a box on a box stands on that one', ()=>
{
    const floor = box(vec3(), vec3(10, 1, 10));
    const bottom = box(vec3(0, 3, 0), vec3(1), undefined, 1), top = box(vec3(0, 5, 0), vec3(1), undefined, 1);
    step(300);
    assert.equal(bottom.groundObject, floor);
    assert.equal(top.groundObject, bottom);
    near(top.pos3D.y - bottom.pos3D.y, 1, .02);
});

test('a groundObject goes when the object leaves what it stood on', ()=>
{
    const floor = box(vec3(), vec3(10, 1, 10));
    const crate = box(vec3(0, 1, 0), vec3(1), undefined, 1);
    step(5);
    assert.equal(crate.groundObject, floor);
    crate.velocity3D = vec3(0, .3, 0);
    step(2);
    assert.equal(crate.groundObject, undefined);
});
