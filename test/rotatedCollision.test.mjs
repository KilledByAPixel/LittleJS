import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, EngineObject3D, engineObjects, engineObjectsUpdate, engineObjectsCollect3D,
    collideBoxBox3D, TextureInfo, buildBox, vec3, PI }
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

// the 2D physics settings, in 3D

test('angleDamping slows angleVelocity3D each frame, and damping slows an object with no mass', ()=>
{
    render3D.gravity = vec3();
    const spinner = new EngineObject3D(vec3());
    spinner.angleVelocity3D = vec3(0, .1, 0);
    spinner.angleDamping = .9;
    spinner.velocity3D = vec3(.1, 0, 0);
    spinner.damping = .9;
    step();
    near(spinner.angleVelocity3D.y, .09);
    near(spinner.rotation3D.y, .09, 1e-9, 'damped, then turned by it, as in 2D');
    near(spinner.velocity3D.x, .09);
});

test('clampSpeed keeps each axis of velocity3D within objectMaxSpeed, off it lets it go', ()=>
{
    render3D.gravity = vec3();
    const fast = box(vec3(0, 50, 0), vec3(1), undefined, 1);
    fast.velocity3D = vec3(3, -5, 2);
    step();
    assert.deepEqual([fast.velocity3D.x, fast.velocity3D.y, fast.velocity3D.z], [1, -1, 1]);
    fast.clampSpeed = false;
    fast.velocity3D = vec3(3, -5, 2);
    step();
    assert.deepEqual([fast.velocity3D.x, fast.velocity3D.y, fast.velocity3D.z], [3, -5, 2]);
});

test('a box sliding on a floor slows by friction, the less grippy of the two', ()=>
{
    const floor = box(vec3(), vec3(20, 1, 20));
    const slider = box(vec3(0, 1, 0), vec3(1), undefined, 1);
    step(3);
    assert.equal(slider.groundObject, floor);
    slider.velocity3D = vec3(.1, 0, .05);
    step();
    near(slider.velocity3D.x, .08, 1e-9, 'kept by .8, the default friction');
    near(slider.velocity3D.z, .04, 1e-9);
    slider.friction = 1; // ice on its side, the floor's .8 is grippier, and the less grippy wins
    step();
    near(slider.velocity3D.x, .08, 1e-9);
});

test('a box on a moving platform is carried along with it', ()=>
{
    const platform = box(vec3(), vec3(6, 1, 6));
    platform.velocity3D = vec3(.02, 0, 0); // no mass, it moves by its velocity and nothing moves it
    const rider = box(vec3(0, 1, 0), vec3(1), undefined, 1);
    step(120);
    assert.equal(rider.groundObject, platform);
    near(rider.velocity3D.x, .02, 1e-4, 'at the platform\'s speed');
    // it starts at rest, lands, and catches up by friction, .12 behind by then, and keeps its place from there
    near(rider.pos3D.x - platform.pos3D.x, -.12, .005, 'still over the middle of it');
    const lag = rider.pos3D.x - platform.pos3D.x;
    step(60);
    near(rider.pos3D.x - platform.pos3D.x, lag, 1e-9, 'carried, not slipping');
});

// queries

test('collect finds a turned object by the box you see, not the upright box around it', ()=>
{
    const diamond = box(vec3(), vec3(2), vec3(0, degrees(45), 0)); // corners on X and Z at 1.414
    const collect = (pos, size)=> engineObjectsCollect3D(pos, size, [diamond]).length;
    assert.equal(collect(vec3(.95, 0, .95), vec3(.1)), 0, 'in the upright corner, outside the turned box');
    assert.equal(collect(vec3(1.3, 0, 0), vec3(.1)), 1, 'past the upright face, inside the turned box');
    assert.equal(collect(vec3(.95, 0, .95), .1), 0, 'a sphere the same');
    assert.equal(collect(vec3(1.3, 0, 0), .1), 1);
    assert.equal(collect(vec3(1.3, 0, 0), 0), 1, 'a point too');
});

// the final review's fixes

// a ball, static unless given a mass
function ball(pos, size, mass=0)
{
    const o = box(pos, vec3(size), undefined, mass);
    o.collideAsSphere3D = true;
    return o;
}

test('a ball dropped off center on a ball rolls off it, a sphere is nothing to stand on', ()=>
{
    ball(vec3(), 1);
    const dropped = ball(vec3(.15, 2, 0), 1, 1);
    step(300);
    assert.ok(dropped.pos3D.y < .5, 'fell past it, ' + dropped.pos3D.y);
});

test('a ball over the edge of a box rolls off, the edge is nothing to stand on', ()=>
{
    box(vec3(), vec3(2));
    const dropped = ball(vec3(1.2, 3, 0), 1, 1);
    step(300);
    assert.ok(dropped.pos3D.y < 1, 'fell off the edge, ' + dropped.pos3D.y);
});

test('a crate on a ramp still stands, a flat face is something to stand on', ()=>
{
    const ramp = box(vec3(), vec3(6, 1, 6), vec3(0, 0, degrees(20)));
    const crate = box(vec3(0, 2.5, 0), vec3(1), undefined, 1);
    step(200);
    assert.equal(crate.groundObject, ramp);
});

test('a box rising into a sloped static ceiling slides along it, a static object stands on nothing', ()=>
{
    render3D.gravity = vec3();
    const ceiling = box(vec3(0, 3, 0), vec3(6, 1, 6), vec3(0, 0, degrees(30)));
    const riser = box(vec3(0, 1, 0), vec3(1), undefined, 1);
    riser.velocity3D = vec3(0, .05, 0);
    step(100);
    assert.equal(ceiling.groundObject, undefined);
    assert.equal(riser.groundObject, undefined);
    assert.ok(Math.abs(riser.pos3D.x) > .2, 'slid along the ceiling, ' + riser.pos3D.x);
});

test('a push along a level wall never counts as standing, and a groundAngle of 90 degrees asserts', ()=>
{
    render3D.gravity = vec3();
    box(vec3(3, 0, 0), vec3(1, 6, 6));
    const mover = box(vec3(1, 0, 0), vec3(1), undefined, 1);
    mover.groundAngle = degrees(89);
    mover.velocity3D = vec3(.1, 0, 0);
    step(30);
    assert.ok(Number.isFinite(mover.pos3D.y) && mover.pos3D.y === 0, 'stopped at the wall, not thrown');
    mover.groundAngle = PI / 2;
    assert.throws(()=> step(), 'a debug assert');
});

test('a push that is straight up already is used as it is, so an upright stack moves as it always did', ()=>
{
    render3D.gravity = vec3();
    // a sinking that rounds differently through the straight up turn, y * y / y is not always y
    // the push is the overlap, (1 + 1) / 2 less how far apart the centers are; find one where the rounding shows
    const overlap = (s)=> 1 - Math.abs(1 - s), landed = (s, y)=> (1 - s) + y;
    let sink = .01;
    while (landed(sink, overlap(sink)) === landed(sink, overlap(sink) ** 2 / overlap(sink))) sink += .000137;
    const floor = box(vec3(), vec3(10, 1, 10));
    const crate = box(vec3(0, 1 - sink, 0), vec3(1), undefined, 1);
    const expected = crate.pos3D.y + collideBoxBox3D(crate.pos3D, crate.size3D, floor.pos3D, floor.size3D).y;
    step();
    assert.equal(crate.pos3D.y, expected);
});

test('a sync2D object\'s velocity3D and angleVelocity3D are left to it, not damped', ()=>
{
    render3D.gravity = vec3();
    const synced = new EngineObject3D(vec3());
    synced.sync2D = true;
    synced.damping = synced.angleDamping = .5;
    synced.velocity3D = vec3(0, 0, .1);
    synced.angleVelocity3D = vec3(.1, 0, 0);
    step();
    near(synced.velocity3D.z, .1, 1e-12);
    near(synced.angleVelocity3D.x, .1, 1e-12);
});

test('a sprite collides and is collected as its upright box, its rotation turns how it faces', ()=>
{
    const sprite = new EngineObject3D(vec3(), undefined, TextureInfo ? new TextureInfo(undefined, false) : undefined);
    sprite.size3D = vec3(2);
    sprite.rotation3D = vec3(0, 0, degrees(45));
    assert.equal(engineObjectsCollect3D(vec3(.95, .95, 0), vec3(.1), [sprite]).length, 1, 'in its upright corner');
});

test('collect finds a turned child of an unevenly scaled parent by a sphere inside it, sheared as it is', ()=>
{
    const parent = new EngineObject3D(vec3());
    parent.scale3D = vec3(4, 1, 1);
    const child = new EngineObject3D(vec3(), buildBox(vec3(2)));
    child.size3D = vec3(2);
    child.rotation3D.z = PI / 4;
    parent.addChild(child);
    const inside = child.getMatrix().transformPoint(vec3(.9, -.9, 0));
    assert.equal(engineObjectsCollect3D(inside, 0, [child]).length, 1, 'a point');
    assert.equal(engineObjectsCollect3D(inside, .2, [child]).length, 1, 'a sphere around the same point');
    assert.equal(engineObjectsCollect3D(inside, vec3(.2), [child]).length, 1, 'a box there');
    assert.equal(engineObjectsCollect3D(vec3(20, 0, 0), .2, [child]).length, 0, 'far off it is not collected');
    parent.destroy();
});
