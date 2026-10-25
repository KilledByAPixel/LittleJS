import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a game that bends the picture after it is drawn, like the post process curve, bends the mouse the same way, so
// it points at what is drawn under it; the engine's canvas here is 1000 pixels square at the origin

const engine = ()=>
{
    const { run, handlers } = loadEngine();
    run(`mainCanvasSize = vec2(1000, 1000);`);
    const move = (x, y)=> { handlers.mousemove({x, y, button: 0}); return JSON.parse(run(`JSON.stringify(mousePosScreen)`)); };
    return { run, move };
};

test('with no transform the mouse is where the event is', () =>
{
    const { run, move } = engine();
    assert.equal(run(`mouseScreenTransform`), undefined);
    assert.deepEqual(move(750, 500), {x: 750, y: 500});
});

test('a transform given bends every mouse event once', () =>
{
    const { run, move } = engine();
    run(`setMouseScreenTransform((pos)=> pos.scale(.5));`);
    assert.deepEqual(move(750, 500), {x: 375, y: 250});
    assert.deepEqual(move(750, 500), {x: 375, y: 250}, 'the same event the same place, not bent again');
    run(`setMouseScreenTransform();`);
    assert.deepEqual(move(750, 500), {x: 750, y: 500}, 'and taken off again');
});

test('postProcessCurveMouse bends as postProcessCurve does: the middle stays, the rest is pushed out', () =>
{
    const { run, move } = engine();
    run(`setMouseScreenTransform(postProcessCurveMouse(.1));`);
    assert.deepEqual(move(500, 500), {x: 500, y: 500});
    const bent = move(750, 500); // half way out: 1 + .1 * .25 further, 756.25
    assert.ok(Math.abs(bent.x - 756.25) < 1e-9 && bent.y === 500, JSON.stringify(bent));
});
