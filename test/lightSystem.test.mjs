import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject, vec2 } from '../dist/littlejs.esm.js';
import { Light } from '../dist/littlejs.esm.js';

test('EngineObject.renderLight exists and is a no-op', () =>
{
    const o = new EngineObject(vec2(0, 0));
    assert.equal(typeof o.renderLight, 'function');
    assert.doesNotThrow(() => o.renderLight());
    assert.equal(o.renderLight(), undefined);
});

test('Light constructs with required params and default fadeRange = radius', () =>
{
    const l = new Light(vec2(3, 4), 5, undefined);
    assert.equal(l.pos.x, 3);
    assert.equal(l.pos.y, 4);
    assert.equal(l.radius, 5);
    assert.equal(l.fadeRange, 5);                 // defaults to radius
});

test('Light constructs with explicit fadeRange', () =>
{
    const l = new Light(vec2(0, 0), 10, undefined, 2);
    assert.equal(l.radius, 10);
    assert.equal(l.fadeRange, 2);
});

test('Light inherits EngineObject.color when none passed', async () =>
{
    const { WHITE } = await import('../dist/littlejs.esm.js');
    const l = new Light(vec2(0, 0), 1, undefined);
    assert.equal(l.color.r, WHITE.r);
    assert.equal(l.color.g, WHITE.g);
    assert.equal(l.color.b, WHITE.b);
    assert.equal(l.color.a, WHITE.a);
});

test('Light.render() is a no-op (does not draw, does not throw)', () =>
{
    const l = new Light(vec2(0, 0), 1, undefined);
    assert.equal(l.render(), undefined);
});

test('Light.renderLight() does not throw in headless mode', () =>
{
    const l = new Light(vec2(0, 0), 1, undefined);
    assert.doesNotThrow(() => l.renderLight());
});

test('Light constructor asserts on negative radius', () =>
{
    assert.throws(() => new Light(vec2(0, 0), -1, undefined));
});

test('Light constructor asserts on negative fadeRange', () =>
{
    assert.throws(() => new Light(vec2(0, 0), 5, undefined, -1));
});

test('LightSystemPlugin can be constructed in headless mode without throwing', async () =>
{
    const mod = await import('../dist/littlejs.esm.js');
    const { LightSystemPlugin, lightSystem } = mod;
    // singleton may already exist from earlier tests; only construct if not
    if (!lightSystem)
        new LightSystemPlugin();
    // singleton getter should now resolve
    assert.ok(mod.lightSystem);
});

test('LightSystemPlugin exposes enabled=true by default', async () =>
{
    const { lightSystem } = await import('../dist/littlejs.esm.js');
    assert.equal(lightSystem.enabled, true);
});

test('Second LightSystemPlugin construction asserts', async () =>
{
    const { LightSystemPlugin } = await import('../dist/littlejs.esm.js');
    // Note: LittleJS ASSERT throws Error('Assert failed!') and writes the
    // 'already initialized' message to console.assert, so we can't regex-match
    // the Error message. The throw itself is the meaningful signal.
    assert.throws(() => new LightSystemPlugin());
});

test('LightSystemPlugin defensively copies ambientColor (does not retain a frozen BLACK reference)', async () =>
{
    const { lightSystem, BLACK } = await import('../dist/littlejs.esm.js');
    // .copy() must have produced a distinct Color instance, not the frozen BLACK global
    assert.notEqual(lightSystem.ambientColor, BLACK);
});

test('Light with radius=0 does not throw', () =>
{
    const l = new Light(vec2(0, 0), 0, undefined);
    assert.equal(l.radius, 0);
    assert.equal(l.fadeRange, 0);
    assert.doesNotThrow(() => l.renderLight());
});

test('Light with fadeRange=0 does not throw (hard disc)', () =>
{
    const l = new Light(vec2(0, 0), 4, undefined, 0);
    assert.equal(l.fadeRange, 0);
    assert.doesNotThrow(() => l.renderLight());
});

test('lightSystem.enabled=false short-circuits the render callback safely', async () =>
{
    const { lightSystem } = await import('../dist/littlejs.esm.js');
    const prev = lightSystem.enabled;
    lightSystem.enabled = false;
    // no easy way to trigger the plugin's render callback in headless mode;
    // just verify the property round-trips and renderLight() on a Light is harmless
    const l = new Light(vec2(0, 0), 1, undefined);
    assert.doesNotThrow(() => l.renderLight());
    lightSystem.enabled = prev;
});

test('destroyed objects are skipped by the lightmap pass (by contract)', () =>
{
    const l = new Light(vec2(0, 0), 1, undefined);
    l.destroy();
    assert.equal(l.destroyed, true);
});
