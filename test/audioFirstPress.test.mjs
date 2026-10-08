import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The first press's sound: browsers start a suspended audio context on the end of a tap, and a phone may take a
// while to start it, so a short sound played on the press waits for it and plays, where it used to drop out once
// its own length had passed. A press made only for audio's sake still unlocks it with touch input off.

const clock = { now: 1e6 };
function load()
{
    let resumes = 0;
    const engine = loadEngine({
        performance: { now: ()=> clock.now },
        window: { ontouchstart: null }, // a touch device, so the touch listeners are added
        StereoPannerNode: class { constructor() { this.pan = { value: 0 }; } connect(n) { return n; } disconnect() {} },
        AudioContext: class
        {
            constructor() { this.currentTime = 0; this.destination = {}; this.state = 'suspended'; }
            createGain()
            {
                return { connect(n) { return n; }, disconnect() {},
                    gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} } };
            }
            createBuffer() { return { getChannelData() { return { set() {} }; } }; }
            createBufferSource()
            {
                return { playbackRate: { value: 1 }, connect(n) { return n; }, addEventListener() {},
                    start() {}, stop() {} };
            }
            resume() { ++resumes; return Promise.resolve(); }
        },
    });
    // a sound of about .6 seconds, and the context starting once the browser lets it
    engine.run('var sound = new Sound([1, 0, 220, 0, .5, .1], 0);');
    engine.start = ()=> engine.run('audioContext.state = "running"; audioStateChange();');
    engine.resumes = ()=> resumes;
    return engine;
}
const touch = (type)=> ({ type, touches: [], changedTouches: [], cancelable: false, target: {},
    preventDefault() {} });

test('a one shot played on the first press plays when the audio starts, however short', () =>
{
    const { run, handlers, start } = load();
    handlers.touchstart(touch('touchstart'));
    run('var click = sound.play();');
    assert.equal(run('click.isPlaying()'), false, 'it waits while the audio is not running');
    clock.now += 150;
    handlers.touchend(touch('touchend')); // the end of the tap is what the browser starts audio on
    clock.now += 1200; // a phone taking longer than the sound to start
    start();
    assert.equal(run('click.isPlaying()'), true);
});

test('a one shot played long before the press still drops out', () =>
{
    const { run, handlers, start } = load();
    run('var early = sound.play();');
    clock.now += 5e3;
    handlers.touchend(touch('touchend'));
    start();
    assert.equal(run('early.isPlaying()'), false);
});

test('a tap starts the audio with touch input off, and a move does not try', () =>
{
    const engine = load();
    engine.run('setTouchInputEnable(false)');
    engine.handlers.touchmove(touch('touchmove'));
    assert.equal(engine.resumes(), 0);
    engine.handlers.touchend(touch('touchend'));
    assert.equal(engine.resumes(), 1);
});
