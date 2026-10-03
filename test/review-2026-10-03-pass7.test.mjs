import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The seventh pass of 2026-10-03: a press outside the canvas, a second confirm dialog, a slider let go as it moves.

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

test('a slider let go in the frame it moves takes the last place, as one let go a frame later does', async ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    run('new UISystemPlugin');
    // pressed in its middle, moved right, then moved again, let go in that frame or the next
    const slide = (sameFrame)=> run(`{
        const slider = new UISlider(vec2(), vec2(400, 50)); engineStep();
        const at = (x, state)=> { mousePosScreen = slider.nativePos.add(vec2(x - 500, 0)); inputData[0][0] = state;
            engineStep(); };
        at(500, 3); at(560, 1); at(620, ${sameFrame} ? 4 : 1); ${sameFrame} || at(620, 4); at(620, 0);
        const value = slider.value; slider.destroy(); engineStep(); value; }`);
    const later = slide(false);
    assert.ok(later > .6, 'a value past the middle, ' + later);
    assert.equal(slide(true), later);
});

// a standard gamepad of some buttons, none held
const pad = (buttons, axes=[0, 0, 0, 0])=> ({ mapping: 'standard', axes,
    buttons: Array.from({length: buttons}, ()=> ({pressed: false, value: 0})) });

test('a gamepad of fewer buttons put in the same slot holds none of the last one\'s', () =>
{
    const pads = [pad(17)];
    const { run, context } = loadEngine({ navigator: { getGamepads: ()=> pads } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v; // no camera here
    const tick = ()=> run('inputUpdate(); inputUpdatePost();');
    pads[0].buttons[12] = { pressed: true, value: 1 };
    tick(); tick();
    assert.equal(run('gamepadIsDown(12)'), true);
    pads[0] = pad(4);
    tick(); tick();
    assert.equal(run('gamepadIsDown(12)'), false);
});

test('a gamepad axis that reads NaN is a centered stick, not a failed assert', () =>
{
    const { run, context } = loadEngine({ navigator: { getGamepads: ()=> [pad(17, [NaN, .5, 0, 0])] } });
    context.screenToWorld = context.screenToWorldDelta = (v)=> v;
    run('inputUpdate(); inputUpdatePost();');
    assert.equal(run('gamepadStick(0).x'), 0);
});

test('a text input takes a keydown with no key, as autofill sends, and types nothing', () =>
{
    const { run } = loadEngine();
    run(`setHeadlessMode(true); new UISystemPlugin; var input = new UITextInput(vec2(), vec2(200, 50), 'ab');
        input.onKeyDown({ code: '' });`);
    assert.equal(run('input.text'), 'ab');
});
