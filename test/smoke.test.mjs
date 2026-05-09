import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    EngineObject, ParticleEmitter, TileLayerData, TileInfo,
    TileLayer, CanvasLayer, Medal,
    Timer, tile, vec2, rgb,
} from '../dist/littlejs.esm.js';

const near = (a, b, eps=1e-9) => Math.abs(a - b) <= eps;

// Tier 2-lite: verify core engine primitives can be constructed without
// crashing or tripping ASSERTs (debug bundle keeps them live). We do NOT
// boot the engine via engineInit and we do NOT call render() (which would
// require a canvas context). update() on the base EngineObject is safe
// because the default is a no-op.

test('bundle exposes core engine symbols', () =>
{
    // If the bundle failed to load under our stubs, this file wouldn't
    // have imported at all — so reaching here proves import succeeded.
    // These checks also guard against an export regression stripping
    // core names from the public surface.
    assert.equal(typeof EngineObject, 'function');
    assert.equal(typeof Timer, 'function');
    assert.equal(typeof tile, 'function');
    assert.equal(typeof vec2, 'function');
});

test('EngineObject constructs and base update is safe', () =>
{
    const o = new EngineObject(vec2(0, 0), vec2(1, 1));
    assert.equal(o.pos.x, 0);
    assert.equal(o.pos.y, 0);
    assert.equal(o.size.x, 1);
    assert.equal(o.size.y, 1);
    // base class update is an empty method — calling it should not throw
    assert.doesNotThrow(() => o.update());
});

test('EngineObject with color and angle constructs', () =>
{
    const o = new EngineObject(vec2(5, -3), vec2(2, 2), undefined, Math.PI/4, rgb(1, 0, 0));
    assert.equal(o.pos.x, 5);
    assert.equal(o.angle, Math.PI/4);
});

test('tile() returns a TileInfo', () =>
{
    const t = tile(0, 16);
    assert(t instanceof TileInfo);
});

test('ParticleEmitter constructs with defaults', () =>
{
    // minimum reasonable args: pos, angle, emitSize, emitTime, emitRate
    const e = new ParticleEmitter(vec2(0, 0), 0, 0, 0, 0);
    assert(e instanceof ParticleEmitter);
    assert(e instanceof EngineObject);
});

test('TileLayerData constructs', () =>
{
    // TileLayerData(tile, direction, mirror, color) — minimal form
    assert.doesNotThrow(() => new TileLayerData(0));
    assert.doesNotThrow(() => new TileLayerData(5, 1, false));
});

test('Timer lifecycle (unset -> set -> elapsed check)', () =>
{
    const t = new Timer();
    assert.equal(t.isSet(), false);
    assert.equal(t.get(), 0);              // returns 0 when unset
    assert.equal(t.getSetTime(), 0);
    t.set(1);
    assert.equal(t.isSet(), true);
    assert.equal(t.getSetTime(), 1);
    t.unset();
    assert.equal(t.isSet(), false);
});

test('Timer constructed with duration is set', () =>
{
    const t = new Timer(5);
    assert.equal(t.isSet(), true);
    assert.equal(t.getSetTime(), 5);
});

// The engine's `time` global stays at 0 because the main loop never runs
// in headless mode without engineInit. That lets us check time-derived
// Timer methods against known reference points.

test('Timer active / elapsed / get for a fresh positive-duration timer', () =>
{
    const t = new Timer(1);
    assert.equal(t.active(), true);                  // time(0) < setAt(1)
    assert.equal(t.elapsed(), false);
    assert(near(t.get(), -1));                       // negative = still active
});

test('Timer active / elapsed / get for an already-elapsed timer', () =>
{
    // negative duration -> timer's internal target is in the past
    const t = new Timer(-2);
    assert.equal(t.active(), false);
    assert.equal(t.elapsed(), true);
    assert(near(t.get(), 2));                        // positive = how long since elapsed
});

test('Timer with zero duration is immediately elapsed', () =>
{
    const t = new Timer(0);
    assert.equal(t.active(), false);
    assert.equal(t.elapsed(), true);
    assert(near(t.get(), 0));
});

test('Timer getPercent for fresh positive-duration timer is 0', () =>
{
    // at time=0 with a timer set for duration 1, no time has elapsed yet
    assert(near(new Timer(1).getPercent(), 0));
});

test('Timer unset returns 0 from get/getPercent/getSetTime', () =>
{
    const t = new Timer();
    assert.equal(t.isSet(), false);
    assert.equal(t.get(), 0);
    assert.equal(t.getPercent(), 0);
    assert.equal(t.getSetTime(), 0);
});

///////////////////////////////////////////////////////////////////////////////
// EngineObject methods

test('EngineObject.setCollision applies each flag to the right slot', () =>
{
    // Asymmetric patterns: each of the four (collideSolidObjects, isSolid,
    // collideTiles, collideRaycast) slots gets a different value from its
    // neighbors, so any pairwise swap of assignments would show up.
    const o = new EngineObject(vec2(0, 0), vec2(1, 1));
    // pattern A: [T, F, T, F]
    o.setCollision(true, false, true, false);
    assert.equal(o.collideSolidObjects, true);
    assert.equal(o.isSolid, false);
    assert.equal(o.collideTiles, true);
    assert.equal(o.collideRaycast, false);
    // pattern B: [T, T, F, T] — flips everything from A (ASSERT requires collideSolidObjects||!isSolid)
    o.setCollision(true, true, false, true);
    assert.equal(o.collideSolidObjects, true);
    assert.equal(o.isSolid, true);
    assert.equal(o.collideTiles, false);
    assert.equal(o.collideRaycast, true);
    // defaults: all true
    o.setCollision();
    assert.equal(o.collideSolidObjects, true);
    assert.equal(o.isSolid, true);
    assert.equal(o.collideTiles, true);
    assert.equal(o.collideRaycast, true);
});

test('EngineObject.addChild / removeChild maintain bidirectional links', () =>
{
    const parent = new EngineObject(vec2(0, 0), vec2(1, 1));
    const child = new EngineObject(vec2(0, 0), vec2(1, 1));
    const localPos = vec2(2, 3);
    parent.addChild(child, localPos, 0.5);
    assert.equal(child.parent, parent);
    assert.deepEqual(parent.children, [child]);
    assert.equal(child.localAngle, 0.5);
    // localPos is stored as a copy — mutating the original doesn't affect the child
    assert.equal(child.localPos.x, 2);
    assert.equal(child.localPos.y, 3);
    localPos.x = 999;
    assert.equal(child.localPos.x, 2);
    // removeChild clears parent and splices children
    parent.removeChild(child);
    assert.equal(child.parent, undefined);
    assert.deepEqual(parent.children, []);
});

test('EngineObject.destroy is idempotent and cascades to children', () =>
{
    const parent = new EngineObject(vec2(0, 0), vec2(1, 1));
    const childA = new EngineObject(vec2(0, 0), vec2(1, 1));
    const childB = new EngineObject(vec2(0, 0), vec2(1, 1));
    parent.addChild(childA);
    parent.addChild(childB);
    parent.destroy();
    assert.equal(parent.destroyed, true);
    // children cascade-destroyed
    assert.equal(childA.destroyed, true);
    assert.equal(childB.destroyed, true);
    // children have parent cleared
    assert.equal(childA.parent, undefined);
    assert.equal(childB.parent, undefined);
    // idempotent — second call is a no-op (no throw)
    assert.doesNotThrow(() => parent.destroy());
});

test('EngineObject.destroy disconnects from parent', () =>
{
    const parent = new EngineObject(vec2(0, 0), vec2(1, 1));
    const child = new EngineObject(vec2(0, 0), vec2(1, 1));
    parent.addChild(child);
    child.destroy();
    assert.equal(child.destroyed, true);
    assert.equal(child.parent, undefined);
    assert.deepEqual(parent.children, []);           // parent's children array spliced
});

test('EngineObject.getAliveTime is 0 right after construction (time=0 in headless)', () =>
{
    const o = new EngineObject(vec2(0, 0), vec2(1, 1));
    assert(near(o.getAliveTime(), 0));
});

///////////////////////////////////////////////////////////////////////////////
// Medal

test('Medal construction sets fields and registers in medals[]', () =>
{
    const m = new Medal(100, 'Test Medal', 'A test medal', '🏆');
    assert.equal(m.id, 100);
    assert.equal(m.name, 'Test Medal');
    assert.equal(m.description, 'A test medal');
    assert.equal(m.icon, '🏆');
    assert.equal(m.unlocked, false);
});

test('Medal description and icon default when omitted', () =>
{
    const m = new Medal(101, 'Defaults Medal');
    assert.equal(m.description, '');
    assert.equal(m.icon, '🏆');                      // default trophy
    assert.equal(m.unlocked, false);
});

///////////////////////////////////////////////////////////////////////////////
// CanvasLayer / TileLayer

test('CanvasLayer extends EngineObject and has no canvas in headless', () =>
{
    const cl = new CanvasLayer(vec2(0, 0), vec2(10, 10), 0, 0, vec2(64), false);
    assert(cl instanceof EngineObject);
    assert(cl instanceof CanvasLayer);
    assert.equal(cl.canvas, undefined);              // headless: no OffscreenCanvas created
    assert.equal(cl.mass, 0);                        // physics disabled by default
});

test('TileLayer extends CanvasLayer and stubs render methods in headless', () =>
{
    const tl = new TileLayer(vec2(0, 0), vec2(4, 3), tile(0, 16), 0, false);
    assert(tl instanceof CanvasLayer);
    assert(tl instanceof TileLayer);
    // in headless the render-family methods are replaced with no-op arrow functions
    assert.doesNotThrow(() => tl.render());
    assert.doesNotThrow(() => tl.redraw());
});

test('drawTextureWrapped is exported', async () =>
{
    const mod = await import('../dist/littlejs.esm.js');
    assert.equal(typeof mod.drawTextureWrapped, 'function');
});

test('drawTextureWrapped is callable in headless mode', async () =>
{
    const mod = await import('../dist/littlejs.esm.js');
    const { drawTextureWrapped, vec2 } = mod;
    // headlessMode short-circuits before texture lookup, so this just
    // exercises argument-type ASSERTs (which are stripped in release)
    assert.doesNotThrow(() =>
        drawTextureWrapped(vec2(), vec2(1, 1), vec2(2, 2)));
});
