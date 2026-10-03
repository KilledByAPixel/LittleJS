import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The seventh pass of 2026-10-03: a press outside the canvas, a second confirm dialog.

// a canvas from x 300 to 700 and y 0 to 400 in the window, letterboxed, the bars around it outside it
function letterboxed()
{
    const engine = loadEngine({ window: { ontouchstart: null } }); // a window that takes touch
    engine.run(`setHeadlessMode(true);
        mainCanvas = { getBoundingClientRect: ()=> ({ left: 300, top: 0, right: 700, bottom: 400 }) };`);
    return engine;
}
const target = {};

test('a click in the bars around the canvas presses nothing, one on it presses', ()=>
{
    const { run, handlers } = letterboxed();
    handlers.mousedown({ button: 0, x: 900, y: 200, target, cancelable: false });
    assert.equal(run('mouseWasPressed(0)'), false, 'right of the canvas');
    handlers.mouseup?.({ button: 0, x: 900, y: 200, target, cancelable: false });
    run('inputUpdatePost()');
    handlers.mousedown({ button: 0, x: 500, y: 200, target, cancelable: false });
    assert.equal(run('mouseWasPressed(0)'), true, 'on it');
});

test('a tap in the bars around the canvas presses nothing, one on it presses', ()=>
{
    const { run, handlers } = letterboxed();
    const touch = (type, clientX)=>
    {
        const t = { clientX, clientY: 200, identifier: 1, target };
        handlers[type]({ type, touches: type == 'touchend' ? [] : [t], changedTouches: [t], cancelable: false, target });
    };
    touch('touchstart', 50);
    assert.equal(run('mouseIsDown(0)'), false, 'left of the canvas');
    touch('touchend', 50);
    run('inputUpdatePost()');
    touch('touchstart', 500);
    assert.equal(run('mouseWasPressed(0)'), true, 'on it');
});

test('a second confirm dialog while one is open is the one already open, in a release build', ()=>
{
    const { run } = loadEngine({}, '', 'littlejs.release.js');
    run(`setHeadlessMode(true); var ui = new UISystemPlugin; ui.navigationDirection = 1;
        var first = ui.showConfirmDialog('Quit?'), second = ui.showConfirmDialog('Really?');`);
    assert.equal(run('first === second'), true);
    run('first.destroy();');
    assert.deepEqual([run('ui.navigationDirection'), run('ui.confirmDialog')], [1, undefined]);
});
