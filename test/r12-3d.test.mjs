import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, EngineObject3D, vec3, vec2, Ray3D, TileInfo, TextureInfo, buildBox, buildSphere,
    Mesh, PI } from '../dist/littlejs.esm.js';

// review round 12: a sprite is picked as the quad it draws, and a model's objects do not measure the whole model
// each time one is made

new Render3DPlugin;
const tile = new TileInfo(vec2(), vec2(16), new TextureInfo({ width: 16, height: 16 }));
const pick = (o, ray)=> render3D.pick(ray, [o])?.distance;
const lookFrom = (pos)=>
{
    render3D.camera.pos = pos;
    render3D.camera.lookAt(vec3());
    render3D.updateMatrices(16/9);
};

test('a sprite is picked inside the quad it draws, not a disc through its corners', () =>
{
    const tree = new EngineObject3D(vec3(), undefined, tile);
    tree.size3D = vec3(1, 3, 1);
    for (const from of [vec3(0, 0, 10), vec3(6, 4, 6)])
    {
        lookFrom(from);
        const eye = render3D.camera.pos, right = render3D.cameraRight, up = render3D.cameraUp;
        const at = (x, y)=> pick(tree, new Ray3D(eye, right.scale(x).add(up.scale(y)).subtract(eye).normalize()));
        assert.ok(at(.45, 0) !== undefined, 'inside its width');
        assert.equal(at(.55, 0), undefined, 'past its side');
        assert.equal(at(1.2, 0), undefined, 'well past its side');
        assert.ok(at(0, 1.45) !== undefined, 'inside its height');
        assert.equal(at(0, 1.55), undefined, 'above its top');
    }
    lookFrom(vec3(0, 0, 10));
    tree.rotation3D.z = PI/2; // turned a quarter, 3 wide and 1 tall
    assert.ok(pick(tree, new Ray3D(vec3(1.2, 0, 10), vec3(0, 0, -1))) !== undefined);
    assert.equal(pick(tree, new Ray3D(vec3(0, .8, 10), vec3(0, 0, -1))), undefined);
    tree.rotation3D.z = 0;
    assert.equal(pick(tree, new Ray3D(vec3(0, 0, -1), vec3(0, 0, -1))), undefined, 'behind the ray');
    assert.equal(pick(tree, new Ray3D(vec3(.2, 0, 0), vec3())), 0, 'a ray of no length inside');
    tree.destroy();
});

test('a parent\'s depth scale does not widen a sprite\'s pick', () =>
{
    lookFrom(vec3(0, 0, 10));
    const bus = new EngineObject3D(vec3());
    bus.scale3D = vec3(1, 1, 5);
    const label = new EngineObject3D(vec3(), undefined, tile);
    label.size3D = vec3(1);
    bus.addChild(label);
    assert.equal(pick(label, new Ray3D(vec3(1.5, 0, 10), vec3(0, 0, -1))), undefined);
    assert.ok(pick(label, new Ray3D(vec3(.4, 0, 10), vec3(0, 0, -1))) !== undefined);
    bus.destroy();
});

test('a model measures its whole mesh once for the objects made from it, and again after a transform', async () =>
{
    const { GLTFModel, GLTFPart } = await import('../dist/littlejs.esm.js');
    const model = new GLTFModel([new GLTFPart('ball', buildSphere(2, 16, 8), undefined, undefined, false)]);
    let measured = 0;
    const getBounds = model.mesh.getBounds.bind(model.mesh);
    model.mesh.getBounds = ()=> (++measured, getBounds());
    const objects = [];
    for (let i = 10; i--;)
        objects.push(model.createObject());
    assert.equal(measured, 1, 'measured once for ten objects');
    assert.ok(Math.abs(objects[9].size3D.x - 2) < 1e-6, 'with the size of the model');
    model.transform(vec3(1, 0, 0));
    objects.push(model.createObject());
    assert.equal(measured, 2, 'measured again once it moved');
    for (const o of objects) o.destroy();
});

test('a model hands out a copy of its bounds, so a change to it leaves the model alone', async () =>
{
    const { GLTFModel, GLTFPart } = await import('../dist/littlejs.esm.js');
    const model = new GLTFModel([new GLTFPart('ball', buildSphere(2, 8, 4), undefined, undefined, false)]);
    model.getBounds().max.x = 100;
    assert.ok(Math.abs(model.getBounds().max.x - 1) < 1e-6);
});
