import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { particleEffectSanitize, particleEffectRecolor, particleEffectsAdd, particleEffectsGet,
    particleEffectsParse, particleEffectsText, particleEffectSettings, hsl } = LJS;

// the particle effects plugin's data side: the effect format the designer saves, its sanitizer, recoloring by hue
// and saturation, and libraries of effects played by name

test('sanitize fills every setting with its default, and the new gravity and shape', ()=>
{
    const e = particleEffectSanitize();
    for (const s of particleEffectSettings)
        assert.deepEqual(e.settings[s.name], s.value, s.name);
    assert.equal(e.settings.gravity, 0);
    assert.equal(e.settings.shape, 'soft');
    assert.equal(e.settings.tileIndex, -1);
    assert.deepEqual(e.behaviors, []);
});

test('bad input is clamped or dropped, an unknown shape falls back', ()=>
{
    const e = particleEffectSanitize({name: 5, settings: {damping: 5, shape: 'nope', gravity: 'x', junk: 1},
        behaviors: [{name: 'wobble', strength: 99}, {name: 'nope'}]});
    assert.equal(e.name, 'Effect');
    assert.equal(e.settings.damping, 1);
    assert.equal(e.settings.shape, 'soft');
    assert.equal(e.settings.gravity, 0);
    assert.equal(e.settings.junk, undefined);
    assert.deepEqual(e.behaviors, [{name: 'wobble', strength: 5}, {name: 'nope', strength: 1}],
        'an unknown behavior is kept, a game may add it later');
});

test('a library saved before shapes keeps its tile: tileIndex and no shape means no shape', ()=>
{
    const e = particleEffectSanitize({name: 'Old', settings: {tileIndex: 2, tileSize: 16}});
    assert.equal(e.settings.shape, '');
    assert.equal(e.settings.tileIndex, 2);
});

test('an old library\'s gravityScale is kept as it was', ()=>
{
    const e = particleEffectSanitize({settings: {gravityScale: -.2}});
    assert.equal(e.settings.gravityScale, -.2);
    assert.equal(e.settings.gravity, 0);
});

test('recolor shifts the hue and scales the saturation of all four colors, leaving grey, white and alpha', ()=>
{
    const e = particleEffectSanitize({settings: {colorStartA: hsl(.1, .8, .5), colorStartB: hsl(0, 0, .5, .5),
        colorEndA: hsl(0, 0, 1, 0), colorEndB: hsl(.9, .6, .4, .3)}});
    const r = particleEffectRecolor(e, .5, .5);
    const hsla = (a)=> new LJS.Color(...a).HSLA();
    const near = (a, b)=> a.every((v, i)=> Math.abs(v - b[i]) < 1e-3);
    assert.ok(near(hsla(r.settings.colorStartA), [.6, .4, .5, 1]), hsla(r.settings.colorStartA).join());
    assert.ok(near(r.settings.colorStartB, e.settings.colorStartB), 'grey stays grey');
    assert.ok(near(r.settings.colorEndA, e.settings.colorEndA), 'white stays white');
    assert.ok(near(hsla(r.settings.colorEndB), [.4, .3, .4, .3]), 'the hue wraps, alpha stays');
    assert.ok(near(hsla(particleEffectRecolor(e, 0, 9).settings.colorStartA), [.1, 1, .5, 1]), 'saturation clamps');
    assert.notEqual(r, e, 'a copy');
    assert.ok(near(hsla(e.settings.colorStartA), [.1, .8, .5, 1]), 'the original is unchanged');
});

test('a library round trips, and a loaded effect replaces one of the same name', ()=>
{
    const mine = particleEffectSanitize({name: 'fire', settings: {emitRate: 7}});
    const text = particleEffectsText([mine]);
    const back = particleEffectsParse(text);
    assert.deepEqual(back, [mine]);
    particleEffectsAdd(back);
    assert.equal(particleEffectsGet('fire').settings.emitRate, 7);
    assert.equal(particleEffectsGet('FIRE').settings.emitRate, 7, 'names match regardless of case');
    assert.throws(()=> particleEffectsParse('{}'));
});

test('a name with line breaks or control characters becomes one line', ()=>
{
    assert.equal(particleEffectSanitize({name: 'hot\nfire\r\n\tbig\u0007'}).name, 'hot fire big');
    assert.equal(particleEffectSanitize({name: '\n\n'}).name, 'Effect', 'nothing left is the default');
});

test('an effect\'s angle wraps around, an emitter pointing left stays pointing left', ()=>
{
    const near = (a, b)=> assert.ok(Math.abs(a - b) < 1e-9, a + ' is not ' + b);
    near(particleEffectSanitize({settings: {angle: Math.PI * 1.5}}).settings.angle, -Math.PI / 2);
    near(particleEffectSanitize({settings: {angle: -Math.PI * 2.25}}).settings.angle, -Math.PI / 4);
    near(particleEffectSanitize({settings: {angle: 1}}).settings.angle, 1);
});
