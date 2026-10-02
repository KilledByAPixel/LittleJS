import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import
{
    setEngineManualStep, setHeadlessMode, engineInit, engineStep, setPaused,
    Tween, tweenUpdate, EngineObject, vec2,
    LightSystemPlugin, PostProcessPlugin,
} from '../dist/littlejs.esm.js';

const typings = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');

///////////////////////////////////////////////////////////////////////////////
// the light and post process plugins made before engineInit say why, instead of a bare TypeError
// (made here, before engineInit below, with a real canvas asked for)

const earlyErrors = [];
{
    const consoleAssert = console.assert;
    console.assert = (condition, ...output)=> condition || earlyErrors.push(output.join(' '));
    setHeadlessMode(false);
    for (const make of [()=> new LightSystemPlugin, ()=> new PostProcessPlugin])
    {
        try { make(); earlyErrors.push('made'); }
        catch (e) { earlyErrors.push(e.message); }
    }
    setHeadlessMode(true);
    console.assert = consoleAssert;
}

test('LightSystemPlugin and PostProcessPlugin made before engineInit assert with the reason', () =>
{
    const reason = 'create the plugin after engineInit, e.g. in gameInit';
    assert.deepEqual(earlyErrors, [reason, 'Assert failed!', reason, 'Assert failed!']);
});

///////////////////////////////////////////////////////////////////////////////
// one engine for the file, its hooks call whatever a test sets

// ticks counts engine updates, paused ones too: every hook of an update sees the same count
let onUpdate = ()=>{}, onUpdatePost = ()=>{}, onObjectUpdate = ()=>{}, ticks = 0;
setEngineManualStep(true);
await engineInit(()=>{}, ()=> onUpdate(), ()=> { onUpdatePost(); ++ticks; });
new class extends EngineObject { update() { onObjectUpdate(); } }(vec2());
engineStep(10); // past the first update, where time is still 0

// step one update at a time until done, returns how many it took
function stepsUntil(isDone, maxSteps=1e3)
{
    let steps = 0;
    for (; !isDone() && steps < maxSteps; ++steps)
        engineStep(1);
    return steps;
}

// make a tween on each of the next count updates from a hook, and return how many updates each took
// to call its then; the rounding in the engine's time differs from frame to frame, so it takes many
function tweenLifetimes(setHook, makeTween, count=20)
{
    const lifetimes = [];
    let made = 0;
    setHook(()=>
    {
        if (made >= count) return;
        ++made;
        const madeTick = ticks;
        makeTween().then(()=> lifetimes.push(ticks - madeTick));
    });
    stepsUntil(()=> lifetimes.length === count);
    setHook(()=>{});
    return lifetimes;
}

///////////////////////////////////////////////////////////////////////////////
// a tween moves by the time since its own last update, so it lasts its duration wherever it is made

test('a tween made in gameUpdate shows its start value that frame and first moves on the next', () =>
{
    const values = [];
    let tween;
    onUpdate = ()=> tween ||= new Tween(v=> values.push(v), 0, 1, 1);
    engineStep(1);
    onUpdate = ()=>{};
    assert.deepEqual(values, [0], 'only the start value on the frame it was made');
    assert.equal(tween.getValue(), 0);

    engineStep(1);
    assert.equal(values.length, 2);
    assert.ok(Math.abs(values[1] - 1/60) < 1e-9, 'one update of movement');
    tween.stop();
});

test('a tween calls then exactly its duration after it is made, in gameUpdate, an object or gameUpdatePost', () =>
{
    const places =
    {
        gameUpdate:     (hook)=> onUpdate = hook,
        objectUpdate:   (hook)=> onObjectUpdate = hook,
        gameUpdatePost: (hook)=> onUpdatePost = hook,
    };
    for (const [place, setHook] of Object.entries(places))
    for (const duration of [.5, 1])
    {
        const lifetimes = tweenLifetimes(setHook, ()=> new Tween(()=>{}, 0, 1, duration));
        assert.deepEqual(new Set(lifetimes), new Set([duration*60]), `${duration}s tweens made in ${place}`);
    }
});

test('a real time tween made while paused moves during the pause and ends on time', () =>
{
    // only gameUpdatePost and the plugins run while paused, and frame stands still
    setPaused(true);
    for (const duration of [.5, 1, 3])
    {
        let moves = 0;
        const lifetimes = tweenLifetimes((hook)=> onUpdatePost = hook,
            ()=> new Tween(()=> ++moves, 0, 1, duration, {useRealTime: true}));
        assert.deepEqual(new Set(lifetimes), new Set([duration*60]), `${duration}s of real time`);
        assert.equal(moves, 20 * (1 + duration*60), 'the start value, then a move on every paused update');
    }
    setPaused(false);
});
///////////////////////////////////////////////////////////////////////////////
// an update that runs over by more than one iteration counts every one it ran through

test('pingPong keeps its direction when one update runs through more than one iteration', () =>
{
    const values = [];
    const tween = new Tween(v=> values.push(v), 0, 1, 1).pingPong();
    tweenUpdate(2.5); // forward, back, then half way forward again
    assert.ok(Math.abs(tween.getValue() - .5) < 1e-9);
    assert.deepEqual([tween.start, tween.end], [0, 1], 'heading up');
    tweenUpdate(.25);
    assert.ok(Math.abs(values.at(-1) - .75) < 1e-9);
    tween.stop();
});

test('a finite loop or pingPong ends when one update runs through all its iterations', () =>
{
    const loop = new Tween(()=>{}, 0, 1, 1).loop(3);
    tweenUpdate(5.5);
    assert.equal(loop.isActive(), false, 'three iterations ended long ago');
    assert.equal(loop.getValue(), 1);

    // two passes end on the start, the completion gave the end first
    const values = [];
    const pingPong = new Tween(v=> values.push(v), 0, 1, 1).pingPong(2);
    tweenUpdate(2.5);
    assert.equal(pingPong.isActive(), false);
    assert.equal(values.at(-1), 0, 'it finished back on the start');
    assert.deepEqual([pingPong.start, pingPong.end], [1, 0], 'the last pass keeps its direction for restart');

    // three passes end on the end, however far the update ran over
    const values3 = [];
    const pingPong3 = new Tween(v=> values3.push(v), 0, 1, 1).pingPong(3);
    tweenUpdate(5);
    assert.equal(pingPong3.isActive(), false);
    assert.equal(values3.at(-1), 1);
    assert.deepEqual([pingPong3.start, pingPong3.end], [0, 1]);

    // a pingPong still counting keeps its remaining iterations right
    const pingPong5 = new Tween(()=>{}, 0, 1, 1).pingPong(5);
    tweenUpdate(2.5);
    assert.equal(pingPong5.isActive(), true);
    assert.equal(pingPong5.loopRemaining, 3);
    pingPong5.stop();
});

///////////////////////////////////////////////////////////////////////////////
// the lightmap follows the canvas size unless a size was passed

test('LightSystemPlugin made with no size follows the canvas size', () =>
{
    const lights = new LightSystemPlugin;
    assert.equal(lights.textureSizeAuto, true);
});

///////////////////////////////////////////////////////////////////////////////
// types in the d.ts

test('loadAtlas, TextureSheet.drawImage and PostProcessPlugin have precise types in the d.ts', () =>
{
    assert.match(typings, /export function loadAtlas\([^)]*\): \{\s*\[x: string\]: TileInfo;\s*\};/);
    assert.match(typings, /drawImage\(image: HTMLImageElement \| HTMLCanvasElement \| OffscreenCanvas \| ImageBitmap, tileInfo: TileInfo/);
    assert.match(typings, /constructor\(shaderCode\?: string, includeMainCanvas\?: boolean, feedbackTexture\?: boolean\);/);
    assert.match(typings, /textureSizeAuto: boolean;/);
});
