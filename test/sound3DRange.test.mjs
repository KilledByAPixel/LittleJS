import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A sound played in 3D with no range of its own is heard out to render3D.soundDefaultRange, 100, since a 3D world
// is bigger than a 2D one, whose soundDefaultRange is 40; a sound given a range keeps it.

// sound made with audio on, and its play swapped for one that hands back the volume it was given
function load()
{
    const { run } = loadEngine();
    run(`setHeadlessMode(false); new Render3DPlugin;
        var sound = (...args)=> { const s = new Sound(undefined, ...args); s.play = (pos, volume)=> ({volume, setPan() {}}); return s; };
        var heard = (s, distance)=> render3D.playSound(s, render3D.camera.pos.add(vec3(distance, 0, 0)))?.volume;`);
    return run;
}

test('a sound with no range of its own is heard to 100 in 3D, tapering from its taper', ()=>
{
    const run = load();
    run('var s = sound();');
    assert.deepEqual([run('s.range'), run('s.rangeIsDefault'), run('render3D.soundDefaultRange')], [40, true, 100]);
    assert.equal(run('heard(s, 60)'), 1, 'past the 2D range, still full');
    assert.ok(run('heard(s, 90)') > 0 && run('heard(s, 90)') < 1, 'tapering toward 100');
    assert.equal(run('heard(s, 101)'), undefined, 'out of range');
    run('render3D.soundDefaultRange = 200');
    assert.equal(run('heard(s, 101)'), 1);
});

test('a sound given a range keeps it in 3D', ()=>
{
    const run = load();
    run('var s = sound(.1, 20);');
    assert.deepEqual([run('s.range'), run('s.rangeIsDefault')], [20, false]);
    assert.equal(run('heard(s, 10)'), 1);
    assert.equal(run('heard(s, 21)'), undefined);
    run('var all = sound(.1, 0);');
    assert.equal(run('heard(all, 5000)'), 1, 'a range of 0 is heard everywhere, as in 2D');
});

test('a range set after the sound is made is its range in 3D too', ()=>
{
    const run = load();
    run('var s = sound(); s.range = 5;');
    assert.deepEqual([run('s.range'), run('s.rangeIsDefault')], [5, false]);
    assert.equal(run('heard(s, 50)'), undefined, 'out of its own range, though inside the 3D default');
    run('s.range = 200');
    assert.ok(run('heard(s, 150)') > 0, 'heard past the 3D default');
    run('s.range = 0');
    assert.equal(run('heard(s, 5000)'), 1, 'a range of 0 is heard everywhere');
    run('var plain = sound();');
    assert.equal(run('heard(plain, 60)'), 1, 'a sound left alone still has the 3D default');
});
