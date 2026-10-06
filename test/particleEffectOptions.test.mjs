import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// An option given to a library effect that is not a value of its kind keeps the effect's own value, saying so in a
// debug build, where it quietly became the library's default; a vec2 emitSize is a rectangle, as ParticleEmitter
// takes one; and an option of no name says so in a debug build.

test('a bad option keeps the effect\'s own value in a release build', ()=>
{
    const { run } = loadEngine({}, 'setHeadlessMode(true)', 'littlejs.release.js');
    const got = JSON.parse(run(`(()=> {
        const own = particleEffect('fire', vec2()).speed;
        const bad = particleEffect('fire', vec2(), {speed: null}).speed;
        const explosion = particleEffect('explosion', vec2(), {emitTime: '0.5'}).emitTime;
        return JSON.stringify({own, bad, explosion, ownTime: particleEffect('explosion', vec2()).emitTime}); })()`));
    assert.equal(got.bad, got.own, 'fire\'s own speed, not the library default');
    assert.equal(got.explosion, got.ownTime, 'the explosion\'s own emit time, so it still stops');
});

test('a vec2 emitSize is a rectangle', ()=>
{
    const { run } = loadEngine({}, 'setHeadlessMode(true)');
    const got = JSON.parse(run(`(()=> { const e = particleEffect('fire', vec2(), {emitSize: vec2(2, 1)});
        return JSON.stringify({x: e.emitSize.x, y: e.emitSize.y, circle: e.emitCircle}); })()`));
    assert.deepEqual(got, {x: 2, y: 1, circle: false});
});

test('a bad option or one of no name asserts in a debug build, naming it', ()=>
{
    const { run } = loadEngine({}, 'setHeadlessMode(true); console.assert = ()=> {}');
    const said = (options)=> run(`(()=> { try { particleEffect('fire', vec2(), ${options}); } catch (e) { return e.message; } })()`);
    assert.match(said('{speed: null}'), /particleEffect: speed must be a number/);
    assert.match(said('{emitrate: 5}'), /particleEffect: no option named emitrate/);
    assert.equal(said('{speed: .3, hue: .5, scale: 2}'), undefined, 'good options pass');
});
