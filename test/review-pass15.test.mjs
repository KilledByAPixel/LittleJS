import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The small fixes of review pass 15.

// a canvas context that ignores a font string it can not parse, as a browser does, and counts the fonts set on it
function fontContext()
{
    const context = { font: '10px sans-serif', sets: 0 };
    const valid = (value)=> !/\s\d\w*\s*$/.test(value) || /['"][^'"]*['"]\s*$/.test(value);
    return new Proxy(Object.assign(context, { save() {}, restore() {}, fillText() {}, strokeText() {}, translate() {},
        rotate() {}, measureText: ()=> ({ width: 1 }) }), { set: (t, k, v)=>
        {
            if (k === 'font') { ++t.sets; valid(v) && (t.font = v); } else t[k] = v;
            return true;
        } });
}

test('the debug font check runs once a font, not once a size, and a 7px serif is not taken for a refused font', () =>
{
    const context = fontContext(), warnings = [];
    const { run } = loadEngine({ fontContext: context, console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run('setHeadlessMode(true)');
    const draw = (size, family)=> run(`drawTextScreen('hi', vec2(), ${size}, WHITE, 0, BLACK, 'center',
        ${JSON.stringify(family)}, '', undefined, 0, fontContext)`);
    for (let size = 1; size <= 100; ++size)
        draw(size + .5, 'arial');
    assert.ok(context.sets <= 100 + 2, 'one check for the family, then a set a draw: ' + context.sets);
    draw(7, 'serif');
    assert.deepEqual(warnings, [], 'a font that is the check\'s own is not warned of');
});

test('setSoundVolume asserts a finite number, as an infinite one was taken and then ignored', () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); console.assert = ()=> {}');
    assert.match(run(`(()=> { try { setSoundVolume(Infinity); } catch (e) { return e.message; } })()`), /setSoundVolume/);
});

test('particleEffect takes null for no options, and keeps emitRect false with a vec2 emitSize', () =>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    assert.equal(run(`particleEffect('sparks', vec2(), null) instanceof ParticleEmitter`), true);
    const circle = JSON.parse(run(`(()=> { const e = particleEffect('sparks', vec2(), {emitSize: vec2(2, 1), emitRect: false});
        return JSON.stringify({circle: e.emitCircle, x: e.emitSize.x}); })()`));
    assert.deepEqual(circle, {circle: true, x: 2}, 'a circle as wide as the vec2\'s x');
});
