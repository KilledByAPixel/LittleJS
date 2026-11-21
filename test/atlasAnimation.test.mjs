import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// atlasAnimation: an Aseprite sheet's frame times and tag directions, and the plain frame time of other atlases

// an engine with a stub image and canvas, so loadAtlas runs in node, as fullPass12's; the image is 64 pixels square,
// and a sheet's context gives back its own canvas, so its texture has a size and a frame of a group can be read
function atlasEngine()
{
    const contextOf = (canvas)=> new Proxy({}, { get: (t, k)=> k === 'canvas' ? canvas :
        typeof k === 'string' ? ()=> ({}) : undefined, set: ()=> true });
    const e = loadEngine({
        Image: class { set src(v) { this.width = this.height = 64; Promise.resolve().then(()=> this.onload()); } },
        OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return contextOf(this); } },
    });
    e.run('glEnable = false; engineInitialized = true;');
    return e;
}
const frame = (x, duration)=> ({frame: {x, y: 0, w: 8, h: 8}, sourceSize: {w: 8, h: 8}, duration});

test('parseAtlas gives each Aseprite frame its duration in seconds', ()=>
{
    const { run } = atlasEngine();
    const groups = JSON.parse(run(`JSON.stringify(parseAtlas(${JSON.stringify({frames: [
        {filename: 'a 0.aseprite', ...frame(0, 100)}, {filename: 'a 1.aseprite', ...frame(8)}]})}))`));
    assert.deepEqual(groups.flatMap((g)=> g.frames.map((f)=> f.duration)), [.1, undefined]);
});

test('atlasAnimation plays an Aseprite tag with its frame times and direction, a new animation each call', async ()=>
{
    const { run } = atlasEngine();
    const sheet = {
        frames: [0, 8, 16].map((x, i)=> ({filename: 'hero ' + i + '.aseprite', ...frame(x, [100, 300, 100][i])})),
        meta: {frameTags: [
            {name: 'attack', from: 0, to: 2, direction: 'forward'},
            {name: 'back', from: 0, to: 2, direction: 'reverse'},
            {name: 'bounce', from: 0, to: 2, direction: 'pingpong'},
            {name: 'bounceBack', from: 0, to: 2, direction: 'pingpong_reverse'},
        ]},
    };
    run(`var a = loadAtlas('hero.png', ${JSON.stringify(sheet)})`);
    await run('spritesReady()');
    const read = (name)=> JSON.parse(run(`(()=> { const s = atlasAnimation(a, '${name}');
        return JSON.stringify([s.frameCount, s.frameTime, s.mode, s.speed, s.frame]); })()`));
    assert.deepEqual(read('attack'), [3, [.1, .3, .1], 'loop', 1, 0]);
    assert.deepEqual(read('back'), [3, [.1, .3, .1], 'loop', -1, 2], 'reverse starts on the last frame');
    assert.deepEqual(read('bounce'), [3, [.1, .3, .1], 'pingPong', 1, 0]);
    assert.deepEqual(read('bounceBack'), [3, [.1, .3, .1], 'pingPong', -1, 2]);
    assert.equal(run(`atlasAnimation(a, 'attack') !== atlasAnimation(a, 'attack')`), true);
    assert.equal(run(`atlasAnimation(a, 'attack').firstTile === a.attack`), true);
    assert.throws(()=> run(`atlasAnimation(a, 'run')`), 'a name the atlas does not have');
});

test('atlasAnimation of a sheet with no times uses the frame time, and a single sprite is one frame', async ()=>
{
    const { run } = atlasEngine();
    run(`var a = loadAtlas('run.png', ${JSON.stringify({frames: {'run_0.png': frame(0), 'run_1.png': frame(8),
        'gem.png': frame(16)}})})`);
    await run('spritesReady()');
    const read = (call)=> JSON.parse(run(`(()=> { const s = ${call}; return JSON.stringify([s.frameCount, s.frameTime]); })()`));
    assert.deepEqual(read(`atlasAnimation(a, 'run')`), [2, .1]);
    assert.deepEqual(read(`atlasAnimation(a, 'run', .2)`), [2, .2]);
    assert.deepEqual(read(`atlasAnimation(a, 'gem')`), [1, .1]);
    assert.deepEqual(read(`atlasAnimation(a, 'run_1')`), [1, .1], 'a frame under its own name');
});
