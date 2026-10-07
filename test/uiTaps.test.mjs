import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A press and release inside one frame, a trackpad tap, leaves a button active until the next frame, which clicks
// it; a second tap in that frame pressed it again while it was still active, so the first tap's release and the
// second tap's click were lost. A press over a held button, a release missed in a hitch, did the same. And a window
// losing focus while a button was held read as a release over it, which clicked it.

// the mouse's bits each step, 1 down, 2 pressed, 4 released, and the button's presses, releases and clicks
async function taps(steps, activateOnPress=false)
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return JSON.parse(run(`
        new UISystemPlugin;
        uiSystem.activateOnPress = ${activateOnPress};
        const button = new UIButton(vec2(200, 200), vec2(200, 50), 'Go');
        const seen = {press: 0, release: 0, click: 0};
        button.onPress = ()=> ++seen.press;
        button.onRelease = ()=> ++seen.release;
        button.onClick = ()=> ++seen.click;
        engineStep();
        mousePosScreen = button.nativePos.copy();
        for (const bits of ${JSON.stringify(steps)})
        {
            if (bits === 'blur') { inputClear(); engineStep(); continue; }
            inputData[0][0] = bits; engineStep();
        }
        JSON.stringify(seen)`));
}

test('two taps in frames one after the other are two presses, two releases and two clicks', async () =>
{
    const quick = [6, 6, 0, 0];
    assert.deepEqual(await taps(quick), {press: 2, release: 2, click: 2});
    assert.deepEqual(await taps(quick, true), {press: 2, release: 2, click: 2}, 'activated on press');
});

test('a press while a button is held, its release missed in one frame, releases and clicks the first press', async () =>
{
    assert.deepEqual(await taps([3, 1, 7, 1, 4, 0]), {press: 2, release: 2, click: 2});
});

test('a held button let go of by the window losing focus is released, not clicked', async () =>
{
    assert.deepEqual(await taps([3, 1, 'blur', 0]), {press: 1, release: 1, click: 0});
});
