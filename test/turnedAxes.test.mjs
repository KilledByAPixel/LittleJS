import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a turned solid's axes are worked out once and kept until it turns again, not for every pair it is tested against,
// and collect reads a turned object's axes off its world matrix; counted, not timed

function setup()
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3();
        var axesBuilt = 0, rotationsRead = 0;
        const boxAxes = boxAxes3D, getRotation = Matrix4.prototype.getRotation;
        boxAxes3D = (rotation)=> (++axesBuilt, boxAxes(rotation));
        Matrix4.prototype.getRotation = function() { ++rotationsRead; return getRotation.call(this); };
        var solid = (pos, rotation, mass=0)=>
        {
            const o = new EngineObject3D(pos);
            o.size3D = vec3(1); o.rotation3D = rotation; o.setCollision(); o.mass = mass;
            return o;
        };`);
    return run;
}

test('a turned solid touching others works out its axes once, and again only when it turns', ()=>
{
    const run = setup();
    run(`var wall = solid(vec3(), vec3(0, .5, 0));
        for (let i = 0; i < 4; ++i) solid(vec3(.6 + i * .1, .3 * i, 0), vec3(0, .2 * i, 0), 1);
        engineObjectsUpdate();
        var first = axesBuilt;
        for (let i = 10; i--;) engineObjectsUpdate();`);
    assert.ok(run('first') > 0 && run('first') <= 4, 'once for each turned one, ' + run('first'));
    assert.equal(run('axesBuilt'), run('first'), 'none again while they keep their turn');
    run('wall.rotation3D.y += .1; engineObjectsUpdate()');
    assert.equal(run('axesBuilt'), run('first') + 1, 'the one that turned, again');
});

test('collect reads a turned object\'s axes off its world matrix, with no rotation worked out in between', ()=>
{
    const run = setup();
    run(`var turned = solid(vec3(), vec3(0, .7, .2));
        engineObjectsCollect3D(vec3(.3, 0, 0), vec3(.2), [turned]);
        engineObjectsCollect3D(vec3(.3, 0, 0), .2, [turned]);`);
    assert.equal(run('rotationsRead'), 0);
    assert.equal(run('axesBuilt'), 0);
    assert.equal(run('engineObjectsCollect3D(vec3(.3, 0, 0), vec3(.2), [turned]).length'), 1, 'and still finds it');
});
