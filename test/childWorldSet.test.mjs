import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A child's pos and angle are placed from its parent each frame, so setting them did nothing and said nothing, a
// common beginner trap: a debug build now warns once, naming localPos or localAngle

// a fresh engine whose console.warn is kept
function engine(file)
{
    const said = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> said.push(a[0]) } }, '', file);
    run(`var parent = new EngineObject(vec2(2, 3)), child = new EngineObject;
        parent.addChild(child, vec2(1, 0), .5);`);
    return { run, said };
}

test('a child placed only through its parent and its local transform warns of nothing', () =>
{
    const { run, said } = engine();
    run(`for (let i = 0; i < 5; ++i)
        {
            parent.pos.x += .3, parent.angle += .2, parent.mirror = i % 2 == 1;
            child.localPos.y += .1, child.localAngle -= .1;
            engineObjectsUpdate();
        }`);
    assert.deepEqual(said, []);
});

test('a child whose angle is set warns once, naming localAngle, and is still placed from its parent', () =>
{
    const { run, said } = engine();
    run(`child.update = function() { this.angle = 2; };`);
    run(`engineObjectsUpdate(); engineObjectsUpdate(); engineObjectsUpdate();`);
    assert.equal(said.length, 1);
    assert.match(said[0], /angle was set/);
    assert.match(said[0], /localAngle/);
    assert.equal(run(`child.angle`), run(`parent.angle + child.localAngle`));
});

test('a child whose pos is changed in place warns, naming localPos', () =>
{
    const { run, said } = engine();
    run(`child.pos.x += 1; engineObjectsUpdate();`);
    assert.equal(said.length, 1);
    assert.match(said[0], /localPos/);
});

test('a child moved while detached and attached again warns of nothing', () =>
{
    const { run, said } = engine();
    run(`parent.removeChild(child); child.pos.set(9, 9); child.angle = 3;
        parent.addChild(child, vec2(0, 1)); engineObjectsUpdate();
        const other = new EngineObject(vec2(-4, 0));
        other.attach(child); engineObjectsUpdate();`);
    assert.deepEqual(said, []);
});

test('the release build does not check', () =>
{
    const { run, said } = engine('littlejs.release.js');
    run(`child.angle = 2; engineObjectsUpdate();`);
    assert.deepEqual(said, []);
});
