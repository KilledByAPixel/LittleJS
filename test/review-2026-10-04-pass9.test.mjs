import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { postProcessTiltShift, postProcessDepthOfField, postProcessVignette } from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// The ninth pass of 2026-10-03/04: post effect settings and values, audio with no AudioContext, the TiledMap types.

test('depth of field blurs nothing where there is no depth, as with the depth texture off', ()=>
{
    assert.ok(postProcessDepthOfField().includes('iDepthRange.x > 0.'), 'a depth range of 0 is no depth texture');
});

test('a postProcess value may be named with an i, only the engine\'s own iUpper names are refused', ()=>
{
    const { run } = loadEngine();
    assert.doesNotThrow(()=> run(`postProcessFragmentSource(postProcessEffects(), {intensity: 1, inner: [1, 2]})`));
    assert.throws(()=> run(`postProcessFragmentSource(postProcessEffects(), {iTime: 1})`), /Assert/);
    assert.throws(()=> run(`postProcessFragmentSource(postProcessEffects(), {gl_x: 1})`), /Assert/);
});

test('a value that changes its length is a value the shader must be made again for', ()=>
{
    const { run } = loadEngine();
    assert.notEqual(run(`postProcessValueKey({a: 1})`), run(`postProcessValueKey({a: [1, 0, 0]})`));
    assert.equal(run(`postProcessValueKey({a: 1, b: [1, 2]})`), run(`postProcessValueKey({a: 3, b: [4, 5]})`));
    assert.throws(()=> run(`postProcessFragmentSource(postProcessEffects(), {a: [1]})`), /Assert/, 'a list of one');
});

test('a tiny setting keeps its value in the shader, and one that is not finite asserts', ()=>
{
    assert.ok(postProcessVignette(1e-7).includes('1e-7'), postProcessVignette(1e-7));
    assert.ok(postProcessVignette(.5).includes('0.5000'), 'as before for an ordinary one');
    for (const bad of [Infinity, -Infinity, NaN])
        assert.throws(()=> postProcessVignette(bad), /Assert/, String(bad));
});

test('a blur wider than 32 pixels asserts, its 24 taps would sit far apart', ()=>
{
    assert.throws(()=> postProcessTiltShift(.5, .2, 40), /Assert/);
    assert.throws(()=> postProcessDepthOfField(10, 4, 40), /Assert/);
    assert.doesNotThrow(()=> postProcessDepthOfField(10, 4, 'blur'), 'a value is the game\'s to keep in range');
});

test('with no AudioContext a zzfx sound and the page hiding do nothing, where they threw', ()=>
{
    const { run, context } = loadEngine({ AudioContext: undefined });
    assert.doesNotThrow(()=> run('soundEnable = true; zzfx(1)'));
    context.document.hidden = true;
    assert.doesNotThrow(()=> run('audioVisibilityChange()'));
    context.document.hidden = false;
    assert.doesNotThrow(()=> run('audioVisibilityChange()'));
});

test('the d.ts takes an old Tiled version as a number, and tileLayersLoad with no map', ()=>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const tiled = dts.slice(dts.indexOf('export type TiledMap'), dts.indexOf('export type TiledMap') + 2000);
    assert.match(tiled, /version\?: (string \| number|number \| string);/);
    assert.match(dts, /export function tileLayersLoad\(tileMapData\?: TiledMap,/);
});
