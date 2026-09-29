import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// Drives the real fixed step loop with made-up requestAnimationFrame timestamps, as a browser calls it, and counts
// the updates each frame runs. Node has no requestAnimationFrame, so the stub keeps the loop's callback to call by
// hand. The jitter comes from a seeded generator so every run is the same.
let rafCallback;
globalThis.requestAnimationFrame = (f)=> { rafCallback = f; };
const random = new LJS.RandomGenerator(7);
let updates = 0, idealMS = 1000;
await LJS.engineInit(()=>{}, ()=> ++updates, ()=>{}, ()=>{}, ()=>{});

// run frames at a refresh rate, each shown at its ideal time but stamped with jitter, optionally to whole ms like
// Firefox and Safari, and give back how many updates each frame ran
function runFrames(hz, count, jitterMS=0, wholeMS=false)
{
    const counts = [];
    for (let i = count; i--;)
    {
        idealMS += 1e3 / hz;
        let stampMS = idealMS + (jitterMS ? random.float(-jitterMS, jitterMS) : 0);
        if (wholeMS)
            stampMS = Math.round(stampMS);
        const before = updates;
        rafCallback(stampMS);
        counts.push(updates - before);
    }
    return counts;
}

// breaks in a cadence that should be even: at 144 Hz updates come 2 or 3 frames apart in an even mix, so two
// updates in one frame, a gap outside 2 or 3, two long gaps in a row or three short ones is a break
function cadenceBreaks(counts)
{
    let breaks = 0, last = -1;
    const gaps = [];
    counts.forEach((n, i)=>
    {
        if (n > 1) ++breaks;
        if (!n) return;
        last >= 0 && gaps.push(i - last);
        last = i;
    });
    for (let i = 1; i < gaps.length; ++i)
    {
        if (gaps[i] < 2 || gaps[i] > 3) ++breaks;
        else if (gaps[i] == 3 && gaps[i-1] == 3) ++breaks;
        else if (i > 1 && gaps[i] == 2 && gaps[i-1] == 2 && gaps[i-2] == 2) ++breaks;
    }
    return breaks;
}

// frames at 60 Hz where a busy game misses some refreshes, each covering 1 or 2 display frames
function runMissed(missRate, count, jitterMS=0)
{
    const counts = [], covered = [];
    for (let i = count; i--;)
    {
        const frames = random.float() < missRate ? 2 : 1;
        idealMS += frames * 1e3 / 60;
        const before = updates;
        rafCallback(idealMS + (jitterMS ? random.float(-jitterMS, jitterMS) : 0));
        counts.push(updates - before);
        covered.push(frames);
    }
    return { counts, covered };
}

test('at 60 Hz a busy game that misses frames runs as many updates as each frame covered', ()=>
{
    // an update now and then lands one frame off where the fixed step's buffer sits on a boundary, as it always
    // has; before smoothing, .3 ms of jitter put about a quarter of these frames off
    for (const missRate of [.3, .5, .6])
    for (const jitterMS of [0, .3])
    {
        runMissed(missRate, 120, jitterMS);
        const { counts, covered } = runMissed(missRate, 600, jitterMS);
        const wrong = counts.filter((n, i)=> n != covered[i]).length;
        assert.ok(wrong <= 12, missRate + ' missed, jitter ' + jitterMS + ': ' + wrong + ' frames off');
    }
});

test('a smoothed delta is never negative, so timeReal never runs back', ()=>
{
    const { run } = loadEngine();
    const lowest = run(`
        const random = new RandomGenerator(5);
        let now = 1000, last = now, lowest = Infinity;
        for (let i = 0; i < 3000; ++i)
        {
            now += i < 1500 ? 1e3 / 144 + random.float(-1.5, 1.5) : random.float(8, 25);
            lowest = Math.min(lowest, engineSmoothDelta(now - last));
            last = now;
        }
        lowest`);
    assert.ok(lowest >= 0, 'lowest ' + lowest);
});

test('at 60 Hz with jitter and whole ms timestamps each frame runs one update', ()=>
{
    runFrames(60, 120, 2, true); // settle the estimate
    const counts = runFrames(60, 600, 2, true);
    assert.deepEqual(counts.filter(n=> n != 1), []);
});

test('at 144 Hz with jitter the update cadence stays even', ()=>
{
    runFrames(144, 120, 1.5);
    const counts = runFrames(144, 1200, 1.5);
    const breaks = cadenceBreaks(counts);
    assert.ok(breaks <= 2, 'cadence breaks ' + breaks);
});

test('at 120 Hz with jitter every other frame runs one update', ()=>
{
    runFrames(120, 120, 1);
    const counts = runFrames(120, 240, 1);
    for (let i = 1; i < counts.length; ++i)
        assert.equal(counts[i] + counts[i-1], 1, 'frame ' + i);
});

test('once settled every smoothed delta is one display frame, with jitter or whole ms timestamps', ()=>
{
    // a delta of 2 frames then 0 is the stutter smoothing is for, it must not come back once the estimate settles
    for (const [hz, jitterMS, wholeMS] of [[144, 1.5, false], [144, .5, true], [60, 2, true]])
    {
        const { run } = loadEngine();
        const off = run(`
            const random = new RandomGenerator(3);
            let ideal = 1000, last = ideal, off = 0;
            for (let i = 0; i < 1400; ++i)
            {
                ideal += 1e3 / ${hz};
                let stamp = ideal + random.float(-${jitterMS}, ${jitterMS});
                if (${wholeMS}) stamp = Math.round(stamp);
                const smooth = engineSmoothDelta(stamp - last);
                last = stamp;
                if (i >= 200 && Math.abs(smooth - 1e3 / ${hz}) > .1) ++off; // a 0 or 2 frame delta is far past
            }
            off`);
        assert.equal(off, 0, hz + ' Hz, jitter ' + jitterMS + (wholeMS ? ', whole ms' : ''));
    }
});

test('the estimate follows the window to a display with another refresh rate, either way', ()=>
{
    const { run } = loadEngine();
    const settled = run(`
        let now = 1000;
        const settle = (hz)=>
        {
            let last = now, smooth;
            for (let i = 0; i < 200; ++i)
            {
                now += 1e3 / hz;
                smooth = engineSmoothDelta(now - last);
                last = now;
            }
            return Math.round(1e3 / smooth);
        };
        [settle(60), settle(144), settle(60)].join()`);
    assert.equal(settled, '60,144,60');
});

test('ten seconds of frames run 600 updates at any refresh rate, time does not drift', ()=>
{
    for (const [hz, jitterMS, wholeMS] of [[144, 1.5, false], [60, 2, true], [120, 1, false], [75, 1, true]])
    {
        runFrames(hz, 120, jitterMS, wholeMS);
        const before = updates;
        runFrames(hz, hz * 10, jitterMS, wholeMS);
        assert.ok(Math.abs(updates - before - 600) <= 1, hz + ' Hz ran ' + (updates - before));
    }
});

test('irregular frame times keep the total and never skip two frames in a row', ()=>
{
    // like a variable refresh display: every frame a different length, 7 to 12 ms
    const before = updates;
    let elapsedMS = 0, zeros = 0, worst = 0;
    for (let i = 0; i < 1200; ++i)
    {
        const frameMS = random.float(7, 12);
        idealMS += frameMS, elapsedMS += frameMS;
        const count = updates;
        rafCallback(idealMS);
        zeros = updates == count ? zeros + 1 : 0;
        worst = Math.max(worst, zeros);
    }
    assert.ok(Math.abs((updates - before) - elapsedMS * 60 / 1e3) <= 2, 'updates ' + (updates - before));
    assert.ok(worst <= 2, 'frames in a row with no update ' + worst); // 60 updates on ~105 frames skips some
});

test('a three second gap, like a hidden tab, does not upset the cadence after it', ()=>
{
    runFrames(144, 120, 1);
    idealMS += 3000;
    runFrames(144, 1);
    runFrames(144, 120, 1);
    const breaks = cadenceBreaks(runFrames(144, 1200, 1));
    assert.ok(breaks <= 2, 'cadence breaks ' + breaks);
});
