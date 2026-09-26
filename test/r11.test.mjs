import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, EngineObject3D, TileInfo, Ray3D, vec2, vec3 } = LJS;

// review round 11: a paused tween on a destroyed object, sprites picked as discs facing the ray, a ray of no length
// inside a mesh's box, and objects sharing a measured mesh

LJS.setEngineManualStep(true);
await LJS.engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
new LJS.Render3DPlugin;
const clearObjects = ()=> { LJS.engineObjectsDestroy(); LJS.engineObjectsUpdate(); };

test('a paused property tween stops once its object is destroyed', () =>
{
    const o = new EngineObject(vec2());
    const tween = LJS.tweenProperty(o, 'pos.x', 0, 10, 1).pingPong();
    tween.pause();
    o.destroy();
    LJS.tweenUpdate(.1);
    tween.resume(); // isActive is false while paused, so see whether it is still in the list
    assert.equal(tween.isActive(), false, 'stopped, not held in the active list for good');
    clearObjects();
});

test('a sprite behind the ray is not picked, one ahead is picked at its depth', () =>
{
    const tile = new TileInfo(vec2(), vec2(8));
    const behind = new EngineObject3D(vec3(0, 0, 1), undefined, tile);
    behind.size3D = vec3(3);
    const crate = new EngineObject3D(vec3(0, 0, -5), LJS.buildBox());
    try
    {
        const ray = new Ray3D(vec3(), vec3(0, 0, -1));
        assert.equal(LJS.render3D.pick(ray)?.object, crate, 'the crate ahead, not the sprite around the eye');
        const ahead = new EngineObject3D(vec3(.5, 0, -2), undefined, tile);
        const hit = LJS.render3D.pick(ray);
        assert.ok(hit, 'the sprite ahead is picked');
        assert.equal(hit.object, ahead);
        assert.ok(Math.abs(hit.distance - 2) < 1e-6, 'at its depth: ' + hit.distance);
    }
    finally { clearObjects(); }
});

test('a ray of no length inside a mesh\'s box hits it at 0', () =>
{
    const box = new EngineObject3D(vec3(), LJS.buildBox(vec3(10)));
    try { assert.equal(LJS.render3D.pick(new Ray3D(vec3(1, 1, 1), vec3()))?.distance, 0); }
    finally { clearObjects(); }
});

test('objects made from a mesh already measured do not walk its points again', () =>
{
    const mesh = LJS.buildSphere(1, 16, 8);
    mesh.computeRadius(); // measured, as its upload does
    mesh.dirty = false;
    let walks = 0;
    const getBounds = mesh.getBounds;
    mesh.getBounds = function() { ++walks; return getBounds.call(this); };
    for (let i = 20; i--;) new EngineObject3D(vec3(), mesh);
    assert.equal(walks, 0);
    clearObjects();
});
