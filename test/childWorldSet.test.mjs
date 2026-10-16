import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A child's pos and angle are placed from its parent each frame, and setting them used to do nothing, a common
// beginner trap: now a pos or angle the game sets on a child is kept, made its new localPos or localAngle, so it
// stays where it was put and moves with its parent from there

const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} is not ${b}`);

// a fresh engine whose console.warn is kept, with a turned parent and a child placed from it
function engine(file)
{
    const said = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> said.push(a[0]) } }, '', file);
    run(`var parent = new EngineObject(vec2(2, 3), vec2(1), undefined, .4), child = new EngineObject;
        parent.addChild(child, vec2(1, 0), .5);`);
    return { run, said };
}

test('a child placed only through its parent and its local transform keeps the local values it was given', () =>
{
    const { run } = engine();
    const [x, y, angle, ex, ey, ea] = run(`let ey = 0, ea = .5;
        for (let i = 0; i < 5; ++i)
        {
            parent.pos.x += .3, parent.angle += .2, parent.mirror = i % 2 == 1;
            child.localPos.y += .1, child.localAngle -= .1;
            ey += .1, ea -= .1;
            engineObjectsUpdate();
        }
        [child.localPos.x, child.localPos.y, child.localAngle, 1, ey, ea]`);
    assert.equal(x, ex);
    assert.equal(y, ey);
    assert.equal(angle, ea);
});

test('a child whose angle is set in its own update keeps it, then turns with its parent, and nothing is said', () =>
{
    const { run, said } = engine();
    run(`child.update = function() { if (!this.turned) this.angle = 2, this.turned = true; };`);
    run(`engineObjectsUpdate();`);
    near(run(`child.angle`), 2, 'the angle set');
    near(run(`child.localAngle`), 2 - .4, 'its angle from the parent');
    run(`parent.angle += .3; engineObjectsUpdate();`);
    near(run(`child.angle`), 2.3, 'turned with the parent');
    assert.deepEqual(said, []);
});

test('a child whose pos is changed in place keeps it, then moves with its parent', () =>
{
    const { run } = engine();
    const x = run(`child.pos.x`), y = run(`child.pos.y`);
    run(`child.pos.x += 1; engineObjectsUpdate();`);
    near(run(`child.pos.x`), x + 1, 'the x set');
    near(run(`child.pos.y`), y, 'y left alone');
    run(`parent.pos.x += 2; engineObjectsUpdate();`);
    near(run(`child.pos.x`), x + 3, 'moved with the parent');
});

test('a child pos set before the frame moves with what its parent moves in that frame', () =>
{
    const { run } = engine();
    run(`parent.velocity = vec2(.5, 0); child.pos.set(10, 10); engineObjectsUpdate();`);
    near(run(`child.pos.x`), 10.5, 'x');
    near(run(`child.pos.y`), 10, 'y');
});

test('a child set under a mirrored parent stays where it was put and moves with it', () =>
{
    const { run } = engine();
    run(`parent.mirror = true; engineObjectsUpdate();
        child.pos.set(5, 5); child.angle = 1; engineObjectsUpdate();`);
    near(run(`child.pos.x`), 5, 'x');
    near(run(`child.pos.y`), 5, 'y');
    near(run(`child.angle`), 1, 'angle');
    run(`parent.pos.x += 1; engineObjectsUpdate();`);
    near(run(`child.pos.x`), 6, 'moved with the parent');
    near(run(`child.angle`), 1, 'the parent did not turn');
});

test('a child whose angle alone is set keeps its localPos exactly', () =>
{
    const { run } = engine();
    run(`child.angle = 3; engineObjectsUpdate();`);
    assert.deepEqual([...run(`[child.localPos.x, child.localPos.y]`)], [1, 0]);
});

test('a child moved while detached takes the local transform addChild gives it, and attach keeps it in place', () =>
{
    const { run } = engine();
    run(`parent.removeChild(child); child.pos.set(9, 9); child.angle = 3;
        parent.addChild(child, vec2(0, 1)); engineObjectsUpdate();`);
    assert.deepEqual([...run(`[child.localPos.x, child.localPos.y, child.localAngle]`)], [0, 1, 0]);
    run(`parent.removeChild(child); child.pos.set(9, 9); child.angle = 3;
        const other = new EngineObject(vec2(-4, 0));
        other.attach(child); engineObjectsUpdate();`);
    near(run(`child.pos.x`), 9, 'attach x');
    near(run(`child.pos.y`), 9, 'attach y');
    near(run(`child.angle`), 3, 'attach angle');
});

test('the release build keeps a set angle too', () =>
{
    const { run } = engine('littlejs.release.js');
    run(`child.angle = 2; engineObjectsUpdate();`);
    near(run(`child.angle`), 2, 'the angle set');
});
