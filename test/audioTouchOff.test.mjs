import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A tap starts a suspended audio context with touch input off too, since a page's sound needs it as much as a game's.

test('a tap starts the audio with touch input off', () =>
{
    let resumes = 0;
    const { run, handlers } = loadEngine({
        window: { ontouchstart: null }, // a touch device, so the touch listeners are added
        AudioContext: class
        {
            constructor() { this.currentTime = 0; this.destination = {}; this.state = 'suspended'; }
            createGain() { return { connect(n) { return n; }, disconnect() {}, gain: { value: 0 } }; }
            resume() { ++resumes; return Promise.resolve(); }
        },
    });
    run('setTouchInputEnable(false)');
    handlers.touchend({ type: 'touchend', touches: [], changedTouches: [], cancelable: false, target: {},
        preventDefault() {} });
    assert.equal(resumes, 1);
});
