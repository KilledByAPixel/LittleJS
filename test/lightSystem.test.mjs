import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineObject, vec2, setGravity } from '../dist/littlejs.esm.js';
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

test('a Light renders its light without a throw while lightSystem.enabled is off', async () =>
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

test('a Light stays where it is put in a game with gravity', () =>
{
    setGravity(vec2(0, -.02));
    try
    {
        const light = new Light(vec2(3, 4), 5);
        assert.equal(light.mass, 0, 'static');
        for (let i = 0; i < 10; ++i) light.updatePhysics();
        assert.equal(light.pos.y, 4);
        light.destroy();
    }
    finally { setGravity(vec2()); }
});

test('EngineObject.castShadow defaults to true', () =>
{
    const o = new EngineObject(vec2(0, 0));
    assert.equal(o.castShadow, true);
});

test('EngineObject.renderShadow() calls render() once by default', () =>
{
    const o = new EngineObject(vec2(0, 0));
    let renders = 0;
    o.render = () => ++renders;
    o.renderShadow();
    assert.equal(renders, 1);
});

test('Light.castShadow defaults to true', () =>
{
    const l = new Light(vec2(0, 0), 1);
    assert.equal(l.castShadow, true);
});

test('shadows are off by default and the shadow settings have their defaults', async () =>
{
    const { lightSystem } = await import('../dist/littlejs.esm.js');
    assert.equal(lightSystem.shadows, false);
    assert.equal(lightSystem.shadowMapSize, 1024);
    assert.equal(lightSystem.shadowMapScale, 2);
    assert.equal(lightSystem.shadowTextureSize, 256);
    assert.equal(lightSystem.shadowPassCount, 16);
    assert.equal(lightSystem.shadowSoftness, .5);
    assert.equal(lightSystem.shadowPass, false);
    assert.equal(lightSystem.shadowMap, undefined);
});

test('setShadowTransparent outside the shadow pass does nothing and does not throw', async () =>
{
    const { lightSystem } = await import('../dist/littlejs.esm.js');
    assert.doesNotThrow(() => lightSystem.setShadowTransparent(true));
    assert.doesNotThrow(() => lightSystem.setShadowTransparent(false));
    assert.equal(lightSystem.shadowPass, false);
});

test('a Light renders its light without a throw in headless mode with shadows on', async () =>
{
    const { lightSystem } = await import('../dist/littlejs.esm.js');
    lightSystem.shadows = true;
    const l = new Light(vec2(0, 0), 4);
    assert.doesNotThrow(() => l.renderLight());
    lightSystem.shadows = false;
});

test('Light.shadowCore defaults to 0, so a caster over the light still blocks it', () =>
{
    const l = new Light(vec2(0, 0), 1);
    assert.equal(l.shadowCore, 0);
});

test('objects are not emissive by default, and renderEmissive draws render()', async () =>
{
    const { lightSystem } = await import('../dist/littlejs.esm.js');
    const o = new EngineObject(vec2());
    assert.equal(o.emissive, 0);
    let rendered = 0;
    o.render = ()=> ++rendered;
    o.renderEmissive();
    assert.equal(rendered, 1);
    assert.equal(lightSystem.emissivePass, false);
    o.destroy();
});
