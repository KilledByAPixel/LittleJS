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

test('a text field deletes a whole character with Backspace, an emoji family too, and counts maxLength in them', () =>
{
    const { run } = loadEngine({ Intl });
    run('setHeadlessMode(true); new UISystemPlugin');
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const key = (k)=> run(`field.onKeyDown({key: ${JSON.stringify(k)}, code: '', repeat: false})`);
    run(`var field = new UITextInput(vec2(), vec2(200, 50), ${JSON.stringify('hi' + family)})`);
    key('Backspace');
    assert.equal(run('field.text'), 'hi', 'the family as one');
    run(`field.text = ${JSON.stringify('a' + String.fromCodePoint(0x1f44d))}; field.maxLength = 3;`);
    key('b');
    assert.equal(run('field.text'), 'a' + String.fromCodePoint(0x1f44d) + 'b', 'two characters, room for a third');
    key('c');
    assert.equal(run('field.text.length'), 4, 'and no more');
});

test('an effect name cut at 60 characters is cut between characters, never inside an emoji', () =>
{
    const { run } = loadEngine({ Intl });
    run('setHeadlessMode(true)');
    const name = 'a'.repeat(59) + String.fromCodePoint(0x1f600) + 'b';
    const kept = run(`particleEffectSanitize({name: ${JSON.stringify(name)}}).name`);
    assert.equal(kept, 'a'.repeat(59) + String.fromCodePoint(0x1f600), 'the emoji whole, as the 60th character');
});

test('writeSaveData says when the data can not be written as JSON, not that storage is full', () =>
{
    const warnings = [];
    const { run } = loadEngine({ console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) } });
    run('setHeadlessMode(true); var circular = {}; circular.self = circular;');
    assert.equal(run(`writeSaveData('save', circular)`), false);
    assert.match(warnings[0], /can not be written as JSON/);
});

test('a file that can not be reached is named with who asked, and the error keeps its cause', async () =>
{
    const failing = ()=> Promise.reject(new TypeError('network down'));
    const { run } = loadEngine({ fetch: failing });
    run('setHeadlessMode(true)');
    const error = await run(`loadFetch('song.mp3', 'loadSound').catch((e)=> e)`);
    assert.match(error.message, /^loadSound: could not load song\.mp3, network down/);
    assert.equal(error.cause.message, 'network down');
});
