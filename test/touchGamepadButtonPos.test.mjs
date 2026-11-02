import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// touchGamepadButtonPos: where a touch gamepad button is drawn, in screen space, for a game's own icon over it

// an engine with a touch gamepad overlay standing in for the one a touch device makes: its stage inset 10 and 20
// pixels by the safe area, and button 0 drawn at 900, 880 in it with a radius of 25; the canvas fills the
// window at one screen pixel a CSS pixel
function engine()
{
    const { run } = loadEngine();
    run(`setTouchGamepadEnable(true);
        touchGamepadOverlay = { style: { opacity: '0.3', display: '' } };
        touchGamepadStage = { getBoundingClientRect: ()=> ({ left: 10, top: 20 }) };
        touchGamepadSvgEls = { face: [{ getAttribute: (k)=> ({ cx: '900', cy: '880', r: '25' })[k] }], thumb: [] };`);
    return run;
}

test('a button\'s center, diameter and the gamepad\'s alpha, in screen space through the safe area', () =>
{
    const run = engine();
    assert.deepEqual(JSON.parse(run('const b = touchGamepadButtonPos(0); JSON.stringify([b.pos.x, b.pos.y, b.size, b.alpha])')), [910, 900, 50, .3]);
});

test('undefined for a button not drawn, and while the touch gamepad is off or hidden', () =>
{
    const run = engine();
    assert.equal(run('touchGamepadButtonPos(1)'), undefined);
    run('touchGamepadOverlay.style.display = "none"');
    assert.equal(run('touchGamepadButtonPos(0)'), undefined, 'hidden');
    run('touchGamepadOverlay.style.display = ""; setTouchGamepadEnable(false)');
    assert.equal(run('touchGamepadButtonPos(0)'), undefined, 'off');
});

test('it follows the canvas scale and setMouseScreenTransform, as a touch on it would land', () =>
{
    const run = engine();
    run('mainCanvasSize = vec2(500)'); // the canvas drawn at half the pixels it shows across
    assert.deepEqual(JSON.parse(run('const b = touchGamepadButtonPos(0); JSON.stringify([b.pos.x, b.pos.y, b.size])')), [455, 450, 25]);
    run('mainCanvasSize = vec2(1000); setMouseScreenTransform((p)=> p.add(vec2(5, 0)))');
    assert.deepEqual(JSON.parse(run('const c = touchGamepadButtonPos(0); JSON.stringify([c.pos.x, c.pos.y, c.size])')), [915, 900, 50]);
});
